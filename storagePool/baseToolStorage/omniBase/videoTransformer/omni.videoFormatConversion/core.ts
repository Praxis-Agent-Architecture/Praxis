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

export type OmniVideoFormatConversionContext = OmniOperationContext;
export type OmniVideoFormatConversionProvider = OmniOperationProvider;
export type OmniVideoFormatConversionProviderRequest = OmniOperationProviderRequest;
export type OmniVideoFormatConversionProviderResult = OmniOperationProviderResult;
export type OmniVideoFormatConversionRequest = OmniOperationRequest;
export type OmniVideoFormatConversionOutput = OmniOperationOutput;
export type OmniVideoFormatConversionResult = OmniOperationResult;

export const omniVideoFormatConversionConfig: OmniOperationConfig = {
  toolId: "omni.videoFormatConversion",
  capability: "convert-video-format",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  mediaKind: "video",
  action: "convert-video-format",
  outputResource: "video",
  permissionsRequired: ["omni:video:read", "omni:video:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.videoFormatConversion.convertvideoformat",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniVideoFormatConversionDescriptor = createOmniOperationDescriptor(omniVideoFormatConversionConfig);

export function executeOmniVideoFormatConversionCore(request: OmniVideoFormatConversionRequest = {}): Promise<OmniVideoFormatConversionResult> {
  return executeOmniOperationCore(omniVideoFormatConversionConfig, request);
}

export const planVideoFormatConversion = createOmniOperationPlanner(omniVideoFormatConversionConfig);
