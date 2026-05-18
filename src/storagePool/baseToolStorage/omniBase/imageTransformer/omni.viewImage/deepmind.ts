import { createRuntimeOmniViewImageProvider, type OmniViewImageProviderPractice } from "./dependencies.js";

export const deepmindOmniViewImagePractice: OmniViewImageProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI ACP content block to @google/genai Part lowering",
    path: "~/Desktop/three/gemini_cli_0_39_1/packages/cli/src/acp/acpClient.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI acpClient.ts lowers text blocks to { text }, image/audio blocks to inlineData { mimeType, data }, and file resource links to fileData.",
    "ACP resource blocks are tracked as embedded context; later processing can resolve file/resource context before generateContent receives provider-specific Part arrays.",
    "The local Praxis DeepMind v1beta_models_generateContent adapter accepts an opaque provider request body and marks providerFieldsOpaque: true.",
    "Therefore omni.viewImage must not define Gemini's unified media protocol itself; runtime/modelAdapter owns Part[] construction.",
  ],
  createProvider(dependencies) {
    return dependencies.provider ?? createRuntimeOmniViewImageProvider(dependencies.executor);
  },
};
