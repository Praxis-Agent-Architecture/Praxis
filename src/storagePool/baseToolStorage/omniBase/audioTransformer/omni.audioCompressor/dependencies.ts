import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniAudioCompressionProvider } from './core.js';

export type OmniAudioCompressionPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniAudioCompressionDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniAudioCompressionPracticeProviderName;
  provider?: OmniAudioCompressionProvider;
};

export const omniAudioCompressionDependencyDeclarations = omniOperationDependencyDeclarations("omni.audioCompressor");

export function createOmniAudioCompressionRuntimeProvider(dependencies: OmniAudioCompressionDependencies): OmniAudioCompressionProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
