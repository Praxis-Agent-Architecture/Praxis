import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, recordField, requiredStringField, stringField } from "./validation.js";

export async function invokeMcpUseCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const toolName = requiredStringField(definition, input.value, "toolName", { minLength: 1 });
  if (!toolName.ok) return toolName.result;
  const serverId = stringField(definition, input.value, "serverId");
  if (!serverId.ok) return serverId.result;
  const args = recordField(definition, input.value, "arguments");
  if (!args.ok) return args.result;
  const call = namespaceMethod(definition, request, "mcp", "call");
  if (!call.ok) return call.result;

  return callRuntimePort(definition, call.value(compactRecord({ serverId: serverId.value, toolName: toolName.value, arguments: args.value ?? {} })), {
    portPath: "mcp.call",
    metadata: { serverId: serverId.value, toolName: toolName.value },
  });
}
