import type { BaseToolInvokeRequest } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js';
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniListenAudioPractice } from './anthropic.js';
import { deepmindOmniListenAudioPractice } from './deepmind.js';
import { createOmniListenAudioRuntimeProvider, omniListenAudioDependencyDeclarations, type OmniListenAudioDependencies } from './dependencies.js';
import { openaiOmniListenAudioPractice } from './openai.js';
import {
  executeOmniListenAudioCore,
  type OmniListenAudioOutput,
  type OmniListenAudioRequest,
} from './core.js';

export const omniListenAudioPractices = [
  anthropicOmniListenAudioPractice,
  openaiOmniListenAudioPractice,
  deepmindOmniListenAudioPractice,
] as const;

export function selectOmniListenAudioPractice(dependencies: OmniListenAudioDependencies = {}) {
  return selectOmniProviderPractice(
    omniListenAudioPractices,
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
      createProvider: createOmniListenAudioRuntimeProvider,
    },
  );
}

export const omniListenAudioDefinition = createOmniBaseToolDefinition<OmniListenAudioRequest, OmniListenAudioOutput>({
  toolId: "omni.listenAudio",
  title: "Listen to audio",
  description: "Prepare an audio understanding request while leaving decoding and provider lowering to runtime.",
  summary: "Prepare an audio understanding request while leaving decoding and provider lowering to runtime.",
  storageGroup: "audioTransformer",
  riskLevel: "normal",
  permissionHints: ["omni:audio:read", "provider:invoke"],
  dependencies: omniListenAudioDependencyDeclarations,
  inputSchema: jsonSchema("omni.listenAudio.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.listenAudio.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniListenAudio(
  request: BaseToolInvokeRequest<OmniListenAudioRequest>,
  dependencies: OmniListenAudioDependencies = {},
) {
  const selection = selectOmniListenAudioPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniListenAudioCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniListenAudioRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniListenAudioHandler = createOmniCoreHandler(omniListenAudioDefinition, executeOmniListenAudio);
