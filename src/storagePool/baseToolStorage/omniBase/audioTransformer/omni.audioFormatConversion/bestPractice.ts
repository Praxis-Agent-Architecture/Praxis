import type { BaseToolInvokeRequest } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniAudioFormatConversionPractice } from './anthropic.js';
import { deepmindOmniAudioFormatConversionPractice } from './deepmind.js';
import { createOmniAudioFormatConversionRuntimeProvider, omniAudioFormatConversionDependencyDeclarations, type OmniAudioFormatConversionDependencies } from './dependencies.js';
import { openaiOmniAudioFormatConversionPractice } from './openai.js';
import {
  executeOmniAudioFormatConversionCore,
  type OmniAudioFormatConversionOutput,
  type OmniAudioFormatConversionRequest,
} from './core.js';

export const omniAudioFormatConversionPractices = [
  anthropicOmniAudioFormatConversionPractice,
  openaiOmniAudioFormatConversionPractice,
  deepmindOmniAudioFormatConversionPractice,
] as const;

export function selectOmniAudioFormatConversionPractice(dependencies: OmniAudioFormatConversionDependencies = {}) {
  return selectOmniProviderPractice(
    omniAudioFormatConversionPractices,
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
      createProvider: createOmniAudioFormatConversionRuntimeProvider,
    },
  );
}

export const omniAudioFormatConversionDefinition = createOmniBaseToolDefinition<OmniAudioFormatConversionRequest, OmniAudioFormatConversionOutput>({
  toolId: "omni.audioFormatConversion",
  title: "Convert audio format",
  description: "Prepare an audio format conversion request for the runtime-owned omni media pipeline.",
  summary: "Prepare an audio format conversion request for the runtime-owned omni media pipeline.",
  storageGroup: "audioTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:audio:read", "omni:audio:write"],
  dependencies: omniAudioFormatConversionDependencyDeclarations,
  inputSchema: jsonSchema("omni.audioFormatConversion.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.audioFormatConversion.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniAudioFormatConversion(
  request: BaseToolInvokeRequest<OmniAudioFormatConversionRequest>,
  dependencies: OmniAudioFormatConversionDependencies = {},
) {
  const selection = selectOmniAudioFormatConversionPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniAudioFormatConversionCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniAudioFormatConversionRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniAudioFormatConversionHandler = createOmniCoreHandler(omniAudioFormatConversionDefinition, executeOmniAudioFormatConversion);
