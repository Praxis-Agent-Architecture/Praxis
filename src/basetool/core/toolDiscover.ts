import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, stringField } from "./validation.js";

export async function invokeToolDiscoverCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const query = stringField(definition, input.value, "query");
  if (!query.ok) return query.result;
  const layer = stringField(definition, input.value, "layer");
  if (!layer.ok) return layer.result;
  const discover = namespaceMethod(definition, request, "tool", "discover");
  if (!discover.ok) return discover.result;

  return callRuntimePort(definition, discover.value(compactRecord({ query: query.value, layer: layer.value })), {
    portPath: "tool.discover",
    metadata: { query: query.value, layer: layer.value },
  });
}
