import type { BaseToolExecutorPort } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniImageCompressorProvider } from './core.js';

export type OmniImageCompressorPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniImageCompressorDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniImageCompressorPracticeProviderName;
  provider?: OmniImageCompressorProvider;
};

export const omniImageCompressorDependencyDeclarations = omniOperationDependencyDeclarations("omni.imageCompressor");

export function createOmniImageCompressorRuntimeProvider(dependencies: OmniImageCompressorDependencies): OmniImageCompressorProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
