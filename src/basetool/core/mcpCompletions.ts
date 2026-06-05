import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort, errorResult } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, recordField, stringField } from "./validation.js";

function stringRecordValue(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function hasOnlyStringValues(value: Record<string, unknown>): boolean {
  return Object.values(value).every((field) => typeof field === "string");
}

export async function invokeMcpCompletionsCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const serverId = stringField(definition, input.value, "serverId");
  if (!serverId.ok) return serverId.result;
  const ref = recordField(definition, input.value, "ref");
  if (!ref.ok) return ref.result;
  const argument = recordField(definition, input.value, "argument");
  if (!argument.ok) return argument.result;
  const context = recordField(definition, input.value, "context");
  if (!context.ok) return context.result;

  if (ref.value === undefined) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions requires 'ref'.");
  }
  if (argument.value === undefined) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions requires 'argument'.");
  }

  const refType = stringRecordValue(ref.value, "type");
  if (refType !== "ref/prompt" && refType !== "ref/resource") {
    return errorResult(definition, "INVALID_FIELD_VALUE", "mcp.completions ref.type must be 'ref/prompt' or 'ref/resource'.");
  }
  if (refType === "ref/prompt" && (stringRecordValue(ref.value, "name")?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions prompt ref requires 'name'.");
  }
  if (refType === "ref/resource" && (stringRecordValue(ref.value, "uri")?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions resource ref requires 'uri'.");
  }

  const argumentName = stringRecordValue(argument.value, "name");
  const argumentValue = stringRecordValue(argument.value, "value");
  if ((argumentName?.trim().length ?? 0) === 0) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions argument requires non-empty 'name'.");
  }
  if (argumentValue === undefined) {
    return errorResult(definition, "MISSING_REQUIRED_FIELD", "mcp.completions argument requires string 'value'.");
  }

  const contextArguments = context.value?.arguments;
  if (contextArguments !== undefined && (typeof contextArguments !== "object" || contextArguments === null || Array.isArray(contextArguments) || !hasOnlyStringValues(contextArguments as Record<string, unknown>))) {
    return errorResult(definition, "INVALID_FIELD_TYPE", "mcp.completions context.arguments must be a JSON object with string values.");
  }

  const complete = namespaceMethod(definition, request, "mcp", "complete");
  if (!complete.ok) return complete.result;
  return callRuntimePort(definition, complete.value(compactRecord({
    serverId: serverId.value,
    ref: ref.value,
    argument: argument.value,
    context: context.value,
  })), {
    portPath: "mcp.complete",
    metadata: {
      serverId: serverId.value,
      refType,
      argumentName,
    },
  });
}
