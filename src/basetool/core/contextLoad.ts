import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField, stringField } from "./validation.js";

export async function invokeContextLoadCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const source = requiredStringField(definition, input.value, "source", { minLength: 1 });
  if (!source.ok) return source.result;
  const query = stringField(definition, input.value, "query");
  if (!query.ok) return query.result;
  const maxBytes = numberField(definition, input.value, "maxBytes");
  if (!maxBytes.ok) return maxBytes.result;
  const load = namespaceMethod(definition, request, "context", "load");
  if (!load.ok) return load.result;

  return callRuntimePort(definition, load.value(compactRecord({ source: source.value, query: query.value, maxBytes: maxBytes.value })), {
    portPath: "context.load",
    metadata: { source: source.value },
  });
}
