import type { BaseToolInvokeRequest } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniAudioLyricsGenerationPractice } from './anthropic.js';
import { deepmindOmniAudioLyricsGenerationPractice } from './deepmind.js';
import { createOmniAudioLyricsGenerationRuntimeProvider, omniAudioLyricsGenerationDependencyDeclarations, type OmniAudioLyricsGenerationDependencies } from './dependencies.js';
import { openaiOmniAudioLyricsGenerationPractice } from './openai.js';
import {
  executeOmniAudioLyricsGenerationCore,
  type OmniAudioLyricsGenerationOutput,
  type OmniAudioLyricsGenerationRequest,
} from './core.js';

export const omniAudioLyricsGenerationPractices = [
  anthropicOmniAudioLyricsGenerationPractice,
  openaiOmniAudioLyricsGenerationPractice,
  deepmindOmniAudioLyricsGenerationPractice,
] as const;

export function selectOmniAudioLyricsGenerationPractice(dependencies: OmniAudioLyricsGenerationDependencies = {}) {
  return selectOmniProviderPractice(
    omniAudioLyricsGenerationPractices,
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
      createProvider: createOmniAudioLyricsGenerationRuntimeProvider,
    },
  );
}

export const omniAudioLyricsGenerationDefinition = createOmniBaseToolDefinition<OmniAudioLyricsGenerationRequest, OmniAudioLyricsGenerationOutput>({
  toolId: "omni.audioLyricsGeneration",
  title: "Generate audio lyrics",
  description: "Prepare an audio transcription or lyric generation request without owning audio decoding.",
  summary: "Prepare an audio transcription or lyric generation request without owning audio decoding.",
  storageGroup: "audioTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:audio:read", "provider:invoke"],
  dependencies: omniAudioLyricsGenerationDependencyDeclarations,
  inputSchema: jsonSchema("omni.audioLyricsGeneration.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.audioLyricsGeneration.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniAudioLyricsGeneration(
  request: BaseToolInvokeRequest<OmniAudioLyricsGenerationRequest>,
  dependencies: OmniAudioLyricsGenerationDependencies = {},
) {
  const selection = selectOmniAudioLyricsGenerationPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniAudioLyricsGenerationCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniAudioLyricsGenerationRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniAudioLyricsGenerationHandler = createOmniCoreHandler(omniAudioLyricsGenerationDefinition, executeOmniAudioLyricsGeneration);
