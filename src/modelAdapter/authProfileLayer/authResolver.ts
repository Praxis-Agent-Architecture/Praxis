/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Auth Resolver。
 * 核心目的：把显式 credential source 解析为 public-safe auth envelope 和 providerCaller 私有材料。
 * 能力要求1：支持 injected、environment、profile-store 和 codex-auth-file 这几类显式 source。
 * 能力要求2：Codex OAuth 与 OpenAI API key 独立解析，不把 ChatGPT 订阅 token 伪装成 API key。
 * 能力要求3：缺材料时返回 AUTH_REJECTED 风格的 public-safe envelope。
 * 边界：不在 actualInvocationLayer 内读取任何 source；不自动扫描用户目录。
 * 对接：上层 harness 调用 resolver 后，把 envelope 交给 endpoint，把 privateMaterial 交给 providerCaller。
 * 实现提示：文件读取由上层注入 reader，默认不触碰文件系统，便于测试和治理。
 */

import {
  createApiKeyAuthEnvelope,
  createBearerAuthEnvelope,
  createMissingAuthEnvelope,
  type ProviderAuthMaterial,
  type ResolvedAuthEnvelope,
} from "./authEnvelope.js";
import {
  createChatGPTCodexAuthEnvelope,
  parseChatGPTCodexAuthJson,
} from "./codexAuth.js";
import type { CredentialRef } from "./credentialRef.js";
import type { CredentialStore } from "./credentialStore.js";
import { redactSecretRecord } from "./secretRedaction.js";

export type AuthResolverFileReader = (path: string) => string | undefined;
export type AuthResolverEnvReader = (name: string) => string | undefined;

export type AuthResolverRequest = {
  credentialRef?: CredentialRef;
  store?: CredentialStore;
  injectedSecret?: string;
  injectedMaterial?: ProviderAuthMaterial;
  readEnv?: AuthResolverEnvReader;
  readFile?: AuthResolverFileReader;
  extraHeaders?: Readonly<Record<string, string>>;
};

export type AuthResolverErrorCode =
  | "MISSING_CREDENTIAL_REF"
  | "MISSING_SECRET_MATERIAL"
  | "UNSUPPORTED_CREDENTIAL_TYPE"
  | "INVALID_CODEX_AUTH_FILE";

export type AuthResolverResult =
  | { ok: true; resolved: ResolvedAuthEnvelope; events: readonly string[] }
  | {
      ok: false;
      resolved: ResolvedAuthEnvelope;
      error: {
        code: AuthResolverErrorCode;
        message: string;
        boundary: "input" | "source" | "credential";
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: AuthResolverErrorCode,
  message: string,
  boundary: "input" | "source" | "credential",
  credentialRef?: CredentialRef,
): AuthResolverResult {
  return {
    ok: false,
    resolved: { envelope: createMissingAuthEnvelope(credentialRef, code.toLowerCase()) },
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.authProfile.authResolver.rejected"],
  };
}

function anthropicVersion(request: AuthResolverRequest): string {
  const explicit = request.extraHeaders?.["anthropic-version"] ?? request.extraHeaders?.["Anthropic-Version"];
  return explicit?.trim() || request.readEnv?.("ANTHROPIC_VERSION")?.trim() || "2023-06-01";
}

function headerValue(
  headers: Readonly<Record<string, string>> | undefined,
  headerName: string,
): string | undefined {
  const target = headerName.trim().toLowerCase();
  if (target.length === 0) return undefined;
  return Object.entries(headers ?? {}).find(([name]) => name.trim().toLowerCase() === target)?.[1];
}

function bearerToken(
  headers: Readonly<Record<string, string>> | undefined,
): string | undefined {
  return headerValue(headers, "authorization")?.replace(/^Bearer\s+/iu, "");
}

function firstHeaderName(headers: Readonly<Record<string, string>> | undefined): string | undefined {
  return Object.keys(headers ?? {}).map((name) => name.trim()).find(Boolean);
}

function firstHeaderValue(headers: Readonly<Record<string, string>> | undefined): string | undefined {
  return Object.values(headers ?? {}).find((value) => value.trim().length > 0);
}

function secretFromHeader(
  headers: Readonly<Record<string, string>> | undefined,
  headerName: string,
): string | undefined {
  if (headerName.trim().toLowerCase() === "authorization") {
    return bearerToken(headers) ?? headerValue(headers, "authorization");
  }
  return headerValue(headers, headerName);
}

function providerExtraHeaders(
  extraHeaders: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(extraHeaders ?? {}).filter(([name]) => name.trim().toLowerCase() !== "x-praxis-auth-header"),
  );
}

function mergePrivateMaterial(
  material: ProviderAuthMaterial,
  headers: Readonly<Record<string, string>> | undefined,
): ProviderAuthMaterial {
  return {
    ...material,
    headers: {
      ...(headers ?? {}),
      ...(material.headers ?? {}),
    },
  };
}

