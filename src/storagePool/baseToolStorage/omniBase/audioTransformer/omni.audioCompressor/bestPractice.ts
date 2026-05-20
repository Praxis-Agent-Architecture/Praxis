import type { BaseToolInvokeRequest } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniAudioCompressionPractice } from './anthropic.js';
import { deepmindOmniAudioCompressionPractice } from './deepmind.js';
import { createOmniAudioCompressionRuntimeProvider, omniAudioCompressionDependencyDeclarations, type OmniAudioCompressionDependencies } from './dependencies.js';
import { openaiOmniAudioCompressionPractice } from './openai.js';
import {
  executeOmniAudioCompressionCore,
  type OmniAudioCompressionOutput,
  type OmniAudioCompressionRequest,
} from './core.js';

export const omniAudioCompressionPractices = [
  anthropicOmniAudioCompressionPractice,
  openaiOmniAudioCompressionPractice,
  deepmindOmniAudioCompressionPractice,
] as const;

export function selectOmniAudioCompressionPractice(dependencies: OmniAudioCompressionDependencies = {}) {
  return selectOmniProviderPractice(
    omniAudioCompressionPractices,
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
      createProvider: createOmniAudioCompressionRuntimeProvider,
    },
  );
}

export const omniAudioCompressionDefinition = createOmniBaseToolDefinition<OmniAudioCompressionRequest, OmniAudioCompressionOutput>({
  toolId: "omni.audioCompressor",
  title: "Compress audio",
  description: "Prepare an audio compression request for the runtime-owned omni media pipeline.",
  summary: "Prepare an audio compression request for the runtime-owned omni media pipeline.",
  storageGroup: "audioTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:audio:read", "omni:audio:write"],
  dependencies: omniAudioCompressionDependencyDeclarations,
  inputSchema: jsonSchema("omni.audioCompressor.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.audioCompressor.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniAudioCompression(
  request: BaseToolInvokeRequest<OmniAudioCompressionRequest>,
  dependencies: OmniAudioCompressionDependencies = {},
) {
  const selection = selectOmniAudioCompressionPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniAudioCompressionCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniAudioCompressionRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniAudioCompressionHandler = createOmniCoreHandler(omniAudioCompressionDefinition, executeOmniAudioCompression);
