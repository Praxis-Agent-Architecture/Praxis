import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniImageFormatConversionRuntimeProvider, type OmniImageFormatConversionDependencies, type OmniImageFormatConversionPracticeProviderName } from './dependencies.js';
import type { OmniImageFormatConversionProvider } from './core.js';

export const deepmindOmniImageFormatConversionPractice: OmniProviderPracticeMetadata<
  OmniImageFormatConversionPracticeProviderName,
  OmniImageFormatConversionProvider,
  OmniImageFormatConversionDependencies
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
    return createOmniImageFormatConversionRuntimeProvider(dependencies);
  },
};
