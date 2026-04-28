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

export type OmniGenerateAudioContext = OmniOperationContext;
export type OmniGenerateAudioProvider = OmniOperationProvider;
export type OmniGenerateAudioProviderRequest = OmniOperationProviderRequest;
export type OmniGenerateAudioProviderResult = OmniOperationProviderResult;
export type OmniGenerateAudioRequest = OmniOperationRequest;
export type OmniGenerateAudioOutput = OmniOperationOutput;
export type OmniGenerateAudioResult = OmniOperationResult;

export const omniGenerateAudioConfig: OmniOperationConfig = {
  toolId: "omni.generateAudio",
  capability: "generate-audio",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  mediaKind: "audio",
  action: "generate-audio",
  outputResource: "audio",
  permissionsRequired: ["provider:invoke", "omni:audio:generate", "omni:audio:write"],
  requiresInput: false,
  requiresOutput: true,
  requiresPrompt: true,
  unsafeSideEffects: true,
  runtimeOperation: "omni.generateAudio.generateaudio",
  dependencyProfile: createOmniDependencyProfile("audio-generation"),
};

export const omniGenerateAudioDescriptor = createOmniOperationDescriptor(omniGenerateAudioConfig);

export function executeOmniGenerateAudioCore(request: OmniGenerateAudioRequest = {}): Promise<OmniGenerateAudioResult> {
  return executeOmniOperationCore(omniGenerateAudioConfig, request);
}

export const planGenerateAudio = createOmniOperationPlanner(omniGenerateAudioConfig);
