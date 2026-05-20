import type { BaseToolInvokeRequest } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniImageCompressorPractice } from './anthropic.js';
import { deepmindOmniImageCompressorPractice } from './deepmind.js';
import { createOmniImageCompressorRuntimeProvider, omniImageCompressorDependencyDeclarations, type OmniImageCompressorDependencies } from './dependencies.js';
import { openaiOmniImageCompressorPractice } from './openai.js';
import {
  executeOmniImageCompressorCore,
  type OmniImageCompressorOutput,
  type OmniImageCompressorRequest,
} from './core.js';

export const omniImageCompressorPractices = [
  anthropicOmniImageCompressorPractice,
  openaiOmniImageCompressorPractice,
  deepmindOmniImageCompressorPractice,
] as const;

export function selectOmniImageCompressorPractice(dependencies: OmniImageCompressorDependencies = {}) {
  return selectOmniProviderPractice(
    omniImageCompressorPractices,
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
      createProvider: createOmniImageCompressorRuntimeProvider,
    },
  );
}

export const omniImageCompressorDefinition = createOmniBaseToolDefinition<OmniImageCompressorRequest, OmniImageCompressorOutput>({
  toolId: "omni.imageCompressor",
  title: "Compress image",
  description: "Prepare an image compression request for the runtime-owned omni media pipeline.",
  summary: "Prepare an image compression request for the runtime-owned omni media pipeline.",
  storageGroup: "imageTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:image:read", "omni:image:write"],
  dependencies: omniImageCompressorDependencyDeclarations,
  inputSchema: jsonSchema("omni.imageCompressor.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.imageCompressor.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniImageCompressor(
  request: BaseToolInvokeRequest<OmniImageCompressorRequest>,
  dependencies: OmniImageCompressorDependencies = {},
) {
  const selection = selectOmniImageCompressorPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniImageCompressorCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniImageCompressorRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniImageCompressorHandler = createOmniCoreHandler(omniImageCompressorDefinition, executeOmniImageCompressor);
