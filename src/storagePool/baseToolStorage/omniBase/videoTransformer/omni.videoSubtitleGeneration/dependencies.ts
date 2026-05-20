import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniVideoSubtitleGenerationProvider } from './core.js';

export type OmniVideoSubtitleGenerationPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniVideoSubtitleGenerationDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniVideoSubtitleGenerationPracticeProviderName;
  provider?: OmniVideoSubtitleGenerationProvider;
};

export const omniVideoSubtitleGenerationDependencyDeclarations = omniOperationDependencyDeclarations("omni.videoSubtitleGeneration");

export function createOmniVideoSubtitleGenerationRuntimeProvider(dependencies: OmniVideoSubtitleGenerationDependencies): OmniVideoSubtitleGenerationProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
