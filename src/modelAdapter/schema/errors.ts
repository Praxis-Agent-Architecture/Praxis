export type RaxModelErrorCode =
  | "route_not_found"
  | "provider_not_found"
  | "auth_missing"
  | "request_invalid"
  | "transport_error"
  | "provider_error"
  | "decode_error"
  | "tool_schema_invalid"
  | "aborted";

export class RaxModelError extends Error {
  readonly code: RaxModelErrorCode;
  readonly causeValue: unknown;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, options: { code: RaxModelErrorCode; cause?: unknown; details?: Record<string, unknown> }) {
    super(message);
    this.name = "RaxModelError";
    this.code = options.code;
    this.causeValue = options.cause;
    this.details = options.details;
  }
}

export function raxModelError(
  code: RaxModelErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): RaxModelError {
  return new RaxModelError(message, { code, details, cause });
}

