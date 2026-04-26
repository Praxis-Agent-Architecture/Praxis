/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Codex Login Flow。
 * 核心目的：给上层 CLI/TUI/服务提供 Codex 风格 ChatGPT 登录入口的 framework 能力。
 * 能力要求1：生成与 Codex CLI 对齐的 OAuth authorize URL，包括 PKCE、state、scope 和 originator。
 * 能力要求2：完成 callback code -> token exchange -> persistence/profile/carrier 的对象化闭环。
 * 能力要求3：所有 public 结果不携带 raw token、refresh token、完整 Authorization 或 callback code。
 * 边界：不自动打开浏览器、不自动起本地 server、不自动写文件；这些由上层显式注入。
 */

import { createHash, randomBytes } from "node:crypto";
import {
  createChatGPTCodexAuthEnvelope,
  createChatGPTCodexRedactedIdentity,
} from "./codexAuth.js";
import {
  createCodexAuthJsonPersistencePlan,
  persistCodexAuthJson,
  type ChatGPTCodexTokenSet,
  type CodexAuthJsonWriter,
} from "./codexAuthPersistence.js";
import { createCredentialRef, type CredentialRef } from "./credentialRef.js";
import type { CredentialStore } from "./credentialStore.js";
import { createProviderProfile, type ProviderProfile } from "./providerProfile.js";
import { redactSecretText } from "./secretRedaction.js";
import {
  createChatGPTCodexResponsesCarrier,
  type ProviderCarrier,
} from "../providerAccessLayer/providerCarrier.js";

export const CHATGPT_CODEX_LOGIN_DEFAULT_ISSUER = "https://auth.openai.com" as const;
export const CHATGPT_CODEX_LOGIN_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann" as const;
export const CHATGPT_CODEX_LOGIN_DEFAULT_ORIGINATOR = "codex_cli_rs" as const;
export const CHATGPT_CODEX_LOGIN_SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke" as const;

export type ChatGPTCodexLoginSession = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  forcedWorkspaceId?: string;
  createdAt: string;
  publicSafe: false;
};

export type ChatGPTCodexLoginStartResult =
  | {
      ok: true;
      login: {
        authUrl: string;
        issuer: string;
        redirectUri: string;
        state: string;
        publicSafe: true;
      };
      session: ChatGPTCodexLoginSession;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: "MISSING_REDIRECT_URI" | "INVALID_LOGIN_INPUT";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

export type ChatGPTCodexTokenExchange = (request: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  code: string;
}) => Promise<ChatGPTCodexTokenSet>;

export type ChatGPTCodexLoginCompleteResult =
  | {
      ok: true;
      credentialRef: CredentialRef;
      profile: ProviderProfile;
      carrier: ProviderCarrier;
      authFilePath?: string;
      publicSnapshot: unknown;
      publicSafe: true;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code:
          | "MISSING_LOGIN_SESSION"
          | "MISSING_CALLBACK_CODE"
          | "STATE_MISMATCH"
          | "PERSISTENCE_REQUIRED"
          | "TOKEN_EXCHANGE_FAILED"
          | "PROFILE_BUILD_FAILED";
        message: string;
        boundary: "input" | "oauth" | "persistence" | "profile";
        publicSafe: true;
      };
      events: readonly string[];
    };

type ChatGPTCodexLoginCompleteErrorCode =
  | "MISSING_LOGIN_SESSION"
  | "MISSING_CALLBACK_CODE"
  | "STATE_MISMATCH"
  | "PERSISTENCE_REQUIRED"
  | "TOKEN_EXCHANGE_FAILED"
  | "PROFILE_BUILD_FAILED";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function generatePkce(): Pick<ChatGPTCodexLoginSession, "codeVerifier" | "codeChallenge"> {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function normalizeIssuer(issuer: string | undefined): string {
  return (issuer?.trim() || CHATGPT_CODEX_LOGIN_DEFAULT_ISSUER).replace(/\/+$/u, "");
}

function failure(
  code: ChatGPTCodexLoginCompleteErrorCode,
  message: string,
  boundary: "input" | "oauth" | "persistence" | "profile",
): ChatGPTCodexLoginCompleteResult {
  return {
    ok: false,
    error: { code, message: redactSecretText(message), boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.authProfile.codexLogin.rejected"],
  };
}

function extractCallbackParams(input: { callbackUrl?: string; code?: string; state?: string }): { code?: string; state?: string } {
  if (hasText(input.callbackUrl)) {
    try {
      const url = new URL(input.callbackUrl);
      return {
        code: url.searchParams.get("code") ?? undefined,
        state: url.searchParams.get("state") ?? undefined,
      };
    } catch {
      return {};
    }
  }

  return {
    code: input.code,
    state: input.state,
  };
}

function buildAuthorizeUrl(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  originator: string;
  forcedWorkspaceId?: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: CHATGPT_CODEX_LOGIN_SCOPE,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: input.state,
    originator: input.originator,
  });
  if (input.forcedWorkspaceId !== undefined) {
    params.set("allowed_workspace_id", input.forcedWorkspaceId);
  }

  return `${input.issuer}/oauth/authorize?${params.toString()}`;
}

