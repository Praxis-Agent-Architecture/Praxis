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

export type OmniAudioFormatConversionContext = OmniOperationContext;
export type OmniAudioFormatConversionProvider = OmniOperationProvider;
export type OmniAudioFormatConversionProviderRequest = OmniOperationProviderRequest;
export type OmniAudioFormatConversionProviderResult = OmniOperationProviderResult;
export type OmniAudioFormatConversionRequest = OmniOperationRequest;
export type OmniAudioFormatConversionOutput = OmniOperationOutput;
export type OmniAudioFormatConversionResult = OmniOperationResult;

export const omniAudioFormatConversionConfig: OmniOperationConfig = {
  toolId: "omni.audioFormatConversion",
  capability: "convert-audio-format",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  mediaKind: "audio",
  action: "convert-audio-format",
  outputResource: "audio",
  permissionsRequired: ["omni:audio:read", "omni:audio:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.audioFormatConversion.convertaudioformat",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniAudioFormatConversionDescriptor = createOmniOperationDescriptor(omniAudioFormatConversionConfig);

export function executeOmniAudioFormatConversionCore(request: OmniAudioFormatConversionRequest = {}): Promise<OmniAudioFormatConversionResult> {
  return executeOmniOperationCore(omniAudioFormatConversionConfig, request);
}

export const planAudioFormatConversion = createOmniOperationPlanner(omniAudioFormatConversionConfig);
