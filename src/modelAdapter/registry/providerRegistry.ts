import { createRaxModelClient, defaultRaxModelClient, type RaxModelClient, type RaxModelRoute, type RaxTransport } from "../route/index.js";
import { raxModelError, type RaxAuthRef, type RaxContentPart, type RaxGenerationOptions, type RaxModelMessage, type RaxModelRequest } from "../schema/index.js";
import type { RaxProviderCompat } from "./compatRegistry.js";
import { defaultRaxCompatRegistry, RaxCompatRegistry } from "./compatRegistry.js";
import type { RaxModelCatalogEntry } from "./modelCatalog.js";
import { defaultRaxModelCatalog, RaxModelCatalog } from "./modelCatalog.js";

export type RaxProviderAuthProfile = {
  type: Extract<RaxAuthRef["type"], "api_key" | "bearer" | "none">;
  env?: string[];
  header?: string;
};

export type RaxProviderDefinition = {
  id: string;
  displayName: string;
  routes: RaxModelRoute[];
  compat: RaxProviderCompat;
  models?: RaxModelCatalogEntry[];
  authEnv?: string[];
  auth?: RaxProviderAuthProfile;
  metadata?: Record<string, unknown>;
};

export type RaxProviderAuthRefOptions = {
  env?: string;
  value?: string;
};

export type RaxProviderRegistryOptions = {
  client?: RaxModelClient;
  compat?: RaxCompatRegistry;
  catalog?: RaxModelCatalog;
};

export type RaxProviderClientOptions = {
  transport?: RaxTransport | ((route: RaxModelRoute, provider: RaxProviderDefinition) => RaxTransport | undefined);
  baseUrls?: Record<string, string>;
};

export type RaxModelSelectionRequest = {
  provider: string;
  model: string;
  route?: string;
  requiresTools?: boolean;
  requiresReasoning?: boolean;
  requiresVision?: boolean;
  auth?: RaxProviderAuthRefOptions;
};

export type RaxModelSelection = {
  provider: RaxProviderDefinition;
  route: RaxModelRoute;
  model?: RaxModelCatalogEntry;
  compat: RaxProviderCompat;
  auth: RaxAuthRef;
};

export type RaxGenerationLimitAction = {
  field: "maxOutputTokens";
  requested: number;
  applied: number;
  reason: "model.maxOutputTokens";
};

export class RaxProviderRegistry {
  readonly providers = new Map<string, RaxProviderDefinition>();

  constructor(
    readonly client: RaxModelClient = defaultRaxModelClient,
    readonly compat: RaxCompatRegistry = defaultRaxCompatRegistry,
    readonly catalog: RaxModelCatalog = defaultRaxModelCatalog,
  ) {}

  register(provider: RaxProviderDefinition): void {
    this.providers.set(provider.id, provider);
    this.compat.register(provider.compat);
    for (const route of provider.routes) this.client.registerRoute(route);
    for (const model of provider.models ?? []) this.catalog.register(model);
  }

  get(providerId: string): RaxProviderDefinition | undefined {
    return this.providers.get(providerId);
  }

  list(): RaxProviderDefinition[] {
    return [...this.providers.values()];
  }

  authRef(providerId: string, options: RaxProviderAuthRefOptions = {}): RaxAuthRef | undefined {
    const provider = this.get(providerId);
    if (!provider) return undefined;
    return createProviderAuthRef(provider, options);
  }

  selectModelRoute(request: RaxModelSelectionRequest): RaxModelSelection {
    const provider = this.get(request.provider);
    if (!provider) throw raxModelError("provider_not_found", `No provider registered for ${request.provider}`, { provider: request.provider });
    const model = this.catalog.get(provider.id, request.model);
    const compat = this.compat.get(provider.id) ?? provider.compat;
    assertModelCapabilities(request, model, compat);
    const route = selectProviderRoute(provider, request.route, model?.protocolId ?? compat.protocolId);
    return {
      provider,
      route,
      model,
      compat,
      auth: createProviderAuthRef(provider, request.auth),
    };
  }

  completeModelRequest(request: RaxModelRequest, selectionOptions: Omit<RaxModelSelectionRequest, "provider" | "model" | "route"> = {}): RaxModelRequest {
    const selection = this.selectModelRoute({
      provider: String(request.model.provider),
      model: String(request.model.model),
      route: request.model.route,
      requiresTools: request.tools !== undefined && request.tools.length > 0,
      requiresReasoning: request.generation?.reasoningEffort !== undefined,
      requiresVision: requestUsesVision(request),
      ...selectionOptions,
    });
    const generationResult = applyModelGenerationLimits(request.generation, selection.model);
    return {
      ...request,
      ...(generationResult.generation !== undefined ? { generation: generationResult.generation } : {}),
      model: {
        ...request.model,
        route: selection.route.id,
        auth: request.model.auth ?? selection.auth,
      },
      metadata: {
        ...request.metadata,
        provider: {
          id: selection.provider.id,
          routeId: selection.route.id,
          protocolId: selection.route.protocol.id,
          model: selection.model,
          compat: selection.compat,
          limits: {
            ...(selection.model?.contextWindow !== undefined ? { contextWindow: selection.model.contextWindow } : {}),
            ...(selection.model?.maxOutputTokens !== undefined ? { maxOutputTokens: selection.model.maxOutputTokens } : {}),
          },
          ...(generationResult.appliedLimits.length > 0 ? { appliedLimits: generationResult.appliedLimits } : {}),
        },
      },
    };
  }
}

