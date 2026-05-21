import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort, errorResult } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, stringField } from "./validation.js";

export async function invokeSkillLoadCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const name = stringField(definition, input.value, "name");
  if (!name.ok) return name.result;
  const path = stringField(definition, input.value, "path");
  if (!path.ok) return path.result;
  if ((name.value?.trim().length ?? 0) === 0 && (path.value?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "skill.load requires either 'name' or 'path'.");
  }
  const load = namespaceMethod(definition, request, "skill", "load");
  if (!load.ok) return load.result;

  return callRuntimePort(definition, load.value(compactRecord({ name: name.value, path: path.value })), {
    portPath: "skill.load",
    metadata: { name: name.value, path: path.value },
  });
}
