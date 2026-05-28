import { anthropicMessagesProtocol } from "../protocols/index.js";
import type { RaxProviderDefinition } from "../registry/index.js";

export const anthropicProvider: RaxProviderDefinition = {
  id: "anthropic",
  displayName: "Anthropic",
  routes: [
    {
      id: "anthropic",
      providerId: "anthropic",
      protocol: anthropicMessagesProtocol,
      endpoint: {
        baseUrl: "https://api.anthropic.com",
        path: "/v1/messages",
        defaultHeaders: { "anthropic-version": "2023-06-01" },
        allowedNativeOptions: ["anthropic-beta", "service_tier"],
      },
    },
  ],
  compat: {
    providerId: "anthropic",
    protocolId: "anthropic.messages",
    supportsTools: true,
    supportsStreaming: true,
    supportsUsageInStreaming: true,
    supportsStrictToolSchema: false,
    maxTokensField: "max_tokens",
    allowedNativeOptions: ["anthropic-beta", "service_tier"],
  },
  authEnv: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
  auth: { type: "api_key", env: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"], header: "x-api-key" },
  models: [
    { providerId: "anthropic", modelId: "claude-sonnet-4-5", protocolId: "anthropic.messages", supportsTools: true, status: "unknown" },
    { providerId: "anthropic", modelId: "claude-opus-4-1", protocolId: "anthropic.messages", supportsTools: true, status: "unknown" },
  ],
};
