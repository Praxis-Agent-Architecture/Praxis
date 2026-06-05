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
  const uriPrefix = stringField(definition, input.value, "uriPrefix");
  if (!uriPrefix.ok) return uriPrefix.result;
  const cursor = stringField(definition, input.value, "cursor");
  if (!cursor.ok) return cursor.result;
  const subscriptionId = stringField(definition, input.value, "subscriptionId");
  if (!subscriptionId.ok) return subscriptionId.result;

  if (!["list", "read", "subscribe", "unsubscribe"].includes(operation.value)) {
    return errorResult(definition, "INVALID_FIELD_VALUE", "mcp.resources operation must be 'list', 'read', 'subscribe', or 'unsubscribe'.");
  }
  if (operation.value === "read" && (uri.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.resources read requires 'uri'.");
  }
  if (operation.value === "subscribe" && (uri.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.resources subscribe requires 'uri'.");
  }
  if (operation.value === "unsubscribe" && (uri.value?.trim().length ?? 0) === 0 && (subscriptionId.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.resources unsubscribe requires 'uri' or 'subscriptionId'.");
  }

  const method = operation.value === "list"
    ? "listResources"
    : operation.value === "read"
      ? "readResource"
      : operation.value;
  const resourcePort = namespaceMethod(definition, request, "mcp", method);
  if (!resourcePort.ok) return resourcePort.result;

  return callRuntimePort(definition, resourcePort.value(compactRecord({
    serverId: serverId.value,
    uri: uri.value,
    uriPrefix: uriPrefix.value,
    cursor: cursor.value,
    subjectType: operation.value === "subscribe" ? "resource" : undefined,
    subject: operation.value === "subscribe" ? uri.value : undefined,
    subscriptionId: subscriptionId.value,
  })), {
    portPath: `mcp.${method}`,
    metadata: {
      operation: operation.value,
      serverId: serverId.value,
      uri: uri.value,
      uriPrefix: uriPrefix.value,
      cursor: cursor.value,
      subscriptionId: subscriptionId.value,
    },
  });
}
