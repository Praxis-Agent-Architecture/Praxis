import type { BaseToolInvokeRequest } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniGenerateImagePractice } from './anthropic.js';
import { deepmindOmniGenerateImagePractice } from './deepmind.js';
import { createOmniGenerateImageRuntimeProvider, omniGenerateImageDependencyDeclarations, type OmniGenerateImageDependencies } from './dependencies.js';
import { openaiOmniGenerateImagePractice } from './openai.js';
import {
  executeOmniGenerateImageCore,
  type OmniGenerateImageOutput,
  type OmniGenerateImageRequest,
} from './core.js';

export const omniGenerateImagePractices = [
  anthropicOmniGenerateImagePractice,
  openaiOmniGenerateImagePractice,
  deepmindOmniGenerateImagePractice,
] as const;

export function selectOmniGenerateImagePractice(dependencies: OmniGenerateImageDependencies = {}) {
  return selectOmniProviderPractice(
    omniGenerateImagePractices,
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
      createProvider: createOmniGenerateImageRuntimeProvider,
    },
  );
}

export const omniGenerateImageDefinition = createOmniBaseToolDefinition<OmniGenerateImageRequest, OmniGenerateImageOutput>({
  toolId: "omni.generateImage",
  title: "Generate image",
  description: "Prepare an image generation request for provider-backed runtime execution.",
  summary: "Prepare an image generation request for provider-backed runtime execution.",
  storageGroup: "imageTransformer",
  riskLevel: "risky",
  permissionHints: ["provider:invoke", "omni:image:generate", "omni:image:write"],
  dependencies: omniGenerateImageDependencyDeclarations,
  inputSchema: jsonSchema("omni.generateImage.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.generateImage.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniGenerateImage(
  request: BaseToolInvokeRequest<OmniGenerateImageRequest>,
  dependencies: OmniGenerateImageDependencies = {},
) {
  const selection = selectOmniGenerateImagePractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniGenerateImageCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniGenerateImageRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniGenerateImageHandler = createOmniCoreHandler(omniGenerateImageDefinition, executeOmniGenerateImage);
