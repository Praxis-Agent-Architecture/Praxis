export type JsonRecord = Readonly<Record<string, unknown>>;

export function readRecord(value: unknown): JsonRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonRecord;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isPlainJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((item) => isPlainJsonValue(item, seen));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((item) => isPlainJsonValue(item, seen));
}

export function plainJsonRecord(value: unknown): JsonRecord | undefined {
  const record = readRecord(value);
  if (record === undefined || !isPlainJsonValue(record)) {
    return undefined;
  }

  return record;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function trimmedString(value: unknown): string | undefined {
  const text = stringValue(value)?.trim();
  return text === undefined || text.length === 0 ? undefined : text;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

export function cleanStringList(values: unknown): readonly string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map((value) => trimmedString(value))
        .filter((value): value is string => value !== undefined),
    ),
  ];
}

export function cleanNumberList(values: unknown): readonly number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value): value is number => Number.isSafeInteger(value)))];
}

export function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

export function safeMetadata(value: unknown): JsonRecord {
  return plainJsonRecord(value) ?? {};
}

export function safeRecordKeys(value: unknown): readonly string[] {
  const record = readRecord(value);
  return record === undefined ? [] : cleanStringList(Object.keys(record));
}

export function approvalRecord(context: unknown): JsonRecord | undefined {
  return readRecord(readRecord(context)?.approval);
}
