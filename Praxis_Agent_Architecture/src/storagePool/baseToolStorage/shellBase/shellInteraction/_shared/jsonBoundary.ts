export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonRecord(value: unknown): JsonRecord | undefined {
  return isJsonRecord(value) ? value : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function trimmedString(value: unknown): string | undefined {
  const text = stringValue(value)?.trim();
  return text === undefined || text.length === 0 ? undefined : text;
}

export function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => trimmedString(item) ?? "").filter(Boolean))];
}

export type StringArrayBoundaryResult =
  | { ok: true; values: readonly string[] }
  | { ok: false };

export function optionalStringArray(value: unknown, options: { trim?: boolean; allowEmpty?: boolean } = {}): StringArrayBoundaryResult {
  if (value === undefined) {
    return { ok: true, values: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const trim = options.trim === true;
  const allowEmpty = options.allowEmpty === true;
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false };
    }

    const normalized = trim ? item.trim() : item;
    if (!allowEmpty && normalized.length === 0) {
      return { ok: false };
    }

    output.push(normalized);
  }

  return { ok: true, values: [...new Set(output)] };
}

export function hasAffirmativeGuard(context: unknown): boolean {
  const guard = jsonRecord(jsonRecord(context)?.guard);
  return guard?.allowed === true || guard?.accepted === true;
}

export function explicitGuardDenied(context: unknown): boolean {
  const guard = jsonRecord(jsonRecord(context)?.guard);
  return guard?.allowed === false || guard?.accepted === false;
}

export function runtimeIdIsMalformed(context: unknown): boolean {
  const runtimeId = jsonRecord(context)?.runtimeId;
  return runtimeId !== undefined && typeof runtimeId !== "string";
}

export function contextAuditMetadata(context: unknown): Readonly<Record<string, unknown>> {
  return jsonRecord(jsonRecord(context)?.auditMetadata) ?? {};
}
