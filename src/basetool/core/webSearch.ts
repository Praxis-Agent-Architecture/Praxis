import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, requiredStringField } from "./validation.js";

export async function invokeWebSearchCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const query = requiredStringField(definition, input.value, "query", { minLength: 1 });
  if (!query.ok) return query.result;
  const maxResults = numberField(definition, input.value, "maxResults");
  if (!maxResults.ok) return maxResults.result;
  const search = namespaceMethod(definition, request, "network", "search");
  if (!search.ok) return search.result;

  return callRuntimePort(definition, search.value(compactRecord({ query: query.value, maxResults: maxResults.value })), {
    portPath: "network.search",
    metadata: { query: query.value, maxResults: maxResults.value },
  });
}
