import type { BaseToolInvokeRequest } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js';
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniVideoFormatConversionPractice } from './anthropic.js';
import { deepmindOmniVideoFormatConversionPractice } from './deepmind.js';
import { createOmniVideoFormatConversionRuntimeProvider, omniVideoFormatConversionDependencyDeclarations, type OmniVideoFormatConversionDependencies } from './dependencies.js';
import { openaiOmniVideoFormatConversionPractice } from './openai.js';
import {
  executeOmniVideoFormatConversionCore,
  type OmniVideoFormatConversionOutput,
  type OmniVideoFormatConversionRequest,
} from './core.js';

export const omniVideoFormatConversionPractices = [
  anthropicOmniVideoFormatConversionPractice,
  openaiOmniVideoFormatConversionPractice,
  deepmindOmniVideoFormatConversionPractice,
] as const;

export function selectOmniVideoFormatConversionPractice(dependencies: OmniVideoFormatConversionDependencies = {}) {
  return selectOmniProviderPractice(
    omniVideoFormatConversionPractices,
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
      createProvider: createOmniVideoFormatConversionRuntimeProvider,
    },
  );
}

export const omniVideoFormatConversionDefinition = createOmniBaseToolDefinition<OmniVideoFormatConversionRequest, OmniVideoFormatConversionOutput>({
  toolId: "omni.videoFormatConversion",
  title: "Convert video format",
  description: "Prepare a video format conversion request for the runtime-owned omni media pipeline.",
  summary: "Prepare a video format conversion request for the runtime-owned omni media pipeline.",
  storageGroup: "videoTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:video:read", "omni:video:write"],
  dependencies: omniVideoFormatConversionDependencyDeclarations,
  inputSchema: jsonSchema("omni.videoFormatConversion.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.videoFormatConversion.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniVideoFormatConversion(
  request: BaseToolInvokeRequest<OmniVideoFormatConversionRequest>,
  dependencies: OmniVideoFormatConversionDependencies = {},
) {
  const selection = selectOmniVideoFormatConversionPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniVideoFormatConversionCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniVideoFormatConversionRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniVideoFormatConversionHandler = createOmniCoreHandler(omniVideoFormatConversionDefinition, executeOmniVideoFormatConversion);
