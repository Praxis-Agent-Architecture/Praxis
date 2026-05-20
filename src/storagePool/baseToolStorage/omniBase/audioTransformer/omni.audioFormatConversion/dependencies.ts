import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createOmniRuntimeProvider, omniOperationDependencyDeclarations } from '../../_shared/omniOperationDependencies.js';
import type { OmniAudioFormatConversionProvider } from './core.js';

export type OmniAudioFormatConversionPracticeProviderName = 'anthropic' | 'openai' | 'deepmind' | 'local-wasm' | 'external' | 'praxis-native';

export type OmniAudioFormatConversionDependencies = {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniAudioFormatConversionPracticeProviderName;
  provider?: OmniAudioFormatConversionProvider;
};

export const omniAudioFormatConversionDependencyDeclarations = omniOperationDependencyDeclarations("omni.audioFormatConversion");

export function createOmniAudioFormatConversionRuntimeProvider(dependencies: OmniAudioFormatConversionDependencies): OmniAudioFormatConversionProvider | undefined {
  return dependencies.provider ?? createOmniRuntimeProvider(dependencies.executor);
}
