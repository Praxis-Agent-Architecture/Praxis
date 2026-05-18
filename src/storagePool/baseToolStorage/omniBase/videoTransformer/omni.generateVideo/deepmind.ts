import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateVideoRuntimeProvider, type OmniGenerateVideoDependencies, type OmniGenerateVideoPracticeProviderName } from './dependencies.js';
import type { OmniGenerateVideoProvider } from './core.js';

export const deepmindOmniGenerateVideoPractice: OmniProviderPracticeMetadata<
  OmniGenerateVideoPracticeProviderName,
  OmniGenerateVideoProvider,
  OmniGenerateVideoDependencies
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
    "Gemini video generation practice uses Veo through the Gemini API generateVideos path.",
    "As of the 2026-04-28 docs check, examples include veo-3.1-generate-preview with prompt, image, lastFrame, referenceImages, and operation polling.",
    "Runtime owns long-running operation polling, file download, SynthID/safety metadata, and generated video artifact retention.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateVideoRuntimeProvider(dependencies);
  },
};
