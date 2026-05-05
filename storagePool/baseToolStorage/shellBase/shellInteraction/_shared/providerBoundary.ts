import { jsonRecord, optionalStringArray, stringValue } from "./jsonBoundary.js";

export type ProviderValidation<T> =
  | { ok: true; output: T }
  | { ok: false; message: string };

export function providerRecord(value: unknown): ProviderValidation<Record<string, unknown>> {
  const record = jsonRecord(value);
  if (record === undefined) {
    return { ok: false, message: "provider output must be an object" };
  }

  return { ok: true, output: record };
}

export function booleanField(record: Readonly<Record<string, unknown>>, field: string): boolean | undefined {
  const value = record[field];
  return typeof value === "boolean" ? value : undefined;
}

export function finiteNumberField(record: Readonly<Record<string, unknown>>, field: string): number | undefined {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function nonNegativeIntegerField(record: Readonly<Record<string, unknown>>, field: string): number | undefined {
  const value = finiteNumberField(record, field);
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function stringField(record: Readonly<Record<string, unknown>>, field: string): string | undefined {
  return stringValue(record[field]);
}

export function stringArrayField(record: Readonly<Record<string, unknown>>, field: string): readonly string[] | undefined {
  if (record[field] === undefined) {
    return undefined;
  }

  const result = optionalStringArray(record[field]);
  if (!result.ok) {
    return undefined;
  }

  return result.values;
}

export function providerRejectedMessage(toolId: string): string {
  return `${toolId} provider rejected the request`;
}

export function providerContractMessage(toolId: string): string {
  return `${toolId} provider returned an invalid runtime-owned result`;
}
