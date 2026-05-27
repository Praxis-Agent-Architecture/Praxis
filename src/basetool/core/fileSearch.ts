import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, requiredStringField, stringField } from "./validation.js";

export async function invokeFileSearchCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const query = requiredStringField(definition, input.value, "query", { minLength: 1 });
  if (!query.ok) return query.result;
  const cwd = stringField(definition, input.value, "cwd");
  if (!cwd.ok) return cwd.result;
  const glob = stringField(definition, input.value, "glob");
  if (!glob.ok) return glob.result;
  const ripgrep = namespaceMethod(definition, request, "search", "ripgrep");
  if (!ripgrep.ok) return ripgrep.result;

  return callRuntimePort(definition, ripgrep.value(compactRecord({ query: query.value, cwd: cwd.value, glob: glob.value })), {
    portPath: "search.ripgrep",
    metadata: { query: query.value, cwd: cwd.value, glob: glob.value },
  });
}
