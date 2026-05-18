import type { BaseToolInvokeRequest } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js';
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniGenerateAudioPractice } from './anthropic.js';
import { deepmindOmniGenerateAudioPractice } from './deepmind.js';
import { createOmniGenerateAudioRuntimeProvider, omniGenerateAudioDependencyDeclarations, type OmniGenerateAudioDependencies } from './dependencies.js';
import { openaiOmniGenerateAudioPractice } from './openai.js';
import {
  executeOmniGenerateAudioCore,
  type OmniGenerateAudioOutput,
  type OmniGenerateAudioRequest,
} from './core.js';

export const omniGenerateAudioPractices = [
  anthropicOmniGenerateAudioPractice,
  openaiOmniGenerateAudioPractice,
  deepmindOmniGenerateAudioPractice,
] as const;

export function selectOmniGenerateAudioPractice(dependencies: OmniGenerateAudioDependencies = {}) {
  return selectOmniProviderPractice(
    omniGenerateAudioPractices,
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
      createProvider: createOmniGenerateAudioRuntimeProvider,
    },
  );
}

export const omniGenerateAudioDefinition = createOmniBaseToolDefinition<OmniGenerateAudioRequest, OmniGenerateAudioOutput>({
  toolId: "omni.generateAudio",
  title: "Generate audio",
  description: "Prepare an audio generation request for provider-backed runtime execution.",
  summary: "Prepare an audio generation request for provider-backed runtime execution.",
  storageGroup: "audioTransformer",
  riskLevel: "risky",
  permissionHints: ["provider:invoke", "omni:audio:generate", "omni:audio:write"],
  dependencies: omniGenerateAudioDependencyDeclarations,
  inputSchema: jsonSchema("omni.generateAudio.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.generateAudio.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniGenerateAudio(
  request: BaseToolInvokeRequest<OmniGenerateAudioRequest>,
  dependencies: OmniGenerateAudioDependencies = {},
) {
  const selection = selectOmniGenerateAudioPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniGenerateAudioCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniGenerateAudioRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniGenerateAudioHandler = createOmniCoreHandler(omniGenerateAudioDefinition, executeOmniGenerateAudio);
