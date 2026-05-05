/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Codex Token Refresh。
 * 核心目的：提供 Codex CLI 风格 refresh_token 刷新入口，供上层登录态维护调用。
 * 能力要求1：默认按 auth.openai.com /oauth/token refresh_token grant 请求。
 * 能力要求2：返回新的 persistence plan，而不是把 raw token 放进 public result。
 * 能力要求3：错误输出必须 public-safe。
 * 边界：不自动读取旧 auth.json，不自动写入磁盘。
 */

import {
  createCodexAuthJsonPersistencePlan,
  persistCodexAuthJson,
  type ChatGPTCodexTokenSet,
  type CodexAuthJsonWriter,
} from "./codexAuthPersistence.js";
import {
  CHATGPT_CODEX_LOGIN_CLIENT_ID,
  CHATGPT_CODEX_LOGIN_DEFAULT_ISSUER,
} from "./codexLoginFlow.js";
import { redactSecretText } from "./secretRedaction.js";

export type ChatGPTCodexRefreshExchange = (request: {
  issuer: string;
  clientId: string;
  refreshToken: string;
}) => Promise<Partial<ChatGPTCodexTokenSet>>;

export type RefreshChatGPTCodexTokenResult =
  | {
      ok: true;
      publicSnapshot: unknown;
      authFilePath?: string;
      publicSafe: true;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: "MISSING_REFRESH_TOKEN" | "REFRESH_FAILED" | "PERSISTENCE_REQUIRED";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const exchangeChatGPTCodexRefreshToken: ChatGPTCodexRefreshExchange = async (request) => {
  const response = await fetch(`${request.issuer.replace(/\/+$/u, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: request.clientId,
      grant_type: "refresh_token",
      refresh_token: request.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth refresh failed with status ${response.status}`);
  }

  const body = await response.json() as Partial<Record<"id_token" | "access_token" | "refresh_token", unknown>>;
  return {
    idToken: typeof body.id_token === "string" ? body.id_token : undefined,
    accessToken: typeof body.access_token === "string" ? body.access_token : undefined,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
  };
};

export async function refreshChatGPTCodexToken(input: {
  previousTokens: ChatGPTCodexTokenSet;
  issuer?: string;
  clientId?: string;
  exchange?: ChatGPTCodexRefreshExchange;
  authFilePath?: string;
  writeAuthJson?: CodexAuthJsonWriter;
  now?: Date | (() => Date);
}): Promise<RefreshChatGPTCodexTokenResult> {
  if (!hasText(input.previousTokens.refreshToken)) {
    return {
      ok: false,
      error: { code: "MISSING_REFRESH_TOKEN", message: "Codex token refresh requires a refresh token", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexTokenRefresh.rejected"],
    };
  }

  if (input.writeAuthJson === undefined) {
    return {
      ok: false,
      error: { code: "PERSISTENCE_REQUIRED", message: "Codex token refresh requires an explicit auth.json writer", publicSafe: true },
      events: ["agentCore.modelAdapter.authProfile.codexTokenRefresh.rejected"],
    };
  }

  let refreshed: Partial<ChatGPTCodexTokenSet>;
  try {
    refreshed = await (input.exchange ?? exchangeChatGPTCodexRefreshToken)({
      issuer: input.issuer ?? CHATGPT_CODEX_LOGIN_DEFAULT_ISSUER,
      clientId: input.clientId ?? CHATGPT_CODEX_LOGIN_CLIENT_ID,
      refreshToken: input.previousTokens.refreshToken,
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "REFRESH_FAILED",
        message: redactSecretText(`Codex token refresh failed: ${error instanceof Error ? error.message : String(error)}`),
        publicSafe: true,
      },
      events: ["agentCore.modelAdapter.authProfile.codexTokenRefresh.rejected"],
    };
  }

  const tokens: ChatGPTCodexTokenSet = {
    idToken: refreshed.idToken ?? input.previousTokens.idToken,
    accessToken: refreshed.accessToken ?? input.previousTokens.accessToken,
    refreshToken: refreshed.refreshToken ?? input.previousTokens.refreshToken,
  };
  const plan = createCodexAuthJsonPersistencePlan({ tokens, now: input.now });
  await persistCodexAuthJson({
    plan,
    targetPath: input.authFilePath,
    writeAuthJson: input.writeAuthJson,
  });

  return {
    ok: true,
    publicSnapshot: plan.publicSnapshot,
    authFilePath: input.authFilePath,
    publicSafe: true,
    events: ["agentCore.modelAdapter.authProfile.codexTokenRefresh.completed"],
  };
}
