import type { BaseToolDependencyDeclaration } from '../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js';
import type { BaseToolExecutorPort } from '../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import type { OmniOperationDependencyProfile, OmniOperationProvider } from './omniOperationCore.js';

export const omniUniversalPackageVersions = {
  '@ffmpeg/ffmpeg': '^0.12.15',
  '@ffmpeg/core': '^0.12.10',
  '@ffmpeg/util': '^0.12.2',
  '@huggingface/transformers': '^4.2.0',
} as const;

export type OmniUniversalPackageName = keyof typeof omniUniversalPackageVersions;

export function createOmniDependencyProfile(packageProfile: string): OmniOperationDependencyProfile {
  return {
    nativeBinaryRequired: false,
    runtimeOwnsPackageLoading: true,
    packageProfile,
    packages: omniUniversalPackageVersions,
  };
}

export const omniUniversalDependencyProfile = createOmniDependencyProfile('media-transform');

export function createOmniRuntimeProvider(executor: BaseToolExecutorPort | undefined): OmniOperationProvider | undefined {
  const transformMedia = executor?.omni?.transformMedia;
  if (transformMedia === undefined) return undefined;
  return async (request) => {
    const result = await transformMedia({
      operation: request.operation,
      inputArtifactId: request.inputArtifactId,
      parameters: request.parameters,
    });
    if (!result.ok) {
      throw {
        code: result.error.code,
        message: result.error.message,
        publicSafe: result.error.publicSafe,
      };
    }
    return {
      artifactId: result.output.artifactId,
      mimeType: result.output.mimeType,
      metadata: result.metadata,
    };
  };
}

export function omniOperationDependencyDeclarations(toolId: string): readonly BaseToolDependencyDeclaration[] {
  return [
    {
      dependencyId: 'runtime.executor.omni.transformMedia',
      kind: 'runtime',
      required: true,
      description: toolId + ' delegates live media material handling to BaseToolExecutorPort.omni.transformMedia.',
    },
    {
      dependencyId: 'optional.package.ffmpeg-wasm',
      kind: 'package',
      required: false,
      description: 'Runtime may load @ffmpeg/ffmpeg + @ffmpeg/core + @ffmpeg/util for device-portable media conversion without native binaries.',
    },
    {
      dependencyId: 'optional.package.transformers-js',
      kind: 'package',
      required: false,
      description: 'Runtime may load @huggingface/transformers for local speech or vision preprocessing when provider routing needs it.',
    },
  ];
}
