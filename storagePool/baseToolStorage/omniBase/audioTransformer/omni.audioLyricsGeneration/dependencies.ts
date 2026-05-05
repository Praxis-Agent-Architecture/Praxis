import type { BaseToolExecutorPort } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniAudioLyricsGenerationProvider } from './core.js';

export type OmniAudioLyricsGenerationPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniAudioLyricsGenerationDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniAudioLyricsGenerationPracticeProviderName;
  provider?: OmniAudioLyricsGenerationProvider;
};

export const omniAudioLyricsGenerationDependencyDeclarations = omniOperationDependencyDeclarations("omni.audioLyricsGeneration");

export function createOmniAudioLyricsGenerationRuntimeProvider(dependencies: OmniAudioLyricsGenerationDependencies): OmniAudioLyricsGenerationProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
