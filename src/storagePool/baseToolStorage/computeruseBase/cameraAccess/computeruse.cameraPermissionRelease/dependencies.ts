import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraPermissionReleaseProvider,
  CameraPermissionReleaseProviderRequest,
  CameraPermissionReleaseProviderResult,
} from "./core.js";

export type CameraPermissionReleasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraPermissionReleaseDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraPermissionReleaseProvider;
};

export type CameraPermissionReleaseProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraPermissionReleasePracticeProviderName,
  CameraPermissionReleaseProvider,
  CameraPermissionReleaseDependencies
>;

export const cameraPermissionReleaseDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.releasePermission",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera permission release support exposed through BaseToolExecutorPort.computeruse.releasePermission.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera permission lease release.",
  },
  {
    dependencyId: "runtime.devicePolicy.camera",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS permission leases, device policy, revocation, and camera privacy cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraPermissionReleaseProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraPermissionReleaseProvider | undefined {
  const releasePermission = executor?.computeruse?.releasePermission;
  if (releasePermission === undefined) return undefined;

  return async (request: CameraPermissionReleaseProviderRequest): Promise<CameraPermissionReleaseProviderResult> => {
    const result = await releasePermission({
      resource: "camera",
      leaseId: request.target.leaseId,
      deviceId: request.target.deviceId,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        reason: request.target.reason,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      released: result.output.released,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
