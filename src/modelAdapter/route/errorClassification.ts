import type { RaxProviderErrorClassification } from "../schema/index.js";

export type RaxProviderErrorClassifyInput = {
  status?: number;
  body?: string;
  headers?: Headers | Record<string, string | undefined>;
  cause?: unknown;
};

export function classifyProviderError(input: RaxProviderErrorClassifyInput): RaxProviderErrorClassification {
  if (isAbortError(input.cause)) return { category: "aborted", retryable: false, status: input.status };
  if (input.status !== undefined) {
    const status = input.status;
    if (status === 401) return { category: "authentication", retryable: false, status };
    if (status === 403) return { category: quotaLike(input.body) ? "quota" : "authorization", retryable: false, status };
    if (status === 404) return { category: "not_found", retryable: false, status };
    if (status === 408) return { category: "timeout", retryable: true, status };
    if (status === 409 || status === 425) return { category: "request", retryable: true, status };
    if (status === 429) return withRetryAfter({ category: quotaLike(input.body) ? "quota" : "rate_limit", retryable: true, status }, input.headers);
    if (status >= 500 && status <= 599) return withRetryAfter({ category: "server", retryable: true, status }, input.headers);
    if (status >= 400 && status <= 499) return { category: "request", retryable: false, status };
    return { category: "unknown", retryable: false, status };
  }
  if (isNetworkError(input.cause)) return { category: "network", retryable: true };
  return { category: "unknown", retryable: false };
}

export function providerErrorDetails(input: RaxProviderErrorClassifyInput): Record<string, unknown> {
  const classification = classifyProviderError(input);
  return {
    ...classification,
    ...(input.body !== undefined ? { bodyPreview: truncateBody(input.body) } : {}),
  };
}

function retryAfterMs(headers: Headers | Record<string, string | undefined> | undefined): number | undefined {
  const value = headerValue(headers, "retry-after");
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function withRetryAfter(
  classification: RaxProviderErrorClassification,
  headers: Headers | Record<string, string | undefined> | undefined,
): RaxProviderErrorClassification {
  const value = retryAfterMs(headers);
  return value === undefined ? classification : { ...classification, retryAfterMs: value };
}

function headerValue(headers: Headers | Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return direct === undefined ? undefined : String(direct);
}

function quotaLike(body: string | undefined): boolean {
  return body !== undefined && /\b(quota|insufficient_quota|billing|credit|balance)\b/iu.test(body);
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === "AbortError" || cause.message.toLowerCase().includes("aborted"));
}

function isNetworkError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /network|fetch|socket|econn|etimedout|enotfound|eai_again|terminated/iu.test(`${cause.name} ${cause.message}`);
}

function truncateBody(body: string, maxChars = 2048): string {
  return body.length > maxChars ? `${body.slice(0, maxChars)}...<truncated>` : body;
}
