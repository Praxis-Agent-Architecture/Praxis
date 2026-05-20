import type { BaseToolInvokeRequest } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniVideoCompressorPractice } from './anthropic.js';
import { deepmindOmniVideoCompressorPractice } from './deepmind.js';
import { createOmniVideoCompressorRuntimeProvider, omniVideoCompressorDependencyDeclarations, type OmniVideoCompressorDependencies } from './dependencies.js';
import { openaiOmniVideoCompressorPractice } from './openai.js';
import {
  executeOmniVideoCompressorCore,
  type OmniVideoCompressorOutput,
  type OmniVideoCompressorRequest,
} from './core.js';

export const omniVideoCompressorPractices = [
  anthropicOmniVideoCompressorPractice,
  openaiOmniVideoCompressorPractice,
  deepmindOmniVideoCompressorPractice,
] as const;

export function selectOmniVideoCompressorPractice(dependencies: OmniVideoCompressorDependencies = {}) {
  return selectOmniProviderPractice(
    omniVideoCompressorPractices,
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
      createProvider: createOmniVideoCompressorRuntimeProvider,
    },
  );
}

export const omniVideoCompressorDefinition = createOmniBaseToolDefinition<OmniVideoCompressorRequest, OmniVideoCompressorOutput>({
  toolId: "omni.videoCompressor",
  title: "Compress video",
  description: "Prepare a video compression request for the runtime-owned omni media pipeline.",
  summary: "Prepare a video compression request for the runtime-owned omni media pipeline.",
  storageGroup: "videoTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:video:read", "omni:video:write"],
  dependencies: omniVideoCompressorDependencyDeclarations,
  inputSchema: jsonSchema("omni.videoCompressor.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.videoCompressor.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniVideoCompressor(
  request: BaseToolInvokeRequest<OmniVideoCompressorRequest>,
  dependencies: OmniVideoCompressorDependencies = {},
) {
  const selection = selectOmniVideoCompressorPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniVideoCompressorCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniVideoCompressorRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniVideoCompressorHandler = createOmniCoreHandler(omniVideoCompressorDefinition, executeOmniVideoCompressor);
