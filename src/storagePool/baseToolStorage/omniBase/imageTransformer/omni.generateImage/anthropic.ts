import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateImageRuntimeProvider, type OmniGenerateImageDependencies, type OmniGenerateImagePracticeProviderName } from './dependencies.js';
import type { OmniGenerateImageProvider } from './core.js';

export const anthropicOmniGenerateImagePractice: OmniProviderPracticeMetadata<
  OmniGenerateImagePracticeProviderName,
  OmniGenerateImageProvider,
  OmniGenerateImageDependencies
> = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code media/tool-result practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/bridge/inboundMessages.ts",
  },
  directCliSupport: false,
  sideEffectPolicy: 'runtime-governed',
  notes: [
    "Anthropic documentation and Claude Code practice are used here as multimodal input/tool-result evidence, not as a media generation backend.",
    "Claude vision/files support image and file inputs for analysis, but omniBase does not expose an Anthropic image, audio, or video generation adapter.",
    "If an external Anthropic-compatible gateway adds media generation, runtime/provider registration must advertise it explicitly instead of relying on this practice.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateImageRuntimeProvider(dependencies);
  },
};