export function resolveAuthEnvelope(request: AuthResolverRequest = {}): AuthResolverResult {
  const credentialRef = request.credentialRef;
  if (credentialRef === undefined) {
    return failure("MISSING_CREDENTIAL_REF", "authResolver requires a credentialRef", "input");
  }

  const stored = request.store?.get(credentialRef);
  if (stored?.privateMaterial !== undefined) {
    const privateMaterial = stored.privateMaterial;
    const providerHeaders = providerExtraHeaders(request.extraHeaders);
    if (credentialRef.credentialType === "anthropic_api_key") {
      const extraHeaders = {
        "anthropic-version": anthropicVersion(request),
        ...providerHeaders,
      };
      const secret = headerValue(privateMaterial.headers, "x-api-key") ?? "stored-material";
      return {
        ok: true,
        resolved: {
          envelope: createApiKeyAuthEnvelope({
            credentialRef,
            apiKey: secret,
            redactedIdentity: stored.redactedIdentity,
            headerName: "x-api-key",
            extraHeaders,
          }).envelope,
          privateMaterial: mergePrivateMaterial(privateMaterial, extraHeaders),
        },
        events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedFromStore"],
      };
    }

    if (credentialRef.credentialType === "gemini_api_key") {
      const secret = headerValue(privateMaterial.headers, "x-goog-api-key") ?? bearerToken(privateMaterial.headers) ?? "stored-material";
      return {
        ok: true,
        resolved: {
          envelope: createApiKeyAuthEnvelope({
            credentialRef,
            apiKey: secret,
            redactedIdentity: stored.redactedIdentity,
            headerName: "x-goog-api-key",
            extraHeaders: providerHeaders,
          }).envelope,
          privateMaterial: mergePrivateMaterial(privateMaterial, providerHeaders),
        },
        events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedFromStore"],
      };
    }

    if (credentialRef.credentialType === "custom") {
      const hintedHeaderName = headerValue(request.extraHeaders, "x-praxis-auth-header");
      const headerName = hintedHeaderName?.trim() || firstHeaderName(privateMaterial.headers) || "authorization";
      const secret = secretFromHeader(privateMaterial.headers, headerName)
        ?? firstHeaderValue(privateMaterial.headers)
        ?? "stored-material";
      return {
        ok: true,
        resolved: {
          envelope: createApiKeyAuthEnvelope({
            credentialRef,
            apiKey: secret,
            redactedIdentity: stored.redactedIdentity,
            headerName,
            extraHeaders: providerHeaders,
          }).envelope,
          privateMaterial: mergePrivateMaterial(privateMaterial, providerHeaders),
        },
        events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedFromStore"],
      };
    }

    return {
      ok: true,
      resolved: {
        envelope:
          credentialRef.credentialType === "openai_api_key"
            ? createApiKeyAuthEnvelope({
                credentialRef,
                apiKey: bearerToken(privateMaterial.headers) ?? "stored-material",
                redactedIdentity: stored.redactedIdentity,
                extraHeaders: providerHeaders,
              }).envelope
            : createBearerAuthEnvelope({
                credentialRef,
                token: bearerToken(privateMaterial.headers) ?? "stored-material",
                redactedIdentity: stored.redactedIdentity,
                extraHeaders: providerHeaders,
                expiresAt: privateMaterial.expiresAt,
              }).envelope,
        privateMaterial: mergePrivateMaterial(privateMaterial, providerHeaders),
      },
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedFromStore"],
    };
  }

  if (credentialRef.credentialType === "anthropic_api_key") {
    const secret =
      request.injectedSecret ??
      (credentialRef.source.kind === "environment" && hasText(credentialRef.source.envName)
        ? request.readEnv?.(credentialRef.source.envName)
        : undefined);

    if (!hasText(secret)) {
      return failure("MISSING_SECRET_MATERIAL", "Anthropic API key credentialRef has no available secret material", "source", credentialRef);
    }

    return {
      ok: true,
      resolved: createApiKeyAuthEnvelope({
        credentialRef,
        apiKey: secret,
        headerName: "x-api-key",
        extraHeaders: {
          "anthropic-version": anthropicVersion(request),
          ...(request.extraHeaders ?? {}),
        },
      }),
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedAnthropicApiKey"],
    };
  }

  if (credentialRef.credentialType === "openai_api_key") {
    const secret =
      request.injectedSecret ??
      (credentialRef.source.kind === "environment" && hasText(credentialRef.source.envName)
        ? request.readEnv?.(credentialRef.source.envName)
        : undefined);

    if (!hasText(secret)) {
      return failure("MISSING_SECRET_MATERIAL", "OpenAI API key credentialRef has no available secret material", "source", credentialRef);
    }

    return {
      ok: true,
      resolved: createApiKeyAuthEnvelope({
        credentialRef,
        apiKey: secret,
        extraHeaders: request.extraHeaders,
      }),
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedOpenAiApiKey"],
    };
  }

  if (credentialRef.credentialType === "gemini_api_key") {
    const secret =
      request.injectedSecret ??
      (credentialRef.source.kind === "environment" && hasText(credentialRef.source.envName)
        ? request.readEnv?.(credentialRef.source.envName)
        : undefined);

    if (!hasText(secret)) {
      return failure("MISSING_SECRET_MATERIAL", "Gemini API key credentialRef has no available secret material", "source", credentialRef);
    }

    return {
      ok: true,
      resolved: createApiKeyAuthEnvelope({
        credentialRef,
        apiKey: secret,
        headerName: "x-goog-api-key",
        extraHeaders: request.extraHeaders,
      }),
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedGeminiApiKey"],
    };
  }

  if (credentialRef.credentialType === "custom") {
    const hintedHeaderName = headerValue(request.extraHeaders, "x-praxis-auth-header");
    const providerHeaders = providerExtraHeaders(request.extraHeaders);
    if (request.injectedMaterial?.headers !== undefined) {
      const headerName = hintedHeaderName?.trim() || firstHeaderName(request.injectedMaterial.headers) || "authorization";
      const secret = secretFromHeader(request.injectedMaterial.headers, headerName)
        ?? firstHeaderValue(request.injectedMaterial.headers);

      if (!hasText(secret)) {
        return failure("MISSING_SECRET_MATERIAL", "Custom credentialRef has no available secret material", "source", credentialRef);
      }

      return {
        ok: true,
        resolved: {
          envelope: createApiKeyAuthEnvelope({
            credentialRef,
            apiKey: secret,
            headerName,
            extraHeaders: providerHeaders,
          }).envelope,
          privateMaterial: mergePrivateMaterial(request.injectedMaterial, providerHeaders),
        },
        events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedCustomApiKey"],
      };
    }

    const secret =
      request.injectedSecret ??
      (credentialRef.source.kind === "environment" && hasText(credentialRef.source.envName)
        ? request.readEnv?.(credentialRef.source.envName)
        : undefined);

    if (!hasText(secret)) {
      return failure("MISSING_SECRET_MATERIAL", "Custom credentialRef has no available secret material", "source", credentialRef);
    }

    return {
      ok: true,
      resolved: createApiKeyAuthEnvelope({
        credentialRef,
        apiKey: secret,
        headerName: hintedHeaderName ?? "authorization",
        extraHeaders: providerHeaders,
      }),
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedCustomApiKey"],
    };
  }

  if (credentialRef.credentialType === "chatgpt_codex_oauth") {
    if (request.injectedMaterial !== undefined) {
      return {
        ok: true,
        resolved: {
          envelope: createBearerAuthEnvelope({
            credentialRef,
            token: request.injectedMaterial.headers?.authorization?.replace(/^Bearer\s+/iu, "") ?? "injected-oauth-material",
            redactedIdentity: "[chatgpt-codex-oauth:injected]",
            extraHeaders: request.extraHeaders,
            expiresAt: request.injectedMaterial.expiresAt,
          }).envelope,
          privateMaterial: {
            headers: {
              ...(request.injectedMaterial.headers ?? {}),
              ...(request.extraHeaders ?? {}),
            },
            query: request.injectedMaterial.query,
            expiresAt: request.injectedMaterial.expiresAt,
          },
        },
        events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedInjectedCodexOAuth"],
      };
    }

    if (credentialRef.source.kind !== "codex-auth-file" || !hasText(credentialRef.source.filePath)) {
      return failure("MISSING_SECRET_MATERIAL", "Codex OAuth credentialRef requires an explicit codex-auth-file source", "source", credentialRef);
    }

    const text = request.readFile?.(credentialRef.source.filePath);
    if (!hasText(text)) {
      return failure("MISSING_SECRET_MATERIAL", "Codex OAuth auth file was not available through the injected reader", "source", credentialRef);
    }

    const parsed = parseChatGPTCodexAuthJson(text);
    if (!parsed.ok) {
      return failure("INVALID_CODEX_AUTH_FILE", parsed.error.message, "credential", credentialRef);
    }

    return {
      ok: true,
      resolved: createChatGPTCodexAuthEnvelope({
        credentialRef,
        snapshot: parsed.snapshot,
        extraHeaders: request.extraHeaders,
      }),
      events: ["agentCore.modelAdapter.authProfile.authResolver.resolvedCodexOAuth"],
    };
  }

  return failure(
    "UNSUPPORTED_CREDENTIAL_TYPE",
    `authResolver does not support credentialType ${String(redactSecretRecord(credentialRef.credentialType))}`,
    "credential",
    credentialRef,
  );
}
