import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort, errorResult } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, requiredStringField, stringField } from "./validation.js";

export async function invokeMcpResourcesCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const operation = requiredStringField(definition, input.value, "operation", { minLength: 1 });
  if (!operation.ok) return operation.result;
  const serverId = stringField(definition, input.value, "serverId");
  if (!serverId.ok) return serverId.result;
  const uri = stringField(definition, input.value, "uri");
  if (!uri.ok) return uri.result;

  if (operation.value !== "list" && operation.value !== "read") {
    return errorResult(definition, "INVALID_FIELD_VALUE", "mcp.resources operation must be 'list' or 'read'.");
  }
  if (operation.value === "read" && (uri.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.resources read requires 'uri'.");
  }

  const method = operation.value === "list" ? "listResources" : "readResource";
  const resourcePort = namespaceMethod(definition, request, "mcp", method);
  if (!resourcePort.ok) return resourcePort.result;

  return callRuntimePort(definition, resourcePort.value(compactRecord({ serverId: serverId.value, uri: uri.value })), {
    portPath: `mcp.${method}`,
    metadata: { operation: operation.value, serverId: serverId.value, uri: uri.value },
  });
}
