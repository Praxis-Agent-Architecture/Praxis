import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniVideoFormatConversionProvider } from './core.js';

export type OmniVideoFormatConversionPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniVideoFormatConversionDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniVideoFormatConversionPracticeProviderName;
  provider?: OmniVideoFormatConversionProvider;
};

export const omniVideoFormatConversionDependencyDeclarations = omniOperationDependencyDeclarations("omni.videoFormatConversion");

export function createOmniVideoFormatConversionRuntimeProvider(dependencies: OmniVideoFormatConversionDependencies): OmniVideoFormatConversionProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
