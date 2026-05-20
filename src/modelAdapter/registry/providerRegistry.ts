import { createRaxModelClient, defaultRaxModelClient, type RaxModelClient, type RaxModelRoute, type RaxTransport } from "../route/index.js";
import type { RaxAuthRef } from "../schema/index.js";
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
}

export const defaultRaxProviderRegistry = new RaxProviderRegistry();

export function createProviderAuthRef(provider: RaxProviderDefinition, options: RaxProviderAuthRefOptions = {}): RaxAuthRef {
  const profile = provider.auth ?? {
    type: provider.authEnv?.length ? "api_key" : "none",
    env: provider.authEnv,
  };
  if (profile.type === "none") return { type: "none" };
  const env = options.value !== undefined ? options.env : options.env ?? profile.env?.find((name) => process.env[name] !== undefined) ?? profile.env?.[0];
  if (profile.type === "bearer") return { type: "bearer", env, value: options.value };
  return { type: "api_key", env, value: options.value, header: profile.header };
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
