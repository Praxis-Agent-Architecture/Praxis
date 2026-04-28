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

export type OmniImageCompressorContext = OmniOperationContext;
export type OmniImageCompressorProvider = OmniOperationProvider;
export type OmniImageCompressorProviderRequest = OmniOperationProviderRequest;
export type OmniImageCompressorProviderResult = OmniOperationProviderResult;
export type OmniImageCompressorRequest = OmniOperationRequest;
export type OmniImageCompressorOutput = OmniOperationOutput;
export type OmniImageCompressorResult = OmniOperationResult;

export const omniImageCompressorConfig: OmniOperationConfig = {
  toolId: "omni.imageCompressor",
  capability: "compress-image",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  mediaKind: "image",
  action: "compress-image",
  outputResource: "image",
  permissionsRequired: ["omni:image:read", "omni:image:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.imageCompressor.compressimage",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniImageCompressorDescriptor = createOmniOperationDescriptor(omniImageCompressorConfig);

export function executeOmniImageCompressorCore(request: OmniImageCompressorRequest = {}): Promise<OmniImageCompressorResult> {
  return executeOmniOperationCore(omniImageCompressorConfig, request);
}

export const planImageCompressor = createOmniOperationPlanner(omniImageCompressorConfig);
