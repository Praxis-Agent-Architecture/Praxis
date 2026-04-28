import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateAudioRuntimeProvider, type OmniGenerateAudioDependencies, type OmniGenerateAudioPracticeProviderName } from './dependencies.js';
import type { OmniGenerateAudioProvider } from './core.js';

export const openaiOmniGenerateAudioPractice: OmniProviderPracticeMetadata<
  OmniGenerateAudioPracticeProviderName,
  OmniGenerateAudioProvider,
  OmniGenerateAudioDependencies
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
    "OpenAI audio generation practice uses the Audio API speech endpoint for text-to-speech output.",
    "As of the 2026-04-28 docs check, the documented speech path uses GPT-4o mini TTS with built-in voices and optional streaming.",
    "Runtime owns voice/model selection, output format, streaming, storage, and AI-voice disclosure policy enforcement.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateAudioRuntimeProvider(dependencies);
  },
};
