/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Provider Profile。
 * 核心目的：为上层框架用户提供不含 secret 的账号画像和默认 carrier 选择。
 * 能力要求1：表达 profileId、provider、accountLabel、默认 carrier 和能力列表。
 * 能力要求2：只保存 redacted identity，不保存 raw token、API key 或 Authorization header。
 * 能力要求3：可被 auth probe 和 provider carrier registry 作为 public-safe 状态返回。
 * 边界：不负责登录流程、不负责 provider 调用、不做计费或缓存策略。
 * 对接：被 credentialStore、authProbe、providerProbe 和上层 harness 配置使用。
 * 实现提示：保持最小结构，后续经济控制和缓存策略通过 carrier/cachePolicy 承接。
 */

import type { ProviderCredentialKind } from "./credentialRef.js";

export type ProviderProfileInput = {
  profileId?: string;
  provider?: ProviderCredentialKind;
  accountLabel?: string;
  defaultCarrierId?: string;
  redactedIdentity?: string;
  capabilities?: readonly string[];
};

export type ProviderProfile = {
  profileId: string;
  provider: ProviderCredentialKind;
  accountLabel: string;
  defaultCarrierId?: string;
  redactedIdentity: string;
  capabilities: readonly string[];
  publicSafe: true;
};

export type ProviderProfileResult =
  | { ok: true; profile: ProviderProfile; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "MISSING_PROFILE_ID" | "MISSING_PROVIDER";
        message: string;
        boundary: "input";
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function createProviderProfile(input: ProviderProfileInput = {}): ProviderProfileResult {
  if (!hasText(input.profileId)) {
    return {
      ok: false,
      error: {
        code: "MISSING_PROFILE_ID",
        message: "providerProfile requires a stable profileId",
        boundary: "input",
        publicSafe: true,
      },
      events: ["agentCore.modelAdapter.authProfile.providerProfile.rejected"],
    };
  }

  if (!hasText(input.provider)) {
    return {
      ok: false,
      error: {
        code: "MISSING_PROVIDER",
        message: "providerProfile requires a provider",
        boundary: "input",
        publicSafe: true,
      },
      events: ["agentCore.modelAdapter.authProfile.providerProfile.rejected"],
    };
  }

  return {
    ok: true,
    profile: {
      profileId: input.profileId.trim(),
      provider: input.provider.trim(),
      accountLabel: input.accountLabel?.trim() || input.profileId.trim(),
      defaultCarrierId: input.defaultCarrierId?.trim() || undefined,
      redactedIdentity: input.redactedIdentity?.trim() || "[identity-unverified]",
      capabilities: cleanList(input.capabilities),
      publicSafe: true,
    },
    events: ["agentCore.modelAdapter.authProfile.providerProfile.created"],
  };
}
