import type { BaseToolInvokeRequest } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniViewVideoPractice } from './anthropic.js';
import { deepmindOmniViewVideoPractice } from './deepmind.js';
import { createOmniViewVideoRuntimeProvider, omniViewVideoDependencyDeclarations, type OmniViewVideoDependencies } from './dependencies.js';
import { openaiOmniViewVideoPractice } from './openai.js';
import {
  executeOmniViewVideoCore,
  type OmniViewVideoOutput,
  type OmniViewVideoRequest,
} from './core.js';

export const omniViewVideoPractices = [
  anthropicOmniViewVideoPractice,
  openaiOmniViewVideoPractice,
  deepmindOmniViewVideoPractice,
] as const;

export function selectOmniViewVideoPractice(dependencies: OmniViewVideoDependencies = {}) {
  return selectOmniProviderPractice(
    omniViewVideoPractices,
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
      createProvider: createOmniViewVideoRuntimeProvider,
    },
  );
}

export const omniViewVideoDefinition = createOmniBaseToolDefinition<OmniViewVideoRequest, OmniViewVideoOutput>({
  toolId: "omni.viewVideo",
  title: "View video",
  description: "Prepare a video understanding request while leaving decoding, sampling, and provider lowering to runtime.",
  summary: "Prepare a video understanding request while leaving decoding, sampling, and provider lowering to runtime.",
  storageGroup: "videoTransformer",
  riskLevel: "normal",
  permissionHints: ["omni:video:read", "provider:invoke"],
  dependencies: omniViewVideoDependencyDeclarations,
  inputSchema: jsonSchema("omni.viewVideo.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.viewVideo.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniViewVideo(
  request: BaseToolInvokeRequest<OmniViewVideoRequest>,
  dependencies: OmniViewVideoDependencies = {},
) {
  const selection = selectOmniViewVideoPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniViewVideoCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniViewVideoRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniViewVideoHandler = createOmniCoreHandler(omniViewVideoDefinition, executeOmniViewVideo);
