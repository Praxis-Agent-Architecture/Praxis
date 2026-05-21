import type {
  BaseToolDefinition,
  BaseToolExecutorNamespace,
  BaseToolExecutorResult,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
} from "../types.js";
import { errorResult, providerUnavailable } from "./results.js";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; result: BaseToolInvokeResult };

export function inputRecord(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): ValidationResult<Record<string, unknown>> {
  const raw = request.input ?? request.arguments ?? {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_INPUT", "Tool input must be a JSON object."),
    };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

export function stringField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean; minLength?: number } = {},
): ValidationResult<string | undefined> {
  const value = input[key];
  if (value === undefined) {
    if (options.required === true) {
      return {
        ok: false,
        result: errorResult(definition, "MISSING_REQUIRED_FIELD", `Missing required string field '${key}'.`),
      };
    }
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_FIELD_TYPE", `Field '${key}' must be a string.`),
    };
  }
  const minLength = options.minLength ?? 0;
  if (value.trim().length < minLength) {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_FIELD_VALUE", `Field '${key}' must be a non-empty string.`),
    };
  }
  return { ok: true, value };
}

export function requiredStringField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
  options: { minLength?: number } = {},
): ValidationResult<string> {
  const result = stringField(definition, input, key, { ...options, required: true });
  if (!result.ok) return result;
  if (result.value === undefined) {
    return {
      ok: false,
      result: errorResult(definition, "MISSING_REQUIRED_FIELD", `Missing required string field '${key}'.`),
    };
  }
  return { ok: true, value: result.value };
}

export function numberField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
): ValidationResult<number | undefined> {
  const value = input[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_FIELD_TYPE", `Field '${key}' must be a finite number.`),
    };
  }
  return { ok: true, value };
}

export function objectArrayField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
): ValidationResult<readonly Record<string, unknown>[] | undefined> {
  const value = input[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || !value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_FIELD_TYPE", `Field '${key}' must be an array of JSON objects.`),
    };
  }
  return { ok: true, value: value as readonly Record<string, unknown>[] };
}

export function recordField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
): ValidationResult<Record<string, unknown> | undefined> {
  const value = input[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      result: errorResult(definition, "INVALID_FIELD_TYPE", `Field '${key}' must be a JSON object.`),
    };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

export function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function namespaceMethod(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
  namespace: string,
  method: string,
): ValidationResult<(input: unknown) => BaseToolExecutorResult | Promise<BaseToolExecutorResult>> {
  const service: BaseToolExecutorNamespace | undefined = request.executor?.[namespace];
  const handler = service?.[method];
  if (handler === undefined) {
    return { ok: false, result: providerUnavailable(definition, `${namespace}.${method}`) };
  }
  return { ok: true, value: handler as (input: unknown) => BaseToolExecutorResult | Promise<BaseToolExecutorResult> };
}
