/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / 凭证引用。
 * 核心目的：把上层可编码传入的 credentialRef 规范化成不含 raw secret 的稳定对象。
 * 能力要求1：支持 OpenAI API key 与 ChatGPT/Codex OAuth 两类 OpenAI credential。
 * 能力要求2：保留 source 显式性，避免 actualInvocationLayer 隐式读取环境或本地 auth 文件。
 * 能力要求3：输出可序列化、可审计、可作为 carrier/profile 的引用键。
 * 边界：不读取 secret、不解析 auth 文件、不生成 headers。
 * 对接：被 credentialStore、providerProfile、authResolver 和 providerCarrier 引用。
 * 实现提示：先规范化 provider/id/source，再由 resolver 决定是否能取得真实材料。
 */

export type ProviderCredentialKind = "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});

export type CredentialType =
  | "openai_api_key"
  | "chatgpt_codex_oauth"
  | "anthropic_api_key"
  | "gemini_api_key"
  | "custom";

export type CredentialSourceKind = "injected" | "environment" | "codex-auth-file" | "profile-store" | "test";

export type CredentialSource = {
  kind: CredentialSourceKind;
  label?: string;
  envName?: string;
  filePath?: string;
};

export type CredentialRefInput = {
  kind?: ProviderCredentialKind;
  id?: string;
  provider?: ProviderCredentialKind;
  source?: CredentialSource;
  credentialType?: CredentialType;
};

export type CredentialRef = {
  kind: ProviderCredentialKind;
  id: string;
  provider: ProviderCredentialKind;
  source: CredentialSource;
  credentialType: CredentialType;
  publicSafe: true;
};

export type CredentialRefErrorCode =
  | "MISSING_CREDENTIAL_ID"
  | "MISSING_PROVIDER"
  | "MISSING_SOURCE"
  | "MISSING_CREDENTIAL_TYPE"
  | "INVALID_OPENAI_CREDENTIAL_TYPE";

export type CredentialRefResult =
  | { ok: true; credentialRef: CredentialRef; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: CredentialRefErrorCode;
        message: string;
        boundary: "input" | "source" | "provider";
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: CredentialRefErrorCode,
  message: string,
  boundary: "input" | "source" | "provider",
): CredentialRefResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.authProfile.credentialRef.rejected"],
  };
}

export function createCredentialRef(input: CredentialRefInput = {}): CredentialRefResult {
  if (!hasText(input.id)) {
    return failure("MISSING_CREDENTIAL_ID", "credentialRef requires a stable id", "input");
  }

  const provider = input.provider ?? input.kind;
  if (!hasText(provider)) {
    return failure("MISSING_PROVIDER", "credentialRef requires a provider", "provider");
  }

  if (input.source === undefined) {
    return failure("MISSING_SOURCE", "credentialRef requires an explicit credential source", "source");
  }

  if (!hasText(input.credentialType)) {
    return failure("MISSING_CREDENTIAL_TYPE", "credentialRef requires a credentialType", "input");
  }

  if (
    provider.trim() === "openai" &&
    input.credentialType !== "openai_api_key" &&
    input.credentialType !== "chatgpt_codex_oauth"
  ) {
    return failure(
      "INVALID_OPENAI_CREDENTIAL_TYPE",
      "OpenAI credentialRef only accepts openai_api_key or chatgpt_codex_oauth in the first provider access pass",
      "provider",
    );
  }

  return {
    ok: true,
    credentialRef: {
      kind: provider.trim(),
      id: input.id.trim(),
      provider: provider.trim(),
      source: {
        kind: input.source.kind,
        label: input.source.label?.trim() || undefined,
        envName: input.source.envName?.trim() || undefined,
        filePath: input.source.filePath?.trim() || undefined,
      },
      credentialType: input.credentialType,
      publicSafe: true,
    },
    events: ["agentCore.modelAdapter.authProfile.credentialRef.created"],
  };
}

export function credentialRefKey(ref: Pick<CredentialRef, "provider" | "id" | "credentialType">): string {
  return `${ref.provider}:${ref.credentialType}:${ref.id}`;
}
