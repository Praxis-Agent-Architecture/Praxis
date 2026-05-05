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

export type OmniViewVideoContext = OmniOperationContext;
export type OmniViewVideoProvider = OmniOperationProvider;
export type OmniViewVideoProviderRequest = OmniOperationProviderRequest;
export type OmniViewVideoProviderResult = OmniOperationProviderResult;
export type OmniViewVideoRequest = OmniOperationRequest;
export type OmniViewVideoOutput = OmniOperationOutput;
export type OmniViewVideoResult = OmniOperationResult;

export const omniViewVideoConfig: OmniOperationConfig = {
  toolId: "omni.viewVideo",
  capability: "view-video",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  mediaKind: "video",
  action: "view-video",
  outputResource: "video",
  permissionsRequired: ["omni:video:read", "provider:invoke"],
  requiresInput: true,
  requiresOutput: false,
  requiresPrompt: false,
  unsafeSideEffects: false,
  runtimeOperation: "omni.viewVideo.viewvideo",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniViewVideoDescriptor = createOmniOperationDescriptor(omniViewVideoConfig);

export function executeOmniViewVideoCore(request: OmniViewVideoRequest = {}): Promise<OmniViewVideoResult> {
  return executeOmniOperationCore(omniViewVideoConfig, request);
}

export const planViewVideo = createOmniOperationPlanner(omniViewVideoConfig);
