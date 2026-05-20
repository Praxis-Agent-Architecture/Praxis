import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniGenerateVideoProvider } from './core.js';

export type OmniGenerateVideoPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniGenerateVideoDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniGenerateVideoPracticeProviderName;
  provider?: OmniGenerateVideoProvider;
};

export const omniGenerateVideoDependencyDeclarations = omniOperationDependencyDeclarations("omni.generateVideo");

export function createOmniGenerateVideoRuntimeProvider(dependencies: OmniGenerateVideoDependencies): OmniGenerateVideoProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
