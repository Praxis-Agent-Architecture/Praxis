import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniAudioCompressionRuntimeProvider, type OmniAudioCompressionDependencies, type OmniAudioCompressionPracticeProviderName } from './dependencies.js';
import type { OmniAudioCompressionProvider } from './core.js';

export const anthropicOmniAudioCompressionPractice: OmniProviderPracticeMetadata<
  OmniAudioCompressionPracticeProviderName,
  OmniAudioCompressionProvider,
  OmniAudioCompressionDependencies
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
    return createOmniAudioCompressionRuntimeProvider(dependencies);
  },
};
