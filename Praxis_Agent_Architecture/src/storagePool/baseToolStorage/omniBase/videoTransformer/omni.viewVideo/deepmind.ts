import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniViewVideoRuntimeProvider, type OmniViewVideoDependencies, type OmniViewVideoPracticeProviderName } from './dependencies.js';
import type { OmniViewVideoProvider } from './core.js';

export const deepmindOmniViewVideoPractice: OmniProviderPracticeMetadata<
  OmniViewVideoPracticeProviderName,
  OmniViewVideoProvider,
  OmniViewVideoDependencies
> = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI @google/genai Part practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_1/packages/cli/src/acp/acpClient.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: 'runtime-governed',
  notes: ["Gemini CLI practice lowers text, image, audio, resource_link, and resource inputs into @google/genai Part arrays.", "Video understanding can use fileData/inlineData or preprocessing, but omniBase only forwards the stable operation request."],
  createProvider(dependencies) {
    return createOmniViewVideoRuntimeProvider(dependencies);
  },
};
