import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, stringField } from "./validation.js";

export async function invokeContextLoadCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const ref = stringField(definition, input.value, "ref", { minLength: 1 });
  if (!ref.ok) return ref.result;
  const kind = stringField(definition, input.value, "kind", { allowed: ["artifact", "observation", "session", "workspaceIndex"] });
  if (!kind.ok) return kind.result;
  const query = stringField(definition, input.value, "query");
  if (!query.ok) return query.result;
  const limit = numberField(definition, input.value, "limit");
  if (!limit.ok) return limit.result;
  const load = namespaceMethod(definition, request, "context", "load");
  if (!load.ok) return load.result;

  return callRuntimePort(definition, load.value(compactRecord({
    ref: ref.value,
    kind: kind.value,
    query: query.value,
    limit: limit.value,
  })), {
    portPath: "context.load",
    metadata: compactRecord({ ref: ref.value, kind: kind.value, query: query.value }),
  });
}
