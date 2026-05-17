/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / Provider Carrier。
 * 核心目的：把 provider、endpoint、model、credentialRef、scope 和缓存意图整理成可路由对象。
 * 能力要求1：支持 OpenAI、Anthropic、DeepMind 和 custom provider 的统一 carrier 形状。
 * 能力要求2：把 cachePolicy 作为经济控制预留接口，但第一期不执行缓存策略。
 * 能力要求3：carrier 只引用 credentialRef，不保存 raw credential。
 * 边界：不解析 auth、不发送请求、不做 PromptPack 映射。
 * 对接：被 providerCarrierRegistry、providerProbe、runtime.modelAdapter registry 和 actualInvocationLayer binding 使用。
 * 实现提示：保持显式输入和 public-safe 输出，让上层 harness 能稳定编码使用。
 */

import type { CredentialRef } from "../authProfileLayer/credentialRef.js";
import { isDeepSeekV4Model } from "./modelMetadataRegistry.js";

export type ProviderKind = "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});

export type ProviderEndpointShape =
  | "responses"
  | "chat_completions"
  | "messages"
  | "completion"
  | "embedding"
  | "image"
  | "audio"
  | "realtime"
  | "video"
  | "files"
  | "vector-store"
  | "skills"
  | "custom"
  | (string & {});

export type ProviderCachePolicy = {
  intent: "none" | "prefer-provider-cache" | "require-provider-cache";
  vendorHints?: Readonly<Record<string, unknown>>;
};

export type ProviderReasoningConfig = {
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | (string & {});
  summary?: "auto" | "concise" | "detailed" | "none" | (string & {});
};

