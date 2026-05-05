import { createRuntimeOmniViewImageProvider, type OmniViewImageProviderPractice } from "./dependencies.js";

export const openaiOmniViewImagePractice: OmniViewImageProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex SDK local image forwarding",
    path: "~/Desktop/three/codex_rust_0_125_0/sdk/typescript/src/thread.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex SDK thread.ts separates text prompt parts from local_image path entries and forwards images to exec.ts as image inputs.",
    "Codex CLI accepts those image paths through the --image carrier instead of making the agent tool define provider body shape.",
    "Praxis keeps omni.viewImage as a baseTool contract; runtime/modelAdapter decides whether OpenAI Responses or another carrier can accept the prepared image.",
  ],
  createProvider(dependencies) {
    return dependencies.provider ?? createRuntimeOmniViewImageProvider(dependencies.executor);
  },
};
