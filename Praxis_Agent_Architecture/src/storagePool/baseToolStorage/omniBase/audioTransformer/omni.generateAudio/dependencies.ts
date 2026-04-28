import type { BaseToolExecutorPort } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniGenerateAudioProvider } from './core.js';

export type OmniGenerateAudioPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniGenerateAudioDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniGenerateAudioPracticeProviderName;
  provider?: OmniGenerateAudioProvider;
};

export const omniGenerateAudioDependencyDeclarations = omniOperationDependencyDeclarations("omni.generateAudio");

export function createOmniGenerateAudioRuntimeProvider(dependencies: OmniGenerateAudioDependencies): OmniGenerateAudioProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
