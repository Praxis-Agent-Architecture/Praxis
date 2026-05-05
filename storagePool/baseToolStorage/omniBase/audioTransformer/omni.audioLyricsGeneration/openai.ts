import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniAudioLyricsGenerationRuntimeProvider, type OmniAudioLyricsGenerationDependencies, type OmniAudioLyricsGenerationPracticeProviderName } from './dependencies.js';
import type { OmniAudioLyricsGenerationProvider } from './core.js';

export const openaiOmniAudioLyricsGenerationPractice: OmniProviderPracticeMetadata<
  OmniAudioLyricsGenerationPracticeProviderName,
  OmniAudioLyricsGenerationProvider,
  OmniAudioLyricsGenerationDependencies
> = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex and OpenAI runtime media practice",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/sdk/typescript/src/thread.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: ["Codex practice treats local media paths and artifacts as runtime-owned material carriers.", "omniBase keeps operation metadata and lets executor.omni.transformMedia decide endpoint compatibility."],
  createProvider(dependencies) {
    return createOmniAudioLyricsGenerationRuntimeProvider(dependencies);
  },
};
