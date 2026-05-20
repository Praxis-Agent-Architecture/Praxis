import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniImageFormatConversionProvider } from './core.js';

export type OmniImageFormatConversionPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniImageFormatConversionDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniImageFormatConversionPracticeProviderName;
  provider?: OmniImageFormatConversionProvider;
};

export const omniImageFormatConversionDependencyDeclarations = omniOperationDependencyDeclarations("omni.imageFormatConversion");

export function createOmniImageFormatConversionRuntimeProvider(dependencies: OmniImageFormatConversionDependencies): OmniImageFormatConversionProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
