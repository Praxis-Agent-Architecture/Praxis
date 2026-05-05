/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / 密钥脱敏工具。
 * 核心目的：为 provider access 链路提供统一的 public-safe secret redaction 能力。
 * 能力要求1：能把 token、Authorization header、refresh token 等敏感材料替换为稳定脱敏形态。
 * 能力要求2：能递归处理普通 JSON 对象，避免错误、事件和测试快照泄漏 raw secret。
 * 能力要求3：不持久化、不读取、不生成任何真实凭证，只做字符串和 JSON 边界清洗。
 * 边界：只做脱敏，不负责 credential 解析、provider 调用或治理判断。
 * 对接：被 authEnvelope、authResolver、providerCaller、providerProbe 和 actualInvocationLayer 复用。
 * 实现提示：保持纯函数和无副作用，优先返回可序列化 public-safe 数据。
 */

const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|chatgpt[-_]?account[-_]?id|account[-_]?id|user[-_]?id|secret|credential)/iu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const LONG_SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{12,}|rt_[A-Za-z0-9._~+/=-]{12,}|eyJ[A-Za-z0-9._~+/=-]{20,})\b/gu;

export type RedactedString = string & { readonly __praxisRedactedString: true };

export function redactSecret(value: string | undefined): RedactedString | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "[redacted-empty]" as RedactedString;
  }

  return `[redacted:${Math.min(trimmed.length, 9999)}]` as RedactedString;
}

export function redactHeaderValue(headerName: string, value: string): string {
  return SECRET_KEY_PATTERN.test(headerName) ? (redactSecret(value) ?? "[redacted]") : value;
}

export function redactSecretText(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(LONG_SECRET_PATTERN, "[redacted]");
}

export function redactSecretRecord(
  value: unknown,
): unknown {
  if (typeof value === "string") {
    return redactSecretText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretRecord(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === "string" && SECRET_KEY_PATTERN.test(key)) {
      redacted[key] = redactSecret(rawValue);
      continue;
    }

    redacted[key] = redactSecretRecord(rawValue);
  }

  return redacted;
}

export function redactHeaders(headers: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
  const redacted: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers ?? {})) {
    const name = rawName.trim().toLowerCase();
    if (name.length === 0) {
      continue;
    }
    redacted[name] = redactHeaderValue(name, rawValue);
  }
  return redacted;
}
