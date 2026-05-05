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

export type OmniListenAudioContext = OmniOperationContext;
export type OmniListenAudioProvider = OmniOperationProvider;
export type OmniListenAudioProviderRequest = OmniOperationProviderRequest;
export type OmniListenAudioProviderResult = OmniOperationProviderResult;
export type OmniListenAudioRequest = OmniOperationRequest;
export type OmniListenAudioOutput = OmniOperationOutput;
export type OmniListenAudioResult = OmniOperationResult;

export const omniListenAudioConfig: OmniOperationConfig = {
  toolId: "omni.listenAudio",
  capability: "listen-audio",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  mediaKind: "audio",
  action: "listen-audio",
  outputResource: "text",
  permissionsRequired: ["omni:audio:read", "provider:invoke"],
  requiresInput: true,
  requiresOutput: false,
  requiresPrompt: false,
  unsafeSideEffects: false,
  runtimeOperation: "omni.listenAudio.listenaudio",
  dependencyProfile: createOmniDependencyProfile("speech-analysis"),
};

export const omniListenAudioDescriptor = createOmniOperationDescriptor(omniListenAudioConfig);

export function executeOmniListenAudioCore(request: OmniListenAudioRequest = {}): Promise<OmniListenAudioResult> {
  return executeOmniOperationCore(omniListenAudioConfig, request);
}

export const planListenAudio = createOmniOperationPlanner(omniListenAudioConfig);
