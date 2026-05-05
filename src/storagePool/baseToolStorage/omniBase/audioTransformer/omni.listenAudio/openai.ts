import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniListenAudioRuntimeProvider, type OmniListenAudioDependencies, type OmniListenAudioPracticeProviderName } from './dependencies.js';
import type { OmniListenAudioProvider } from './core.js';

export const openaiOmniListenAudioPractice: OmniProviderPracticeMetadata<
  OmniListenAudioPracticeProviderName,
  OmniListenAudioProvider,
  OmniListenAudioDependencies
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
    return createOmniListenAudioRuntimeProvider(dependencies);
  },
};
