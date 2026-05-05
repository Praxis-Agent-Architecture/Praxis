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

export type OmniAudioCompressionContext = OmniOperationContext;
export type OmniAudioCompressionProvider = OmniOperationProvider;
export type OmniAudioCompressionProviderRequest = OmniOperationProviderRequest;
export type OmniAudioCompressionProviderResult = OmniOperationProviderResult;
export type OmniAudioCompressionRequest = OmniOperationRequest;
export type OmniAudioCompressionOutput = OmniOperationOutput;
export type OmniAudioCompressionResult = OmniOperationResult;

export const omniAudioCompressionConfig: OmniOperationConfig = {
  toolId: "omni.audioCompressor",
  capability: "compress-audio",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  mediaKind: "audio",
  action: "compress-audio",
  outputResource: "audio",
  permissionsRequired: ["omni:audio:read", "omni:audio:write"],
  requiresInput: true,
  requiresOutput: true,
  requiresPrompt: false,
  unsafeSideEffects: true,
  runtimeOperation: "omni.audioCompressor.compressaudio",
  dependencyProfile: createOmniDependencyProfile("media-transform"),
};

export const omniAudioCompressionDescriptor = createOmniOperationDescriptor(omniAudioCompressionConfig);

export function executeOmniAudioCompressionCore(request: OmniAudioCompressionRequest = {}): Promise<OmniAudioCompressionResult> {
  return executeOmniOperationCore(omniAudioCompressionConfig, request);
}

export const planAudioCompression = createOmniOperationPlanner(omniAudioCompressionConfig);
