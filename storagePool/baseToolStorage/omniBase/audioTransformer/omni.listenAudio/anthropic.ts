import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniListenAudioRuntimeProvider, type OmniListenAudioDependencies, type OmniListenAudioPracticeProviderName } from './dependencies.js';
import type { OmniListenAudioProvider } from './core.js';

export const anthropicOmniListenAudioPractice: OmniProviderPracticeMetadata<
  OmniListenAudioPracticeProviderName,
  OmniListenAudioProvider,
  OmniListenAudioDependencies
> = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code media/tool-result practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/bridge/inboundMessages.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: ["Claude Code practice keeps media as structured input blocks or tool-result artifacts.", "omniBase mirrors the carrier boundary only; runtime owns bytes, uploads, and provider-specific payload lowering."],
  createProvider(dependencies) {
    return createOmniListenAudioRuntimeProvider(dependencies);
  },
};
