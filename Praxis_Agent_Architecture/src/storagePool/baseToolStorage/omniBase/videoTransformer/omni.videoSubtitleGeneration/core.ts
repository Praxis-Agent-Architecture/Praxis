import { createOmniDependencyProfile } from '../../_shared/omniOperationDependencies.js';
import {
  createOmniOperationDescriptor,
  createOmniOperationPlanner,
  executeOmniOperationCore,
  type OmniOperationConfig,
  type OmniOperationContext,
  type OmniOperationOutput,
  type OmniOperationProvider,
  type OmniOperationProviderRequest,
  type OmniOperationProviderResult,
  type OmniOperationRequest,
  type OmniOperationResult,
} from '../../_shared/omniOperationCore.js';

export type OmniVideoSubtitleGenerationContext = OmniOperationContext;
export type OmniVideoSubtitleGenerationProvider = OmniOperationProvider;
export type OmniVideoSubtitleGenerationProviderRequest = OmniOperationProviderRequest;
export type OmniVideoSubtitleGenerationProviderResult = OmniOperationProviderResult;
export type OmniVideoSubtitleGenerationRequest = OmniOperationRequest;
export type OmniVideoSubtitleGenerationOutput = OmniOperationOutput;
export type OmniVideoSubtitleGenerationResult = OmniOperationResult;

export const omniVideoSubtitleGenerationConfig: OmniOperationConfig = {
  toolId: "omni.videoSubtitleGeneration",
  capability: "generate-video-subtitles",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  mediaKind: "video",
  action: "generate-video-subtitles",
  outputResource: "text",
  permissionsRequired: ["omni:video:read", "provider:invoke"],
  requiresInput: true,
  requiresOutput: false,
  requiresPrompt: false,
  unsafeSideEffects: false,
  runtimeOperation: "omni.videoSubtitleGeneration.generatevideosubtitles",
  dependencyProfile: createOmniDependencyProfile("speech-analysis"),
};

export const omniVideoSubtitleGenerationDescriptor = createOmniOperationDescriptor(omniVideoSubtitleGenerationConfig);

export function executeOmniVideoSubtitleGenerationCore(request: OmniVideoSubtitleGenerationRequest = {}): Promise<OmniVideoSubtitleGenerationResult> {
  return executeOmniOperationCore(omniVideoSubtitleGenerationConfig, request);
}

export const planVideoSubtitleGeneration = createOmniOperationPlanner(omniVideoSubtitleGenerationConfig);
