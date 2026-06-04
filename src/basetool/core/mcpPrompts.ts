import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort, errorResult } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, recordField, requiredStringField, stringField } from "./validation.js";

export async function invokeMcpPromptsCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const operation = requiredStringField(definition, input.value, "operation", { minLength: 1 });
  if (!operation.ok) return operation.result;
  const serverId = stringField(definition, input.value, "serverId");
  if (!serverId.ok) return serverId.result;
  const cursor = stringField(definition, input.value, "cursor");
  if (!cursor.ok) return cursor.result;
  const name = stringField(definition, input.value, "name");
  if (!name.ok) return name.result;
  const args = recordField(definition, input.value, "arguments");
  if (!args.ok) return args.result;

  if (operation.value !== "list" && operation.value !== "get") {
    return errorResult(definition, "INVALID_FIELD_VALUE", "mcp.prompts operation must be 'list' or 'get'.");
  }
  if (operation.value === "get" && (name.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.prompts get requires 'name'.");
  }

  if (operation.value === "list") {
    const listPrompts = namespaceMethod(definition, request, "mcp", "listPrompts");
    if (!listPrompts.ok) return listPrompts.result;
    return callRuntimePort(definition, listPrompts.value(compactRecord({ serverId: serverId.value, cursor: cursor.value })), {
      portPath: "mcp.listPrompts",
      metadata: { operation: operation.value, serverId: serverId.value, cursor: cursor.value },
    });
  }

  const getPrompt = namespaceMethod(definition, request, "mcp", "getPrompt");
  if (!getPrompt.ok) return getPrompt.result;
  return callRuntimePort(definition, getPrompt.value(compactRecord({
    serverId: serverId.value,
    name: name.value,
    arguments: args.value ?? {},
  })), {
    portPath: "mcp.getPrompt",
    metadata: { operation: operation.value, serverId: serverId.value, name: name.value },
  });
}
