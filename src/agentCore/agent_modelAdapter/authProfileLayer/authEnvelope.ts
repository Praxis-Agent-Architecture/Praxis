/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Auth Envelope。
 * 核心目的：把真实 credential 材料拆成 public-safe envelope 与 private runtime material。
 * 能力要求1：actualInvocationLayer 只能接收 public-safe auth envelope。
 * 能力要求2：providerCaller 可在闭包内持有 private material，但不得把 raw token 写入公共结果。
 * 能力要求3：统一表达 headerPlan、queryPlan、credentialRef、redactedIdentity 和过期时间。
 * 边界：不主动读取任何 credential source，不直接发送网络请求。
 * 对接：被 authResolver 输出，被 providerCaller 消费，被 OpenAI endpoint 做 live auth gate。
 * 实现提示：任何可序列化输出都应走 toPublicAuthEnvelope 或 redaction helpers。
 */

import type { CredentialRef } from "./credentialRef.js";
import { redactHeaders, redactSecret, type RedactedString } from "./secretRedaction.js";

export type AuthEnvelopeKind = "bearer" | "api-key" | "oauth" | "none";

export type AuthHeaderPlan = {
  name: string;
  value: string | RedactedString;
  redacted: true;
};

export type AuthQueryPlan = {
  name: string;
  value: string | RedactedString;
  redacted: true;
};

export type AuthEnvelope = {
  kind: AuthEnvelopeKind;
  present: boolean;
  credentialRef?: CredentialRef;
  redactedIdentity?: string;
  headerPlan: readonly AuthHeaderPlan[];
  queryPlan: readonly AuthQueryPlan[];
  expiresAt?: string;
  publicSafe: true;
};

export type ProviderAuthMaterial = {
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  expiresAt?: string;
};

export type ResolvedAuthEnvelope = {
  envelope: AuthEnvelope;
  privateMaterial?: ProviderAuthMaterial;
};

function cleanHeaderName(name: string): string {
  return name.trim().toLowerCase();
}

export function createMissingAuthEnvelope(credentialRef?: CredentialRef, reason = "missing"): AuthEnvelope {
  return {
    kind: "none",
    present: false,
    credentialRef,
    redactedIdentity: `[auth:${reason}]`,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
}

export function createBearerAuthEnvelope(input: {
  credentialRef: CredentialRef;
  token: string;
  redactedIdentity?: string;
  expiresAt?: string;
  extraHeaders?: Readonly<Record<string, string>>;
}): ResolvedAuthEnvelope {
  const headers = {
    ...(input.extraHeaders ?? {}),
    authorization: `Bearer ${input.token}`,
  };

  return {
    envelope: {
      kind: input.credentialRef.credentialType === "chatgpt_codex_oauth" ? "oauth" : "bearer",
      present: input.token.trim().length > 0,
      credentialRef: input.credentialRef,
      redactedIdentity: input.redactedIdentity ?? redactSecret(input.token),
      headerPlan: Object.entries(redactHeaders(headers)).map(([name, value]) => ({
        name: cleanHeaderName(name),
        value,
        redacted: true,
      })),
      queryPlan: [],
      expiresAt: input.expiresAt,
      publicSafe: true,
    },
    privateMaterial: {
      headers,
      expiresAt: input.expiresAt,
    },
  };
}

export function createApiKeyAuthEnvelope(input: {
  credentialRef: CredentialRef;
  apiKey: string;
  redactedIdentity?: string;
  headerName?: string;
  extraHeaders?: Readonly<Record<string, string>>;
}): ResolvedAuthEnvelope {
  const headerName = input.headerName?.trim() || "authorization";
  const headerValue = headerName.toLowerCase() === "authorization" ? `Bearer ${input.apiKey}` : input.apiKey;
  const headers = {
    ...(input.extraHeaders ?? {}),
    [headerName]: headerValue,
  };

  return {
    envelope: {
      kind: "api-key",
      present: input.apiKey.trim().length > 0,
      credentialRef: input.credentialRef,
      redactedIdentity: input.redactedIdentity ?? redactSecret(input.apiKey),
      headerPlan: Object.entries(redactHeaders(headers)).map(([name, value]) => ({
        name: cleanHeaderName(name),
        value,
        redacted: true,
      })),
      queryPlan: [],
      publicSafe: true,
    },
    privateMaterial: { headers },
  };
}

export function toPublicAuthEnvelope(resolved: ResolvedAuthEnvelope | AuthEnvelope): AuthEnvelope {
  if ("envelope" in resolved) {
    return resolved.envelope;
  }
  return resolved;
}

export function mergeAuthMaterialHeaders(
  authMaterial: ProviderAuthMaterial | undefined,
  headers: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return {
    ...(headers ?? {}),
    ...(authMaterial?.headers ?? {}),
  };
}
