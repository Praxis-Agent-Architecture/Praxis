import type { BaseToolInvokeRequest } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js';
import {
  buildOmniPracticeAuditMetadata,
  createOmniBaseToolDefinition,
  createOmniCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectOmniProviderPractice,
} from '../../_shared/baseToolAdapter.js';
import { anthropicOmniGenerateVideoPractice } from './anthropic.js';
import { deepmindOmniGenerateVideoPractice } from './deepmind.js';
import { createOmniGenerateVideoRuntimeProvider, omniGenerateVideoDependencyDeclarations, type OmniGenerateVideoDependencies } from './dependencies.js';
import { openaiOmniGenerateVideoPractice } from './openai.js';
import {
  executeOmniGenerateVideoCore,
  type OmniGenerateVideoOutput,
  type OmniGenerateVideoRequest,
} from './core.js';

export const omniGenerateVideoPractices = [
  anthropicOmniGenerateVideoPractice,
  openaiOmniGenerateVideoPractice,
  deepmindOmniGenerateVideoPractice,
] as const;

export function selectOmniGenerateVideoPractice(dependencies: OmniGenerateVideoDependencies = {}) {
  return selectOmniProviderPractice(
    omniGenerateVideoPractices,
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
      createProvider: createOmniGenerateVideoRuntimeProvider,
    },
  );
}

export const omniGenerateVideoDefinition = createOmniBaseToolDefinition<OmniGenerateVideoRequest, OmniGenerateVideoOutput>({
  toolId: "omni.generateVideo",
  title: "Generate video",
  description: "Prepare a video generation request for provider-backed runtime execution.",
  summary: "Prepare a video generation request for provider-backed runtime execution.",
  storageGroup: "videoTransformer",
  riskLevel: "risky",
  permissionHints: ["provider:invoke", "omni:video:generate", "omni:video:write"],
  dependencies: omniGenerateVideoDependencyDeclarations,
  inputSchema: jsonSchema("omni.generateVideo.input", {
    type: 'object',
    additionalProperties: false,
    properties: {
      target: { type: 'object', additionalProperties: true },
      context: { type: 'object', additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("omni.generateVideo.output", { type: 'object', additionalProperties: true }),
  metadata: { omniRuntimePort: 'BaseToolExecutorPort.omni.transformMedia' },
});

export async function executeOmniGenerateVideo(
  request: BaseToolInvokeRequest<OmniGenerateVideoRequest>,
  dependencies: OmniGenerateVideoDependencies = {},
) {
  const selection = selectOmniGenerateVideoPractice({ ...dependencies, executor: dependencies.executor ?? request.executor });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniGenerateVideoCore({
    ...(request.input ?? {}),
    context: injectRuntimeInvocationMetadata(
      auditMetadata,
      (request.input as OmniGenerateVideoRequest | undefined)?.context as Readonly<Record<string, unknown>> | undefined,
      request,
    ),
    provider: selection.provider,
  });
}

export const omniGenerateVideoHandler = createOmniCoreHandler(omniGenerateVideoDefinition, executeOmniGenerateVideo);
