import { createRuntimeOmniViewImageProvider, type OmniViewImageProviderPractice } from "./dependencies.js";

export const anthropicOmniViewImagePractice: OmniViewImageProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code bridge image block normalization",
    path: "~/Desktop/three/claude_code_2_1_88/bridge/inboundMessages.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code bridge/inboundMessages.ts accepts image content blocks and normalizes malformed base64 image sources to include media_type.",
    "The bridge can infer media_type from base64 image data when client payloads omit it or send camelCase mediaType.",
    "Praxis does not copy that content-block contract into omniBase; runtime/modelAdapter owns bytes, base64, and provider lowering.",
  ],
  createProvider(dependencies) {
    return dependencies.provider ?? createRuntimeOmniViewImageProvider(dependencies.executor);
  },
};
