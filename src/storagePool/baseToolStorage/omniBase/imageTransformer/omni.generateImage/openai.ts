import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateImageRuntimeProvider, type OmniGenerateImageDependencies, type OmniGenerateImagePracticeProviderName } from './dependencies.js';
import type { OmniGenerateImageProvider } from './core.js';

export const openaiOmniGenerateImagePractice: OmniProviderPracticeMetadata<
  OmniGenerateImagePracticeProviderName,
  OmniGenerateImageProvider,
  OmniGenerateImageDependencies
> = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex and OpenAI runtime media practice",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/sdk/typescript/src/thread.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: [
    "OpenAI image generation practice uses GPT Image models through the Image API or the Responses API image_generation tool.",
    "As of the 2026-04-28 docs check, GPT Image model IDs include gpt-image-1.5, gpt-image-1, and gpt-image-1-mini; runtime owns the exact model choice.",
    "Image API can return generated/edited images; Responses image_generation returns an image tool-call result, commonly as base64 material for runtime artifact storage.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateImageRuntimeProvider(dependencies);
  },
};
