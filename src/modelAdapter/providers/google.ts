import { googleGenerateContentProtocol } from "../protocols/index.js";
import type { RaxProviderDefinition } from "../registry/index.js";

export const googleProvider: RaxProviderDefinition = {
  id: "google",
  displayName: "Google Gemini",
  routes: [
    {
      id: "google",
      providerId: "google",
      protocol: googleGenerateContentProtocol,
      endpoint: {
        baseUrl: "https://generativelanguage.googleapis.com",
        path: "/v1beta/models/{model}:streamGenerateContent",
        allowedNativeOptions: ["safetySettings", "toolConfig", "cachedContent"],
      },
    },
  ],
  compat: {
    providerId: "google",
    protocolId: "google.generate_content",
    supportsTools: true,
    supportsStreaming: true,
    supportsUsageInStreaming: true,
    supportsStrictToolSchema: false,
    maxTokensField: "max_output_tokens",
    allowedNativeOptions: ["safetySettings", "toolConfig", "cachedContent"],
  },
  authEnv: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  auth: { type: "api_key", env: ["GOOGLE_API_KEY", "GEMINI_API_KEY"], header: "x-goog-api-key" },
  models: [
    { providerId: "google", modelId: "gemini-2.5-pro", protocolId: "google.generate_content", supportsTools: true, status: "unknown" },
    { providerId: "google", modelId: "gemini-2.5-flash", protocolId: "google.generate_content", supportsTools: true, status: "unknown" },
  ],
};
