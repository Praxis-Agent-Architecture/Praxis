import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateImageRuntimeProvider, type OmniGenerateImageDependencies, type OmniGenerateImagePracticeProviderName } from './dependencies.js';
import type { OmniGenerateImageProvider } from './core.js';

export const deepmindOmniGenerateImagePractice: OmniProviderPracticeMetadata<
  OmniGenerateImagePracticeProviderName,
  OmniGenerateImageProvider,
  OmniGenerateImageDependencies
> = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI @google/genai Part practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_1/packages/cli/src/acp/acpClient.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: [
    "Gemini image generation practice uses Nano Banana / Nano Banana Pro style image models through generateContent.",
    "As of the 2026-04-28 docs check, examples include gemini-2.5-flash-image and gemini-3-pro-image-preview returning TEXT and IMAGE parts.",
    "Runtime owns Part construction, inlineData/fileData handling, response part parsing, base64 bytes, and artifact storage.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateImageRuntimeProvider(dependencies);
  },
};
