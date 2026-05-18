/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Codex ChatGPT Auth。
 * 核心目的：按 Codex CLI 的账号模型解析 ChatGPT/Codex 登录态，并生成 public-safe auth material。
 * 能力要求1：支持 Codex auth.json 的 tokens/access_token/account_id/last_refresh 结构。
 * 能力要求2：从 ChatGPT JWT claims 中提取 email、plan、account、user 和 FedRAMP 路由信号。
 * 能力要求3：把 Authorization、ChatGPT-Account-ID、X-OpenAI-Fedramp 组合成 provider 可用材料。
 * 边界：不发起登录、不刷新 token、不自动读取文件系统，只解析显式传入的文本或对象。
 * 对接：authResolver 负责调用本模块；providerCaller 只接收 private material。
 */

import {
  createBearerAuthEnvelope,
  type ProviderAuthMaterial,
  type ResolvedAuthEnvelope,
} from "./authEnvelope.js";
import type { CredentialRef } from "./credentialRef.js";
import { redactSecretRecord } from "./secretRedaction.js";

export type ChatGPTCodexPlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_usage_based"
  | "business"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "education"
  | "edu"
  | "unknown"
  | (string & {});

export type ChatGPTCodexJwtClaims = {
  email?: string;
  chatgptPlanType?: ChatGPTCodexPlanType;
  chatgptUserId?: string;
  chatgptAccountId?: string;
  chatgptAccountIsFedramp: boolean;
  expiresAt?: string;
};

export type ChatGPTCodexAuthSnapshot = {
  sourceShape: "codex-auth-json" | "chatgpt-auth-tokens";
  authMode?: "chatgpt" | "unknown";
  accessToken: string;
  refreshTokenPresent: boolean;
  idTokenPresent: boolean;
  accountId?: string;
  planType?: ChatGPTCodexPlanType;
  email?: string;
  chatgptUserId?: string;
  accountIsFedramp: boolean;
  lastRefresh?: string;
  expiresAt?: string;
  publicSafe: false;
};

export type ChatGPTCodexPublicSnapshot = Omit<ChatGPTCodexAuthSnapshot, "accessToken" | "publicSafe"> & {
  accessTokenPresent: boolean;
  publicSafe: true;
};

