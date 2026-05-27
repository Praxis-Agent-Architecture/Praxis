import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField } from "./validation.js";

export async function invokeProcessWaitCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const processId = requiredStringField(definition, input.value, "processId", { minLength: 1 });
  if (!processId.ok) return processId.result;
  const timeoutMs = numberField(definition, input.value, "timeoutMs");
  if (!timeoutMs.ok) return timeoutMs.result;
  const wait = namespaceMethod(definition, request, "process", "wait");
  if (!wait.ok) return wait.result;

  return callRuntimePort(definition, wait.value(compactRecord({ processId: processId.value, timeoutMs: timeoutMs.value, context: input.value.context })), {
    portPath: "process.wait",
    metadata: { processId: processId.value },
  });
}
