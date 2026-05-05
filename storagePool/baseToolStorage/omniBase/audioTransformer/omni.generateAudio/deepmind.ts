import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateAudioRuntimeProvider, type OmniGenerateAudioDependencies, type OmniGenerateAudioPracticeProviderName } from './dependencies.js';
import type { OmniGenerateAudioProvider } from './core.js';

export const deepmindOmniGenerateAudioPractice: OmniProviderPracticeMetadata<
  OmniGenerateAudioPracticeProviderName,
  OmniGenerateAudioProvider,
  OmniGenerateAudioDependencies
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
    "Gemini audio generation practice uses native Gemini TTS models for text-to-speech output.",
    "As of the 2026-04-28 docs check, supported preview TTS models include Gemini 2.5 Flash Preview TTS and Gemini 2.5 Pro Preview TTS.",
    "Runtime owns single-speaker versus multispeaker config, response audio decoding, format conversion, and artifact storage.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateAudioRuntimeProvider(dependencies);
  },
};
