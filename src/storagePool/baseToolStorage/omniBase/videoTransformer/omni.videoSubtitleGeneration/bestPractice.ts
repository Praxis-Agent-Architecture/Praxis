import type { BaseToolInvokeRequest } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniVideoSubtitleGenerationPractice } from './anthropic.js';
import { deepmindOmniVideoSubtitleGenerationPractice } from './deepmind.js';
import { createOmniVideoSubtitleGenerationRuntimeProvider, omniVideoSubtitleGenerationDependencyDeclarations, type OmniVideoSubtitleGenerationDependencies } from './dependencies.js';
import { openaiOmniVideoSubtitleGenerationPractice } from './openai.js';
import {
  executeOmniVideoSubtitleGenerationCore,
  type OmniVideoSubtitleGenerationOutput,
  type OmniVideoSubtitleGenerationRequest,
} from './core.js';

export const omniVideoSubtitleGenerationPractices = [
  anthropicOmniVideoSubtitleGenerationPractice,
  openaiOmniVideoSubtitleGenerationPractice,
  deepmindOmniVideoSubtitleGenerationPractice,
] as const;

export function selectOmniVideoSubtitleGenerationPractice(dependencies: OmniVideoSubtitleGenerationDependencies = {}) {
  return selectOmniProviderPractice(
    omniVideoSubtitleGenerationPractices,
    dependencies,
    {
      providerName: 'praxis-native',
      source: { kind: 'praxis-native', label: 'Praxis runtime omni executor' },
      directCliSupport: false,
      sideEffectPolicy: 'runtime-governed',
      notes: [
        'Fallback practice uses BaseToolExecutorPort.omni.transformMedia.',
        'No media bytes, uploads, model endpoint selection, or codec work is performed inside omniBase.',
      ],
      createProvider: createOmniVideoSubtitleGenerationRuntimeProvider,
    },
  );
}

export const omniVideoSubtitleGenerationDefinition = createOmniBaseToolDefinition<OmniVideoSubtitleGenerationRequest, OmniVideoSubtitleGenerationOutput>({
  toolId: "omni.videoSubtitleGeneration",
  title: "Generate video subtitles",
  description: "Prepare a video subtitle extraction request while leaving decode and ASR to runtime.",
  summary: "Prepare a video subtitle extraction request while leaving decode and ASR to runtime.",
  storageGroup: "videoTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:video:read", "provider:invoke"],
  dependencies: omniVideoSubtitleGenerationDependencyDeclarations,
  inputSchema: jsonSchema("omni.videoSubtitleGeneration.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.videoSubtitleGeneration.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniVideoSubtitleGeneration(
  request: BaseToolInvokeRequest<OmniVideoSubtitleGenerationRequest>,
  dependencies: OmniVideoSubtitleGenerationDependencies = {},
) {
  const selection = selectOmniVideoSubtitleGenerationPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniVideoSubtitleGenerationCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniVideoSubtitleGenerationRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniVideoSubtitleGenerationHandler = createOmniCoreHandler(omniVideoSubtitleGenerationDefinition, executeOmniVideoSubtitleGeneration);
