import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniAudioLyricsGenerationRuntimeProvider, type OmniAudioLyricsGenerationDependencies, type OmniAudioLyricsGenerationPracticeProviderName } from './dependencies.js';
import type { OmniAudioLyricsGenerationProvider } from './core.js';

export const anthropicOmniAudioLyricsGenerationPractice: OmniProviderPracticeMetadata<
  OmniAudioLyricsGenerationPracticeProviderName,
  OmniAudioLyricsGenerationProvider,
  OmniAudioLyricsGenerationDependencies
> = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code media/tool-result practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/bridge/inboundMessages.ts",
  },
  directCliSupport: false,
  sideEffectPolicy: 'runtime-governed',
  notes: ["Claude practice is recorded as multimodal input and tool-result evidence only for this tool.", "No Anthropic generation adapter is mounted in omniBase; runtime/provider routing must choose a real backend."],
  createProvider(dependencies) {
    return createOmniAudioLyricsGenerationRuntimeProvider(dependencies);
  },
};