export type ProviderCarrierInput = {
  carrierId?: string;
  provider?: ProviderKind;
  endpointShape?: ProviderEndpointShape;
  baseURL?: string;
  model?: string;
  reasoning?: ProviderReasoningConfig;
  credentialRef?: CredentialRef;
  scopes?: readonly string[];
  capabilities?: readonly string[];
  cachePolicy?: ProviderCachePolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ProviderCarrier = {
  carrierId: string;
  provider: ProviderKind;
  endpointShape: ProviderEndpointShape;
  baseURL?: string;
  model?: string;
  reasoning?: ProviderReasoningConfig;
  credentialRef?: CredentialRef;
  scopes: readonly string[];
  capabilities: readonly string[];
  cachePolicy: ProviderCachePolicy;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type ProviderCarrierResult =
  | { ok: true; carrier: ProviderCarrier; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "MISSING_CARRIER_ID" | "MISSING_PROVIDER" | "MISSING_ENDPOINT_SHAPE";
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

export function createProviderCarrier(input: ProviderCarrierInput = {}): ProviderCarrierResult {
  if (!hasText(input.carrierId)) {
    return {
      ok: false,
      error: { code: "MISSING_CARRIER_ID", message: "providerCarrier requires a carrierId", boundary: "input", publicSafe: true },
      events: ["agentCore.modelAdapter.providerAccess.providerCarrier.rejected"],
    };
  }

  if (!hasText(input.provider)) {
    return {
      ok: false,
      error: { code: "MISSING_PROVIDER", message: "providerCarrier requires a provider", boundary: "input", publicSafe: true },
      events: ["agentCore.modelAdapter.providerAccess.providerCarrier.rejected"],
    };
  }

  if (!hasText(input.endpointShape)) {
    return {
      ok: false,
      error: {
        code: "MISSING_ENDPOINT_SHAPE",
        message: "providerCarrier requires an endpointShape",
        boundary: "input",
        publicSafe: true,
      },
      events: ["agentCore.modelAdapter.providerAccess.providerCarrier.rejected"],
    };
  }

  const reasoning: ProviderReasoningConfig | undefined =
    input.reasoning === undefined
      ? undefined
      : {
          effort: input.reasoning.effort?.trim() || undefined,
          summary: input.reasoning.summary?.trim() || undefined,
        };

  return {
    ok: true,
    carrier: {
      carrierId: input.carrierId.trim(),
      provider: input.provider.trim(),
      endpointShape: input.endpointShape.trim(),
      baseURL: input.baseURL?.trim().replace(/\/+$/u, "") || undefined,
      model: input.model?.trim() || undefined,
      reasoning,
      credentialRef: input.credentialRef,
      scopes: cleanList(input.scopes),
      capabilities: cleanList(input.capabilities),
      cachePolicy: input.cachePolicy ?? { intent: "none" },
      metadata: input.metadata ?? {},
      publicSafe: true,
    },
    events: ["agentCore.modelAdapter.providerAccess.providerCarrier.created"],
  };
}

export const OPENAI_DEFAULT_RESPONSES_BASE_URL = "https://api.openai.com" as const;
export const OPENAI_DEFAULT_CHAT_COMPLETIONS_BASE_URL = "https://api.openai.com" as const;
export const ANTHROPIC_DEFAULT_MESSAGES_BASE_URL = "https://api.anthropic.com" as const;
export const CHATGPT_CODEX_DEFAULT_BASE_URL = "https://chatgpt.com/backend-api/codex" as const;

export type ChatGPTCodexCarrierInput = Omit<
  ProviderCarrierInput,
  "provider" | "endpointShape" | "baseURL" | "credentialRef"
> & {
  credentialRef: CredentialRef;
  baseURL?: string;
  clientName?: string;
  clientVersion?: string;
};

export function createChatGPTCodexResponsesCarrier(input: ChatGPTCodexCarrierInput): ProviderCarrierResult {
  return createProviderCarrier({
    ...input,
    provider: "openai",
    endpointShape: "responses",
    baseURL: input.baseURL ?? CHATGPT_CODEX_DEFAULT_BASE_URL,
    credentialRef: input.credentialRef,
    scopes: input.scopes ?? ["model.invoke", "chatgpt.codex.responses"],
    capabilities: input.capabilities ?? ["text", "reasoning", "tool-call", "chatgpt-subscription"],
    metadata: {
      ...(input.metadata ?? {}),
      productChannel: "chatgpt-codex",
      codexAuthStyle: "Authorization+ChatGPT-Account-ID",
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.clientVersion ? { clientVersion: input.clientVersion } : {}),
    },
  });
}

export type OpenAIV1ResponsesCarrierInput = Omit<
  ProviderCarrierInput,
  "provider" | "endpointShape" | "baseURL" | "credentialRef"
> & {
  credentialRef: CredentialRef;
  baseURL?: string;
};

export function createOpenAIV1ResponsesCarrier(input: OpenAIV1ResponsesCarrierInput): ProviderCarrierResult {
  return createProviderCarrier({
    ...input,
    provider: "openai",
    endpointShape: "responses",
    baseURL: input.baseURL ?? OPENAI_DEFAULT_RESPONSES_BASE_URL,
    credentialRef: input.credentialRef,
    scopes: input.scopes ?? ["model.invoke", "openai.responses"],
    capabilities: input.capabilities ?? ["text", "reasoning", "tool-call", "streaming"],
    metadata: {
      apiVersion: "v1",
      providerRoute: "openai_responses",
      ...(input.metadata ?? {}),
    },
  });
}

export type OpenAIV1ChatCompletionsCarrierInput = Omit<
  ProviderCarrierInput,
  "provider" | "endpointShape" | "baseURL" | "credentialRef"
> & {
  credentialRef: CredentialRef;
  baseURL?: string;
};

export function createOpenAIV1ChatCompletionsCarrier(
  input: OpenAIV1ChatCompletionsCarrierInput,
): ProviderCarrierResult {
  return createProviderCarrier({
    ...input,
    provider: "openai",
    endpointShape: "chat_completions",
    baseURL: input.baseURL ?? OPENAI_DEFAULT_CHAT_COMPLETIONS_BASE_URL,
    credentialRef: input.credentialRef,
    scopes: input.scopes ?? ["model.invoke", "openai.chat_completions"],
    capabilities: input.capabilities ?? [
      "text",
      ...(isDeepSeekV4Model(input.model) ? ["reasoning"] : []),
      "tool-call",
      "streaming",
    ],
    metadata: {
      apiVersion: "v1",
      providerRoute: "openai_chat_completions",
      ...(input.metadata ?? {}),
    },
  });
}

export type AnthropicV1MessagesCarrierInput = Omit<
  ProviderCarrierInput,
  "provider" | "endpointShape" | "baseURL" | "credentialRef"
> & {
  credentialRef: CredentialRef;
  baseURL?: string;
  apiVersion?: string;
};

export function createAnthropicV1MessagesCarrier(input: AnthropicV1MessagesCarrierInput): ProviderCarrierResult {
  const apiVersion = input.apiVersion?.trim() || "2023-06-01";
  return createProviderCarrier({
    ...input,
    provider: "anthropic",
    endpointShape: "messages",
    baseURL: input.baseURL ?? ANTHROPIC_DEFAULT_MESSAGES_BASE_URL,
    credentialRef: input.credentialRef,
    scopes: input.scopes ?? ["model.invoke", "anthropic.messages"],
    capabilities: input.capabilities ?? ["text", "reasoning", "tool-call", "streaming"],
    metadata: {
      apiVersion,
      providerRoute: "anthropic_messages",
      ...(input.metadata ?? {}),
    },
  });
}
