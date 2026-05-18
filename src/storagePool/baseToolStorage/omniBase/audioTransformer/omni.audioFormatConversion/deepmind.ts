import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniAudioFormatConversionRuntimeProvider, type OmniAudioFormatConversionDependencies, type OmniAudioFormatConversionPracticeProviderName } from './dependencies.js';
import type { OmniAudioFormatConversionProvider } from './core.js';

export const deepmindOmniAudioFormatConversionPractice: OmniProviderPracticeMetadata<
  OmniAudioFormatConversionPracticeProviderName,
  OmniAudioFormatConversionProvider,
  OmniAudioFormatConversionDependencies
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
    return createOmniAudioFormatConversionRuntimeProvider(dependencies);
  },
};
