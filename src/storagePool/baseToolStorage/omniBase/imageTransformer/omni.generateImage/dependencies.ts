import type { BaseToolExecutorPort } from '../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniGenerateImageProvider } from './core.js';

export type OmniGenerateImagePracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniGenerateImageDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniGenerateImagePracticeProviderName;
  provider?: OmniGenerateImageProvider;
};

export const omniGenerateImageDependencyDeclarations = omniOperationDependencyDeclarations("omni.generateImage");

export function createOmniGenerateImageRuntimeProvider(dependencies: OmniGenerateImageDependencies): OmniGenerateImageProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
