import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField, stringField } from "./validation.js";

export async function invokeShellRunCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const command = requiredStringField(definition, input.value, "command", { minLength: 1 });
  if (!command.ok) return command.result;
  const cwd = stringField(definition, input.value, "cwd");
  if (!cwd.ok) return cwd.result;
  const timeoutMs = numberField(definition, input.value, "timeoutMs");
  if (!timeoutMs.ok) return timeoutMs.result;
  const run = namespaceMethod(definition, request, "shell", "run");
  if (!run.ok) return run.result;

  return callRuntimePort(definition, run.value(compactRecord({
    command: command.value,
    cwd: cwd.value,
    timeoutMs: timeoutMs.value,
    context: input.value.context,
  })), {
    portPath: "shell.run",
    metadata: { command: command.value, cwd: cwd.value },
  });
}
