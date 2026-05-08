/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / 错误分类。
 * 核心目的：把各 provider transport/caller 错误整理成统一 public-safe 分类。
 * 能力要求1：识别 auth failed、rate limited、timeout、unavailable、response drift 和 caller failed。
 * 能力要求2：输出 retryable 和 boundary，避免上层解析 provider 原始错误。
 * 能力要求3：错误消息不包含 raw provider body、token 或完整 header。
 * 边界：不发送请求、不解析业务响应，只做错误归类。
 * 对接：被 providerCaller、providerProbe 和 OpenAI actualInvocationLayer 复用。
 * 实现提示：优先依据 status/statusCode，其次依据 code/name 字符串。
 */

export type ProviderAccessErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "RESPONSE_FORMAT_DRIFT"
  | "CALLER_FAILED";

export type ProviderAccessBoundary = "provider" | "response" | "caller";

export type ProviderAccessError = {
  code: ProviderAccessErrorCode;
  message: string;
  boundary: ProviderAccessBoundary;
  retryable: boolean;
  publicSafe: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const status = error.status ?? error.statusCode;
  return typeof status === "number" ? status : undefined;
}

function providerCode(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const code = error.code ?? error.name;
  return typeof code === "string" ? code.toLowerCase() : "";
}

function providerMessage(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const message = error.providerMessage ?? error.message;
  return typeof message === "string" && message.trim().length > 0
    ? message.trim().slice(0, 500)
    : undefined;
}

export function classifyProviderAccessError(error: unknown): ProviderAccessError {
  const status = providerStatus(error);
  const codeText = providerCode(error);
  let code: ProviderAccessErrorCode = "CALLER_FAILED";

  if (status === 401 || status === 403) {
    code = "PROVIDER_AUTH_FAILED";
  } else if (status === 429) {
    code = "PROVIDER_RATE_LIMITED";
  } else if (status === 408 || codeText.includes("timeout") || codeText.includes("abort")) {
    code = "PROVIDER_TIMEOUT";
  } else if (status !== undefined && status >= 500) {
    code = "PROVIDER_UNAVAILABLE";
  } else if (codeText.includes("format") || codeText.includes("schema") || codeText.includes("parse") || codeText.includes("drift")) {
    code = "RESPONSE_FORMAT_DRIFT";
  }

  const detail = providerMessage(error);
  const statusPart = status === undefined ? "" : ` (status ${status})`;
  const detailPart = detail === undefined ? "" : `: ${detail}`;
  return {
    code,
    message: `provider caller failed with ${code}${statusPart}${detailPart}`,
    boundary: code === "RESPONSE_FORMAT_DRIFT" ? "response" : code === "CALLER_FAILED" ? "caller" : "provider",
    retryable: code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
    publicSafe: true,
  };
}
