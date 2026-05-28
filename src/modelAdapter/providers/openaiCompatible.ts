import { openAICompatibleChatProtocol } from "../protocols/index.js";
import type { RaxModelRoute } from "../route/index.js";
import type { RaxProviderDefinition } from "../registry/index.js";

export type RaxOpenAICompatibleProviderOptions = {
  id: string;
  displayName?: string;
  baseUrl: string;
  models?: string[];
  apiKeyEnv?: string;
  allowedNativeOptions?: string[];
};

export function createOpenAICompatibleProvider(options: RaxOpenAICompatibleProviderOptions): RaxProviderDefinition {
  const route: RaxModelRoute = {
    id: options.id,
    providerId: options.id,
    protocol: openAICompatibleChatProtocol,
    endpoint: {
      baseUrl: options.baseUrl,
      path: "/v1/chat/completions",
      allowedNativeOptions: options.allowedNativeOptions ?? [
        "frequency_penalty",
        "presence_penalty",
        "logit_bias",
        "parallel_tool_calls",
        "service_tier",
      ],
    },
  };

  return {
    id: options.id,
    displayName: options.displayName ?? options.id,
    routes: [route],
    compat: {
      providerId: options.id,
      protocolId: "openai.compatible_chat",
      supportsTools: true,
      supportsStreaming: true,
      supportsUsageInStreaming: true,
      supportsStrictToolSchema: false,
      maxTokensField: "max_tokens",
      allowedNativeOptions: route.endpoint.allowedNativeOptions,
    },
    authEnv: options.apiKeyEnv ? [options.apiKeyEnv] : undefined,
    auth: options.apiKeyEnv ? { type: "api_key", env: [options.apiKeyEnv], header: "Authorization" } : undefined,
    models: (options.models ?? []).map((modelId) => ({
      providerId: options.id,
      modelId,
      protocolId: "openai.compatible_chat",
      supportsTools: true,
      status: "unknown",
    })),
  };
}
