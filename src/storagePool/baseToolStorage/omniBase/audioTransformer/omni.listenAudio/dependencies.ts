import type { BaseToolExecutorPort } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniListenAudioProvider } from './core.js';

export type OmniListenAudioPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniListenAudioDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniListenAudioPracticeProviderName;
  provider?: OmniListenAudioProvider;
};

export const omniListenAudioDependencyDeclarations = omniOperationDependencyDeclarations("omni.listenAudio");

export function createOmniListenAudioRuntimeProvider(dependencies: OmniListenAudioDependencies): OmniListenAudioProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
