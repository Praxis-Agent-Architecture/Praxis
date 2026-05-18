/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Codex Auth Persistence。
 * 核心目的：把登录流程拿到的 ChatGPT/Codex tokens 序列化为 Codex CLI 兼容 auth.json 形状。
 * 能力要求1：输出 auth_mode/tokens/last_refresh，便于上层选择写入 Praxis store 或 Codex 兼容文件。
 * 能力要求2：从 id_token/access_token claims 中补 account/profile 画像，但不在 public 输出泄漏 token。
 * 能力要求3：写入动作必须由上层显式注入 writer，framework 不自动碰用户文件系统。
 * 边界：不发起 OAuth、不刷新 token、不读取 auth.json。
 */

import {
  parseChatGPTCodexAuthJson,
  parseChatGPTCodexJwtClaims,
  type ChatGPTCodexAuthSnapshot,
  type ChatGPTCodexPublicSnapshot,
} from "./codexAuth.js";

export type ChatGPTCodexTokenSet = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
};

export type CodexAuthJsonRecord = {
  auth_mode: "chatgpt";
  OPENAI_API_KEY: null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id?: string;
  };
  last_refresh: string;
};

export type CodexAuthPersistencePlan = {
  record: CodexAuthJsonRecord;
  authJsonText: string;
  snapshot: ChatGPTCodexAuthSnapshot;
  publicSnapshot: ChatGPTCodexPublicSnapshot;
  publicSafe: false;
};

export type CodexAuthJsonWriter = (request: {
  targetPath?: string;
  authJsonText: string;
  publicSnapshot: ChatGPTCodexPublicSnapshot;
}) => void | Promise<void>;

function nowIso(now: Date | (() => Date) | undefined): string {
  return (typeof now === "function" ? now() : now ?? new Date()).toISOString();
}

export function createCodexAuthJsonPersistencePlan(input: {
  tokens: ChatGPTCodexTokenSet;
  lastRefresh?: string;
  now?: Date | (() => Date);
}): CodexAuthPersistencePlan {
  const idClaims = parseChatGPTCodexJwtClaims(input.tokens.idToken);
  const accessClaims = parseChatGPTCodexJwtClaims(input.tokens.accessToken);
  const accountId = idClaims?.chatgptAccountId ?? accessClaims?.chatgptAccountId;
  const record: CodexAuthJsonRecord = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: input.tokens.idToken,
      access_token: input.tokens.accessToken,
      refresh_token: input.tokens.refreshToken,
      ...(accountId ? { account_id: accountId } : {}),
    },
    last_refresh: input.lastRefresh ?? nowIso(input.now),
  };

  const authJsonText = `${JSON.stringify(record, null, 2)}\n`;
  const parsed = parseChatGPTCodexAuthJson(authJsonText);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return {
    record,
    authJsonText,
    snapshot: parsed.snapshot,
    publicSnapshot: parsed.publicSnapshot,
    publicSafe: false,
  };
}

export async function persistCodexAuthJson(input: {
  plan: CodexAuthPersistencePlan;
  targetPath?: string;
  writeAuthJson: CodexAuthJsonWriter;
}): Promise<{ ok: true; targetPath?: string; publicSafe: true; events: readonly string[] }> {
  await input.writeAuthJson({
    targetPath: input.targetPath,
    authJsonText: input.plan.authJsonText,
    publicSnapshot: input.plan.publicSnapshot,
  });

  return {
    ok: true,
    targetPath: input.targetPath,
    publicSafe: true,
    events: ["agentCore.modelAdapter.authProfile.codexAuthPersistence.persisted"],
  };
}
