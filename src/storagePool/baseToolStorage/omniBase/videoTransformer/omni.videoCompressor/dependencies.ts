import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniVideoCompressorProvider } from './core.js';

export type OmniVideoCompressorPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniVideoCompressorDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniVideoCompressorPracticeProviderName;
  provider?: OmniVideoCompressorProvider;
};

export const omniVideoCompressorDependencyDeclarations = omniOperationDependencyDeclarations("omni.videoCompressor");

export function createOmniVideoCompressorRuntimeProvider(dependencies: OmniVideoCompressorDependencies): OmniVideoCompressorProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
