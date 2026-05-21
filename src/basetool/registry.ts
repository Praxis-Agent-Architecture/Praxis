import type {
  BaseToolDefinition,
  BaseToolHandler,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
  BaseToolRegistry,
  BaseToolRegistryLookupResult,
} from "./types.js";
import { semanticBaseToolCatalog } from "./catalog.js";
import { lookupBaseToolCoreInvoker } from "./core/index.js";

function unavailable(definition: BaseToolDefinition, request: BaseToolInvokeRequest): BaseToolInvokeResult {
  const ports = definition.runtimePorts.join(", ") || "no declared runtime port";
  return {
    ok: false,
    toolId: definition.toolId,
    events: ["basetool.registry.handler.providerUnavailable"],
    error: {
      code: "PROVIDER_UNAVAILABLE",
      message: `basetool ${definition.toolId} requires runtime support (${ports}); no implementation was mounted for this invocation.`,
      publicSafe: true,
      retryable: false,
    },
    metadata: {
      requestedToolId: request.toolId,
      runtimePorts: definition.runtimePorts,
    },
  };
}

function portInvocation(definition: BaseToolDefinition, request: BaseToolInvokeRequest): Promise<BaseToolInvokeResult> | BaseToolInvokeResult {
  const [primaryPort] = definition.runtimePorts;
  if (primaryPort === undefined) return unavailable(definition, request);
  const [namespace, method] = primaryPort.split(".", 2);
  const handler = namespace === undefined || method === undefined ? undefined : request.executor?.[namespace]?.[method];
  if (handler === undefined) return unavailable(definition, request);

  const result = handler(request.input ?? {});
  if (result instanceof Promise) {
    return result.then((value) => ({ ...value, toolId: definition.toolId, events: ["basetool.registry.handler.runtimePort"] }));
  }
  return { ...result, toolId: definition.toolId, events: ["basetool.registry.handler.runtimePort"] };
}

function createHandler(definition: BaseToolDefinition): BaseToolHandler {
  return {
    definition,
    invoke(request) {
      const coreInvoker = lookupBaseToolCoreInvoker(definition.toolId);
      if (coreInvoker !== undefined) return coreInvoker(definition, request);
      return portInvocation(definition, request);
    },
  };
}

export function createBaseToolRegistry(definitions: readonly BaseToolDefinition[] = semanticBaseToolCatalog): BaseToolRegistry {
  const handlers = new Map(definitions.map((definition) => [definition.toolId, createHandler(definition)]));
  return {
    all() {
      return definitions;
    },
    lookup(toolId: string): BaseToolRegistryLookupResult {
      const handler = handlers.get(toolId.trim());
      if (handler === undefined) {
        return {
          ok: false,
          error: {
            code: "BASE_TOOL_NOT_FOUND",
            message: `basetool ${toolId.trim()} is not present in the semantic registry`,
            publicSafe: true,
          },
        };
      }
      return { ok: true, definition: handler.definition, handler };
    },
    lookupHandler(toolId: string): BaseToolRegistryLookupResult {
      return this.lookup(toolId);
    },
  };
}

export const builtinBaseToolHandlers = Object.freeze(
  Object.fromEntries(semanticBaseToolCatalog.map((definition) => [definition.toolId, createHandler(definition)])),
);

export const baseToolRegistryDescriptor = {
  surface: "basetool.registry",
  semanticCatalog: true,
  builtinToolCountTarget: semanticBaseToolCatalog.length,
  dynamicToolsSupported: "future-mcp-plugin-registry",
} as const;
