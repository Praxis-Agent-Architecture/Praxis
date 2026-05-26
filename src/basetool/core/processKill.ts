import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, requiredStringField, stringField } from "./validation.js";

export async function invokeProcessKillCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const processId = requiredStringField(definition, input.value, "processId", { minLength: 1 });
  if (!processId.ok) return processId.result;
  const signal = stringField(definition, input.value, "signal");
  if (!signal.ok) return signal.result;
  const kill = namespaceMethod(definition, request, "process", "kill");
  if (!kill.ok) return kill.result;

  return callRuntimePort(definition, kill.value(compactRecord({ processId: processId.value, signal: signal.value ?? "SIGTERM", context: input.value.context })), {
    portPath: "process.kill",
    metadata: { processId: processId.value, signal: signal.value ?? "SIGTERM" },
  });
}
