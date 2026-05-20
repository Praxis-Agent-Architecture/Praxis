import type { BaseToolInvokeRequest } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniImageFormatConversionPractice } from './anthropic.js';
import { deepmindOmniImageFormatConversionPractice } from './deepmind.js';
import { createOmniImageFormatConversionRuntimeProvider, omniImageFormatConversionDependencyDeclarations, type OmniImageFormatConversionDependencies } from './dependencies.js';
import { openaiOmniImageFormatConversionPractice } from './openai.js';
import {
  executeOmniImageFormatConversionCore,
  type OmniImageFormatConversionOutput,
  type OmniImageFormatConversionRequest,
} from './core.js';

export const omniImageFormatConversionPractices = [
  anthropicOmniImageFormatConversionPractice,
  openaiOmniImageFormatConversionPractice,
  deepmindOmniImageFormatConversionPractice,
] as const;

export function selectOmniImageFormatConversionPractice(dependencies: OmniImageFormatConversionDependencies = {}) {
  return selectOmniProviderPractice(
    omniImageFormatConversionPractices,
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
      createProvider: createOmniImageFormatConversionRuntimeProvider,
    },
  );
}

export const omniImageFormatConversionDefinition = createOmniBaseToolDefinition<OmniImageFormatConversionRequest, OmniImageFormatConversionOutput>({
  toolId: "omni.imageFormatConversion",
  title: "Convert image format",
  description: "Prepare an image format conversion request for the runtime-owned omni media pipeline.",
  summary: "Prepare an image format conversion request for the runtime-owned omni media pipeline.",
  storageGroup: "imageTransformer",
  riskLevel: "risky",
  permissionHints: ["omni:image:read", "omni:image:write"],
  dependencies: omniImageFormatConversionDependencyDeclarations,
  inputSchema: jsonSchema("omni.imageFormatConversion.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.imageFormatConversion.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniImageFormatConversion(
  request: BaseToolInvokeRequest<OmniImageFormatConversionRequest>,
  dependencies: OmniImageFormatConversionDependencies = {},
) {
  const selection = selectOmniImageFormatConversionPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniImageFormatConversionCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniImageFormatConversionRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniImageFormatConversionHandler = createOmniCoreHandler(omniImageFormatConversionDefinition, executeOmniImageFormatConversion);
