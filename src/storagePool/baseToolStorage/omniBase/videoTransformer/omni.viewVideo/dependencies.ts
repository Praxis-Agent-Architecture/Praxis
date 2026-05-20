import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniViewVideoProvider } from './core.js';

export type OmniViewVideoPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniViewVideoDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniViewVideoPracticeProviderName;
  provider?: OmniViewVideoProvider;
};

export const omniViewVideoDependencyDeclarations = omniOperationDependencyDeclarations("omni.viewVideo");

export function createOmniViewVideoRuntimeProvider(dependencies: OmniViewVideoDependencies): OmniViewVideoProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
