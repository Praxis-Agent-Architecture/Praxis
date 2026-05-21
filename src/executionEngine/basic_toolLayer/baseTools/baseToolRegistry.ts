import { builtinBaseToolHandlers } from "./builtinBaseToolHandlers.js";
import type { BaseToolDefinition, BaseToolHandler } from "./baseToolDefinition.js";

export type BaseToolLookupError = {
  code: "TOOL_NOT_FOUND";
  message: string;
  publicSafe: true;
};

export type BaseToolLookupResult =
  | { ok: true; definition: BaseToolDefinition; handler: BaseToolHandler }
  | { ok: false; error: BaseToolLookupError };

export type BaseToolRegistry = {
  listDefinitions(): readonly BaseToolDefinition[];
  lookup(toolId: string): BaseToolLookupResult;
  lookupHandler(toolId: string): BaseToolLookupResult;
};

export const baseToolRegistryDescriptor = {
  surface: "agentCore.basicTool.registry.compat",
  source: "src/toolBase",
  restoredOldImplementation: false,
  builtinToolCountTarget: 0,
} as const;

export function createBaseToolRegistry(
  handlers: readonly BaseToolHandler[] = builtinBaseToolHandlers,
): BaseToolRegistry {
  const byId = new Map(handlers.map((handler) => [handler.definition.toolId, handler]));

  function lookup(toolId: string): BaseToolLookupResult {
    const normalizedToolId = toolId.trim();
    const handler = byId.get(normalizedToolId);
    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `BaseTool ${normalizedToolId} is not registered in the rewritten tool layer`,
          publicSafe: true,
        },
      };
    }
    return { ok: true, definition: handler.definition, handler };
  }

  return {
    listDefinitions: () => handlers.map((handler) => handler.definition),
    lookup,
    lookupHandler: lookup,
  };
}
