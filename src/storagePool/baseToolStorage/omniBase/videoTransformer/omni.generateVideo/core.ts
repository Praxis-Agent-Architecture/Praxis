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

export type OmniGenerateVideoContext = OmniOperationContext;
export type OmniGenerateVideoProvider = OmniOperationProvider;
export type OmniGenerateVideoProviderRequest = OmniOperationProviderRequest;
export type OmniGenerateVideoProviderResult = OmniOperationProviderResult;
export type OmniGenerateVideoRequest = OmniOperationRequest;
export type OmniGenerateVideoOutput = OmniOperationOutput;
export type OmniGenerateVideoResult = OmniOperationResult;

export const omniGenerateVideoConfig: OmniOperationConfig = {
  toolId: "omni.generateVideo",
  capability: "generate-video",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  mediaKind: "video",
  action: "generate-video",
  outputResource: "video",
  permissionsRequired: ["provider:invoke", "omni:video:generate", "omni:video:write"],
  requiresInput: false,
  requiresOutput: true,
  requiresPrompt: true,
  unsafeSideEffects: true,
  runtimeOperation: "omni.generateVideo.generatevideo",
  dependencyProfile: createOmniDependencyProfile("video-generation"),
};

export const omniGenerateVideoDescriptor = createOmniOperationDescriptor(omniGenerateVideoConfig);

export function executeOmniGenerateVideoCore(request: OmniGenerateVideoRequest = {}): Promise<OmniGenerateVideoResult> {
  return executeOmniOperationCore(omniGenerateVideoConfig, request);
}

export const planGenerateVideo = createOmniOperationPlanner(omniGenerateVideoConfig);
