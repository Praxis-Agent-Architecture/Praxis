import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { inputRecord, namespaceMethod, requiredStringField } from "./validation.js";

export async function invokeToolDescribeCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const toolId = requiredStringField(definition, input.value, "toolId", { minLength: 1 });
  if (!toolId.ok) return toolId.result;
  const describe = namespaceMethod(definition, request, "tool", "describe");
  if (!describe.ok) return describe.result;

  return callRuntimePort(definition, describe.value({ toolId: toolId.value }), {
    portPath: "tool.describe",
    metadata: { toolId: toolId.value },
  });
}
