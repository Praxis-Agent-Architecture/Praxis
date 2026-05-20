import type {
  BaseToolExecutorResult,
} from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";

export function isShellGenerationRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function shellGenerationInputEnvelope(
  request: unknown,
): { input: Readonly<Record<string, unknown>>; context?: Readonly<Record<string, unknown>> } {
  if (!isShellGenerationRecord(request)) {
    return { input: {} };
  }

  const { context, executor: _executor, provider: _provider, preferredProvider: _preferredProvider, ...input } = request;
  return {
    input,
    context: isShellGenerationRecord(context) ? context : undefined,
  };
}

export function requireShellGenerationExecutorOutput(
  result: BaseToolExecutorResult<Readonly<Record<string, unknown>>>,
): Readonly<Record<string, unknown>> {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (typeof result.output !== "object" || result.output === null || Array.isArray(result.output)) {
    throw new Error("Shell generation executor returned an invalid output envelope");
  }

  return result.output;
}

export function withShellGenerationProviderFlags(
  output: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...output,
    dryRun: false,
    providerCalled: true,
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

function invalidOutput(field: string): Error {
  return new Error(`Shell generation executor returned an invalid ${field}`);
}

export function requireStringField(
  output: Readonly<Record<string, unknown>>,
  field: string,
  options: { nonEmpty?: boolean } = {},
): string {
  const value = output[field];
  if (typeof value !== "string" || (options.nonEmpty === true && value.trim().length === 0)) {
    throw invalidOutput(field);
  }
  return value;
}

export function optionalStringField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = output[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidOutput(field);
  }
  return value;
}

export function requireNumberField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): number {
  const value = output[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidOutput(field);
  }
  return value;
}

export function requireBooleanField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): boolean {
  const value = output[field];
  if (typeof value !== "boolean") {
    throw invalidOutput(field);
  }
  return value;
}

export function requireStringArrayField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): readonly string[] {
  const value = output[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw invalidOutput(field);
  }
  return value;
}

export function optionalStringArrayField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): readonly string[] | undefined {
  const value = output[field];
  if (value === undefined) {
    return undefined;
  }
  return requireStringArrayField(output, field);
}

export function requireRecordField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> {
  const value = output[field];
  if (!isShellGenerationRecord(value)) {
    throw invalidOutput(field);
  }
  return value;
}

export function optionalRecordField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = output[field];
  if (value === undefined) {
    return undefined;
  }
  if (!isShellGenerationRecord(value)) {
    throw invalidOutput(field);
  }
  return value;
}

export function requireLiteralField<const Value extends string>(
  output: Readonly<Record<string, unknown>>,
  field: string,
  values: readonly Value[],
): Value {
  const value = output[field];
  if (typeof value !== "string" || !isStringLiteral(value, values)) {
    throw invalidOutput(field);
  }
  return value;
}

export function requireRecordArrayField(
  output: Readonly<Record<string, unknown>>,
  field: string,
): readonly Readonly<Record<string, unknown>>[] {
  const value = output[field];
  if (!Array.isArray(value) || value.some((entry) => !isShellGenerationRecord(entry))) {
    throw invalidOutput(field);
  }
  return value;
}

function isStringLiteral<const Value extends string>(value: string, values: readonly Value[]): value is Value {
  return values.some((candidate) => candidate === value);
}

export function requireStringLiteralArrayField<const Value extends string>(
  output: Readonly<Record<string, unknown>>,
  field: string,
  values: readonly Value[],
): readonly Value[] {
  const entries = requireStringArrayField(output, field);
  const normalized: Value[] = [];
  for (const entry of entries) {
    if (!isStringLiteral(entry, values)) {
      throw invalidOutput(field);
    }
    normalized.push(entry);
  }
  return normalized;
}

export function requireProviderResultEnvelope(
  result: unknown,
  toolId: string,
): Readonly<Record<string, unknown>> & { ok: boolean } {
  if (
    !isShellGenerationRecord(result) ||
    result.toolId !== toolId ||
    typeof result.ok !== "boolean"
  ) {
    throw invalidOutput("provider result envelope");
  }

  return result as Readonly<Record<string, unknown>> & { ok: boolean };
}

export function requireProviderAudit(
  result: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const audit = result.audit;
  if (!Array.isArray(audit) || audit.some((entry) => !isShellGenerationRecord(entry))) {
    throw invalidOutput("provider result audit");
  }
  return audit;
}

export function requireProviderEvents(
  result: Readonly<Record<string, unknown>>,
): readonly string[] {
  return requireStringArrayField(result, "events");
}

export function requireProviderFailureError<const Code extends string, const Boundary extends string>(
  result: Readonly<Record<string, unknown>>,
  allowedCodes: readonly Code[],
  allowedBoundaries: readonly Boundary[],
): {
  code: Code;
  message: string;
  boundary: Boundary;
  publicSafe: true;
  internalDetailExposed: false;
} {
  const error = requireRecordField(result, "error");
  const code = requireLiteralField(error, "code", allowedCodes);
  const message = requireStringField(error, "message", { nonEmpty: true });
  const boundary = requireLiteralField(error, "boundary", allowedBoundaries);
  if (error.publicSafe !== true || error.internalDetailExposed !== false) {
    throw invalidOutput("provider result error safety flags");
  }
  return {
    code,
    message,
    boundary,
    publicSafe: true,
    internalDetailExposed: false,
  };
}