export function startChatGPTCodexLogin(input: {
  redirectUri?: string;
  issuer?: string;
  clientId?: string;
  originator?: string;
  forcedWorkspaceId?: string;
  forceState?: string;
  now?: Date | (() => Date);
} = {}): ChatGPTCodexLoginStartResult {
  if (!hasText(input.redirectUri)) {
    return {
      ok: false,
      error: { code: "MISSING_REDIRECT_URI", message: "Codex login requires an explicit redirectUri", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexLogin.rejected"],
    };
  }

  const issuer = normalizeIssuer(input.issuer);
  const clientId = input.clientId?.trim() || CHATGPT_CODEX_LOGIN_CLIENT_ID;
  const originator = input.originator?.trim() || CHATGPT_CODEX_LOGIN_DEFAULT_ORIGINATOR;
  const state = input.forceState?.trim() || base64Url(randomBytes(32));
  const pkce = generatePkce();
  const createdAt = (typeof input.now === "function" ? input.now() : input.now ?? new Date()).toISOString();
  const session: ChatGPTCodexLoginSession = {
    issuer,
    clientId,
    redirectUri: input.redirectUri.trim(),
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
    state,
    forcedWorkspaceId: input.forcedWorkspaceId?.trim() || undefined,
    createdAt,
    publicSafe: false,
  };

  return {
    ok: true,
    login: {
      authUrl: buildAuthorizeUrl({ ...session, originator }),
      issuer,
      redirectUri: session.redirectUri,
      state,
      publicSafe: true,
    },
    session,
    events: ["agentCore.modelAdapter.authProfile.codexLogin.started"],
  };
}

export const exchangeChatGPTCodexOAuthCode: ChatGPTCodexTokenExchange = async (request) => {
  const response = await fetch(`${request.issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: request.code,
      redirect_uri: request.redirectUri,
      client_id: request.clientId,
      code_verifier: request.codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed with status ${response.status}`);
  }

  const body = await response.json() as Partial<Record<"id_token" | "access_token" | "refresh_token", unknown>>;
  if (!hasText(body.id_token) || !hasText(body.access_token) || !hasText(body.refresh_token)) {
    throw new Error("OAuth token exchange response was missing required token fields");
  }

  return {
    idToken: body.id_token,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
};

export async function completeChatGPTCodexLogin(input: {
  session?: ChatGPTCodexLoginSession;
  callbackUrl?: string;
  code?: string;
  state?: string;
  exchange?: ChatGPTCodexTokenExchange;
  credentialId?: string;
  profileId?: string;
  carrierId?: string;
  authFilePath?: string;
  store?: CredentialStore;
  writeAuthJson?: CodexAuthJsonWriter;
  now?: Date | (() => Date);
}): Promise<ChatGPTCodexLoginCompleteResult> {
  if (input.session === undefined) {
    return failure("MISSING_LOGIN_SESSION", "Codex login completion requires the start session", "input");
  }

  if (input.store === undefined && input.writeAuthJson === undefined) {
    return failure("PERSISTENCE_REQUIRED", "Codex login completion requires an explicit credential store or auth.json writer", "persistence");
  }

  const callback = extractCallbackParams(input);
  if (!hasText(callback.code)) {
    return failure("MISSING_CALLBACK_CODE", "Codex login callback did not include an authorization code", "input");
  }

  if (callback.state !== input.session.state) {
    return failure("STATE_MISMATCH", "Codex login callback state did not match the start session", "oauth");
  }

  let tokens: ChatGPTCodexTokenSet;
  try {
    tokens = await (input.exchange ?? exchangeChatGPTCodexOAuthCode)({
      issuer: input.session.issuer,
      clientId: input.session.clientId,
      redirectUri: input.session.redirectUri,
      codeVerifier: input.session.codeVerifier,
      code: callback.code,
    });
  } catch (error) {
    return failure("TOKEN_EXCHANGE_FAILED", `Codex login token exchange failed: ${error instanceof Error ? error.message : String(error)}`, "oauth");
  }

  const plan = createCodexAuthJsonPersistencePlan({ tokens, now: input.now });
  if (input.writeAuthJson !== undefined) {
    await persistCodexAuthJson({
      plan,
      targetPath: input.authFilePath,
      writeAuthJson: input.writeAuthJson,
    });
  }

  const credential = createCredentialRef({
    id: input.credentialId ?? "chatgpt-codex-default",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: input.authFilePath === undefined
      ? { kind: "profile-store", label: input.profileId ?? "chatgpt-codex" }
      : { kind: "codex-auth-file", filePath: input.authFilePath },
  });
  if (!credential.ok) {
    return failure("PROFILE_BUILD_FAILED", credential.error.message, "profile");
  }

  const resolvedAuth = createChatGPTCodexAuthEnvelope({
    credentialRef: credential.credentialRef,
    snapshot: plan.snapshot,
  });
  const profile = createProviderProfile({
    profileId: input.profileId ?? "chatgpt-codex-default",
    provider: "openai",
    accountLabel: plan.publicSnapshot.planType ?? "chatgpt-codex",
    defaultCarrierId: input.carrierId ?? "chatgpt-codex-responses",
    redactedIdentity: createChatGPTCodexRedactedIdentity(plan.snapshot),
    capabilities: ["responses", "text", "reasoning", "tool-call", "chatgpt-subscription"],
  });
  if (!profile.ok) {
    return failure("PROFILE_BUILD_FAILED", profile.error.message, "profile");
  }

  input.store?.put({
    credentialRef: credential.credentialRef,
    profile: profile.profile,
    privateMaterial: resolvedAuth.privateMaterial,
    redactedIdentity: profile.profile.redactedIdentity,
  });

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: input.carrierId ?? "chatgpt-codex-responses",
    credentialRef: credential.credentialRef,
    model: "gpt-5.4",
  });
  if (!carrier.ok) {
    return failure("PROFILE_BUILD_FAILED", carrier.error.message, "profile");
  }

  return {
    ok: true,
    credentialRef: credential.credentialRef,
    profile: profile.profile,
    carrier: carrier.carrier,
    authFilePath: input.authFilePath,
    publicSnapshot: plan.publicSnapshot,
    publicSafe: true,
    events: ["agentCore.modelAdapter.authProfile.codexLogin.completed"],
  };
}
