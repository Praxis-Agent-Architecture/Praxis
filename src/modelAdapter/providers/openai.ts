import { openAIChatProtocol } from "../protocols/index.js";
import type { RaxProviderDefinition } from "../registry/index.js";

export const openAIProvider: RaxProviderDefinition = {
  id: "openai",
  displayName: "OpenAI",
  routes: [
    {
      id: "openai",
      providerId: "openai",
      protocol: openAIChatProtocol,
      endpoint: {
        baseUrl: "https://api.openai.com",
        path: "/v1/chat/completions",
        allowedNativeOptions: ["parallel_tool_calls", "service_tier", "store", "metadata"],
      },
    },
  ],
  compat: {
    providerId: "openai",
    protocolId: "openai.chat",
    supportsTools: true,
    supportsStreaming: true,
    supportsUsageInStreaming: true,
    supportsDeveloperRole: false,
    supportsStrictToolSchema: true,
    maxTokensField: "max_tokens",
    allowedNativeOptions: ["parallel_tool_calls", "service_tier", "store", "metadata"],
  },
  authEnv: ["OPENAI_API_KEY"],
  auth: { type: "api_key", env: ["OPENAI_API_KEY"], header: "Authorization" },
  models: [
    { providerId: "openai", modelId: "gpt-5.4", protocolId: "openai.chat", supportsTools: true, supportsReasoning: true, status: "unknown" },
    { providerId: "openai", modelId: "gpt-5.4-mini", protocolId: "openai.chat", supportsTools: true, supportsReasoning: true, status: "unknown" },
  ],
};
