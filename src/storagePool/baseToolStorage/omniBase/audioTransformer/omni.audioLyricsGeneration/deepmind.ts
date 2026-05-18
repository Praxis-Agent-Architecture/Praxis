import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniAudioLyricsGenerationRuntimeProvider, type OmniAudioLyricsGenerationDependencies, type OmniAudioLyricsGenerationPracticeProviderName } from './dependencies.js';
import type { OmniAudioLyricsGenerationProvider } from './core.js';

export const deepmindOmniAudioLyricsGenerationPractice: OmniProviderPracticeMetadata<
  OmniAudioLyricsGenerationPracticeProviderName,
  OmniAudioLyricsGenerationProvider,
  OmniAudioLyricsGenerationDependencies
> = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI @google/genai Part practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_1/packages/cli/src/acp/acpClient.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: ["Gemini CLI practice uses Part arrays with inlineData/fileData for multimodal material.", "This practice file records the evidence boundary while runtime owns Part construction."],
  createProvider(dependencies) {
    return createOmniAudioLyricsGenerationRuntimeProvider(dependencies);
  },
};
