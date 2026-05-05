import type { OmniProviderPracticeMetadata } from '../../_shared/baseToolAdapter.js';
import { createOmniGenerateVideoRuntimeProvider, type OmniGenerateVideoDependencies, type OmniGenerateVideoPracticeProviderName } from './dependencies.js';
import type { OmniGenerateVideoProvider } from './core.js';

export const openaiOmniGenerateVideoPractice: OmniProviderPracticeMetadata<
  OmniGenerateVideoPracticeProviderName,
  OmniGenerateVideoProvider,
  OmniGenerateVideoDependencies
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
    "OpenAI video generation practice uses the Video API with Sora models and asynchronous job state.",
    "As of the 2026-04-28 docs check, Sora variants include sora-2 and sora-2-pro; runtime owns create/status/download/delete job handling.",
    "The API can accept prompt plus optional image reference material; runtime owns multipart upload, polling, and MP4 artifact persistence.",
  ],
  createProvider(dependencies) {
    return createOmniGenerateVideoRuntimeProvider(dependencies);
  },
};
