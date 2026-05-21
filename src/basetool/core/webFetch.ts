import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField } from "./validation.js";

export async function invokeWebFetchCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const url = requiredStringField(definition, input.value, "url", { minLength: 1 });
  if (!url.ok) return url.result;
  const maxBytes = numberField(definition, input.value, "maxBytes");
  if (!maxBytes.ok) return maxBytes.result;
  const fetch = namespaceMethod(definition, request, "network", "fetch");
  if (!fetch.ok) return fetch.result;

  return callRuntimePort(definition, fetch.value(compactRecord({ url: url.value, maxBytes: maxBytes.value })), {
    portPath: "network.fetch",
    metadata: { url: url.value, maxBytes: maxBytes.value },
  });
}
