import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField } from "./validation.js";

export async function invokeFileReadCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const path = requiredStringField(definition, input.value, "path", { minLength: 1 });
  if (!path.ok) return path.result;
  const maxBytes = numberField(definition, input.value, "maxBytes");
  if (!maxBytes.ok) return maxBytes.result;
  const readText = namespaceMethod(definition, request, "filesystem", "readText");
  if (!readText.ok) return readText.result;

  return callRuntimePort(definition, readText.value(compactRecord({ path: path.value, maxBytes: maxBytes.value })), {
    portPath: "filesystem.readText",
    metadata: { path: path.value },
  });
}