export type ParseChatGPTCodexAuthResult =
  | { ok: true; snapshot: ChatGPTCodexAuthSnapshot; publicSnapshot: ChatGPTCodexPublicSnapshot; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "INVALID_JSON" | "INVALID_AUTH_RECORD" | "NOT_CHATGPT_AUTH" | "MISSING_ACCESS_TOKEN";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizePlanType(value: unknown): ChatGPTCodexPlanType | undefined {
  if (!hasText(value)) {
    return undefined;
  }

  return value.trim().toLowerCase() as ChatGPTCodexPlanType;
}

function decodeBase64UrlJson(segment: string): unknown | undefined {
  try {
    const normalized = segment.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

export function parseChatGPTCodexJwtClaims(jwt: string | undefined): ChatGPTCodexJwtClaims | undefined {
  if (!hasText(jwt)) {
    return undefined;
  }

  const parts = jwt.split(".");
  if (parts.length < 3 || !hasText(parts[1])) {
    return undefined;
  }

  const claims = asRecord(decodeBase64UrlJson(parts[1]));
  if (claims === undefined) {
    return undefined;
  }

  const profile = asRecord(claims["https://api.openai.com/profile"]);
  const auth = asRecord(claims["https://api.openai.com/auth"]);
  const exp = typeof claims.exp === "number" ? claims.exp : undefined;

  return {
    email: hasText(claims.email) ? claims.email : hasText(profile?.email) ? profile.email : undefined,
    chatgptPlanType: normalizePlanType(auth?.chatgpt_plan_type),
    chatgptUserId: hasText(auth?.chatgpt_user_id)
      ? auth.chatgpt_user_id
      : hasText(auth?.user_id)
        ? auth.user_id
        : undefined,
    chatgptAccountId: hasText(auth?.chatgpt_account_id) ? auth.chatgpt_account_id : undefined,
    chatgptAccountIsFedramp: auth?.chatgpt_account_is_fedramp === true,
    expiresAt: exp === undefined ? undefined : new Date(exp * 1000).toISOString(),
  };
}

function publicSnapshot(snapshot: ChatGPTCodexAuthSnapshot): ChatGPTCodexPublicSnapshot {
  const { accessToken: _accessToken, publicSafe: _publicSafe, ...rest } = snapshot;
  return redactSecretRecord({
    ...rest,
    accessTokenPresent: hasText(snapshot.accessToken),
    publicSafe: true,
  }) as ChatGPTCodexPublicSnapshot;
}

function parseAuthMode(value: unknown): "chatgpt" | "unknown" | undefined {
  if (typeof value === "string" && value.toLowerCase() === "chatgpt") {
    return "chatgpt";
  }

  return value === undefined ? undefined : "unknown";
}

export function parseChatGPTCodexAuthJson(text: string): ParseChatGPTCodexAuthResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      error: { code: "INVALID_JSON", message: "Codex auth source was not valid JSON", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexAuth.rejected"],
    };
  }

  const record = asRecord(parsed);
  if (record === undefined) {
    return {
      ok: false,
      error: { code: "INVALID_AUTH_RECORD", message: "Codex auth source did not contain an object record", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexAuth.rejected"],
    };
  }

  if (record.OPENAI_API_KEY !== undefined && record.tokens === undefined) {
    return {
      ok: false,
      error: { code: "NOT_CHATGPT_AUTH", message: "Codex auth source contains API key auth, not ChatGPT login tokens", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexAuth.rejected"],
    };
  }

  const tokens = asRecord(record.tokens);
  if (tokens === undefined) {
    return {
      ok: false,
      error: { code: "INVALID_AUTH_RECORD", message: "Codex auth source did not include token data", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexAuth.rejected"],
    };
  }

  const accessToken = hasText(tokens.access_token) ? tokens.access_token : undefined;
  if (accessToken === undefined) {
    return {
      ok: false,
      error: { code: "MISSING_ACCESS_TOKEN", message: "Codex auth source did not include a usable access token", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexAuth.rejected"],
    };
  }

  const idToken = hasText(tokens.id_token) ? tokens.id_token : undefined;
  const idClaims = parseChatGPTCodexJwtClaims(idToken);
  const accessClaims = parseChatGPTCodexJwtClaims(accessToken);
  const claims = idClaims ?? accessClaims;
  const accountId = hasText(tokens.account_id) ? tokens.account_id : claims?.chatgptAccountId;
  const planType = normalizePlanType(record.chatgptPlanType) ?? claims?.chatgptPlanType;
  const lastRefresh = hasText(record.last_refresh) ? record.last_refresh : undefined;
  const snapshot: ChatGPTCodexAuthSnapshot = {
    sourceShape: "codex-auth-json",
    authMode: parseAuthMode(record.auth_mode),
    accessToken,
    refreshTokenPresent: hasText(tokens.refresh_token),
    idTokenPresent: idToken !== undefined,
    accountId,
    planType,
    email: claims?.email,
    chatgptUserId: claims?.chatgptUserId,
    accountIsFedramp: claims?.chatgptAccountIsFedramp ?? false,
    lastRefresh,
    expiresAt: accessClaims?.expiresAt ?? idClaims?.expiresAt ?? lastRefresh,
    publicSafe: false,
  };

  return {
    ok: true,
    snapshot,
    publicSnapshot: publicSnapshot(snapshot),
    events: ["agentCore.modelAdapter.authProfile.codexAuth.parsed"],
  };
}

export function createChatGPTCodexRedactedIdentity(snapshot: Pick<ChatGPTCodexAuthSnapshot, "accountId" | "planType" | "email">): string {
  const account = snapshot.accountId === undefined ? "unknown" : "present";
  const plan = snapshot.planType ?? "unknown";
  const email = snapshot.email === undefined ? "unknown" : "present";
  return `[chatgpt-codex account=${account} plan=${plan} email=${email}]`;
}

export function createChatGPTCodexAuthMaterial(
  snapshot: ChatGPTCodexAuthSnapshot,
  extraHeaders?: Readonly<Record<string, string>>,
): ProviderAuthMaterial {
  return {
    headers: {
      ...(extraHeaders ?? {}),
      authorization: `Bearer ${snapshot.accessToken}`,
      ...(snapshot.accountId ? { "ChatGPT-Account-ID": snapshot.accountId } : {}),
      ...(snapshot.accountIsFedramp ? { "X-OpenAI-Fedramp": "true" } : {}),
    },
    expiresAt: snapshot.expiresAt,
  };
}

export function createChatGPTCodexAuthEnvelope(input: {
  credentialRef: CredentialRef;
  snapshot: ChatGPTCodexAuthSnapshot;
  extraHeaders?: Readonly<Record<string, string>>;
}): ResolvedAuthEnvelope {
  const material = createChatGPTCodexAuthMaterial(input.snapshot, input.extraHeaders);
  const resolved = createBearerAuthEnvelope({
    credentialRef: input.credentialRef,
    token: input.snapshot.accessToken,
    redactedIdentity: createChatGPTCodexRedactedIdentity(input.snapshot),
    expiresAt: input.snapshot.expiresAt,
    extraHeaders: material.headers,
  });

  return {
    envelope: {
      ...resolved.envelope,
      redactedIdentity: createChatGPTCodexRedactedIdentity(input.snapshot),
    },
    privateMaterial: material,
  };
}

export function toPublicChatGPTCodexAuthSnapshot(snapshot: ChatGPTCodexAuthSnapshot): ChatGPTCodexPublicSnapshot {
  return publicSnapshot(snapshot);
}
