import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraCapturePhotoProvider,
  CameraCapturePhotoProviderRequest,
  CameraCapturePhotoProviderResult,
} from "./core.js";

export type CameraCapturePhotoPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraCapturePhotoDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraCapturePhotoProvider;
};

export type CameraCapturePhotoProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraCapturePhotoPracticeProviderName,
  CameraCapturePhotoProvider,
  CameraCapturePhotoDependencies
>;

export const cameraCapturePhotoDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.captureCameraPhoto",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera photo capture support exposed through BaseToolExecutorPort.computeruse.captureCameraPhoto.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera photo capture.",
  },
  {
    dependencyId: "runtime.artifactStore.cameraPhoto",
    kind: "runtime",
    required: true,
    description: "Runtime owns camera frame acquisition, artifact persistence, MIME typing, redaction, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraCapturePhotoProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraCapturePhotoProvider | undefined {
  const captureCameraPhoto = executor?.computeruse?.captureCameraPhoto;
  if (captureCameraPhoto === undefined) return undefined;

  return async (request: CameraCapturePhotoProviderRequest): Promise<CameraCapturePhotoProviderResult> => {
    const result = await captureCameraPhoto({
      cameraId: request.target.cameraId,
      purpose: request.target.purpose,
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        permissionLeaseId: request.target.permissionLeaseId,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      artifactId: result.output.artifactId,
      mimeType: result.output.mimeType,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
