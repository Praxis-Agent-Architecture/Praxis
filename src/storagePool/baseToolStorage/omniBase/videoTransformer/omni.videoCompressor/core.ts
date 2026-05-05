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

export type OmniVideoCompressorContext = OmniOperationContext;
export type OmniVideoCompressorProvider = OmniOperationProvider;
export type OmniVideoCompressorProviderRequest = OmniOperationProviderRequest;
export type OmniVideoCompressorProviderResult = OmniOperationProviderResult;
export type OmniVideoCompressorRequest = OmniOperationRequest;
export type OmniVideoCompressorOutput = OmniOperationOutput;
export type OmniVideoCompressorResult = OmniOperationResult;

export const omniVideoCompressorConfig: OmniOperationConfig = {
  toolId: "omni.videoCompressor",
  capability: "compress-video",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  mediaKind: "video",
  action: "compress-video",
  outputResource: "video",
  permissionsRequired: ["omni:video:read", "omni:video:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.videoCompressor.compressvideo",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniVideoCompressorDescriptor = createOmniOperationDescriptor(omniVideoCompressorConfig);

export function executeOmniVideoCompressorCore(request: OmniVideoCompressorRequest = {}): Promise<OmniVideoCompressorResult> {
  return executeOmniOperationCore(omniVideoCompressorConfig, request);
}

export const planVideoCompressor = createOmniOperationPlanner(omniVideoCompressorConfig);
