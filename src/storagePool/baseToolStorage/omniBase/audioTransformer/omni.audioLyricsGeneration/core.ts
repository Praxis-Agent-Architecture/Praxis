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

export type OmniAudioLyricsGenerationContext = OmniOperationContext;
export type OmniAudioLyricsGenerationProvider = OmniOperationProvider;
export type OmniAudioLyricsGenerationProviderRequest = OmniOperationProviderRequest;
export type OmniAudioLyricsGenerationProviderResult = OmniOperationProviderResult;
export type OmniAudioLyricsGenerationRequest = OmniOperationRequest;
export type OmniAudioLyricsGenerationOutput = OmniOperationOutput;
export type OmniAudioLyricsGenerationResult = OmniOperationResult;

export const omniAudioLyricsGenerationConfig: OmniOperationConfig = {
  toolId: "omni.audioLyricsGeneration",
  capability: "generate-audio-lyrics",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  mediaKind: "audio",
  action: "generate-audio-lyrics",
  outputResource: "text",
  permissionsRequired: ["omni:audio:read", "provider:invoke"],
  requiresInput: true,
  requiresOutput: false,
  requiresPrompt: false,
  unsafeSideEffects: false,
  runtimeOperation: "omni.audioLyricsGeneration.generateaudiolyrics",
  dependencyProfile: createOmniDependencyProfile("speech-analysis"),
};

export const omniAudioLyricsGenerationDescriptor = createOmniOperationDescriptor(omniAudioLyricsGenerationConfig);

export function executeOmniAudioLyricsGenerationCore(request: OmniAudioLyricsGenerationRequest = {}): Promise<OmniAudioLyricsGenerationResult> {
  return executeOmniOperationCore(omniAudioLyricsGenerationConfig, request);
}

export const planAudioLyricsGeneration = createOmniOperationPlanner(omniAudioLyricsGenerationConfig);