export const defaultRaxProviderRegistry = new RaxProviderRegistry();

export function createProviderAuthRef(provider: RaxProviderDefinition, options: RaxProviderAuthRefOptions = {}): RaxAuthRef {
  const profile = provider.auth ?? {
    type: provider.authEnv?.length ? "api_key" : "none",
    env: provider.authEnv,
  };
  if (profile.type === "none") return { type: "none" };
  const env = options.value !== undefined ? options.env : options.env ?? profile.env?.find((name) => process.env[name] !== undefined) ?? profile.env?.[0];
  if (profile.type === "bearer") {
    return {
      type: "bearer",
      ...(env !== undefined ? { env } : {}),
      ...(options.value !== undefined ? { value: options.value } : {}),
    };
  }
  return {
    type: "api_key",
    ...(env !== undefined ? { env } : {}),
    ...(options.value !== undefined ? { value: options.value } : {}),
    ...(profile.header !== undefined ? { header: profile.header } : {}),
  };
}

export function createRaxProviderRegistry(
  providers: readonly RaxProviderDefinition[] = [],
  options: RaxProviderRegistryOptions = {},
): RaxProviderRegistry {
  const registry = new RaxProviderRegistry(
    options.client ?? createRaxModelClient(),
    options.compat ?? new RaxCompatRegistry(),
    options.catalog ?? new RaxModelCatalog(),
  );
  for (const provider of providers) registry.register(provider);
  return registry;
}

export function createRaxModelClientFromProviders(
  providers: readonly RaxProviderDefinition[],
  options: RaxProviderClientOptions = {},
): RaxModelClient {
  const routes = providers.flatMap((provider) => provider.routes.map((route) => {
    const transport = typeof options.transport === "function" ? options.transport(route, provider) : options.transport;
    const baseUrl = options.baseUrls?.[route.id] ?? options.baseUrls?.[provider.id] ?? route.endpoint.baseUrl;
    return {
      ...route,
      endpoint: { ...route.endpoint, baseUrl },
      ...(transport ? { transport } : {}),
    } satisfies RaxModelRoute;
  }));
  return createRaxModelClient(routes);
}

function selectProviderRoute(provider: RaxProviderDefinition, routeId: string | undefined, protocolId: string): RaxModelRoute {
  const route = routeId !== undefined
    ? provider.routes.find((candidate) => candidate.id === routeId)
    : provider.routes.find((candidate) => candidate.protocol.id === protocolId) ?? provider.routes[0];
  if (!route) {
    throw raxModelError("route_not_found", `No route registered for provider ${provider.id}`, { provider: provider.id, routeId, protocolId });
  }
  return route;
}

function assertModelCapabilities(
  request: RaxModelSelectionRequest,
  model: RaxModelCatalogEntry | undefined,
  compat: RaxProviderCompat,
): void {
  const details = { provider: request.provider, model: request.model };
  if (request.requiresTools && (model?.supportsTools ?? compat.supportsTools) !== true) {
    throw raxModelError("request_invalid", `Model ${request.provider}:${request.model} does not support tools`, { ...details, capability: "tools" });
  }
  if (request.requiresReasoning && model?.supportsReasoning === false) {
    throw raxModelError("request_invalid", `Model ${request.provider}:${request.model} does not support reasoning`, { ...details, capability: "reasoning" });
  }
  if (request.requiresVision && model?.supportsVision === false) {
    throw raxModelError("request_invalid", `Model ${request.provider}:${request.model} does not support vision`, { ...details, capability: "vision" });
  }
}

function requestUsesVision(request: RaxModelRequest): boolean {
  return request.messages.some((message) => contentUsesVision(message.content));
}

function contentUsesVision(content: RaxModelMessage["content"]): boolean {
  return Array.isArray(content) && content.some((part) => partUsesVision(part));
}

function partUsesVision(part: RaxContentPart): boolean {
  if (part.type === "image") return true;
  if (part.type !== "tool_result") return false;
  return Array.isArray(part.content) && part.content.some((child) => child.type === "image");
}

function applyModelGenerationLimits(
  generation: RaxGenerationOptions | undefined,
  model: RaxModelCatalogEntry | undefined,
): { generation?: RaxGenerationOptions; appliedLimits: RaxGenerationLimitAction[] } {
  const appliedLimits: RaxGenerationLimitAction[] = [];
  if (generation?.maxOutputTokens === undefined || model?.maxOutputTokens === undefined) return { generation, appliedLimits };
  if (generation.maxOutputTokens <= model.maxOutputTokens) return { generation, appliedLimits };
  appliedLimits.push({
    field: "maxOutputTokens",
    requested: generation.maxOutputTokens,
    applied: model.maxOutputTokens,
    reason: "model.maxOutputTokens",
  });
  return {
    generation: {
      ...generation,
      maxOutputTokens: model.maxOutputTokens,
    },
    appliedLimits,
  };
}
