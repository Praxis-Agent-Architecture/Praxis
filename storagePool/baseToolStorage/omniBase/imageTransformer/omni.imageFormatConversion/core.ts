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

export type OmniImageFormatConversionContext = OmniOperationContext;
export type OmniImageFormatConversionProvider = OmniOperationProvider;
export type OmniImageFormatConversionProviderRequest = OmniOperationProviderRequest;
export type OmniImageFormatConversionProviderResult = OmniOperationProviderResult;
export type OmniImageFormatConversionRequest = OmniOperationRequest;
export type OmniImageFormatConversionOutput = OmniOperationOutput;
export type OmniImageFormatConversionResult = OmniOperationResult;

export const omniImageFormatConversionConfig: OmniOperationConfig = {
  toolId: "omni.imageFormatConversion",
  capability: "convert-image-format",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  mediaKind: "image",
  action: "convert-image-format",
  outputResource: "image",
  permissionsRequired: ["omni:image:read", "omni:image:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.imageFormatConversion.convertimageformat",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniImageFormatConversionDescriptor = createOmniOperationDescriptor(omniImageFormatConversionConfig);

export function executeOmniImageFormatConversionCore(request: OmniImageFormatConversionRequest = {}): Promise<OmniImageFormatConversionResult> {
  return executeOmniOperationCore(omniImageFormatConversionConfig, request);
}

export const planImageFormatConversion = createOmniOperationPlanner(omniImageFormatConversionConfig);
