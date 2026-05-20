import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraPermissionProvider,
  CameraPermissionProviderRequest,
  CameraPermissionProviderResult,
} from "./core.js";

export type CameraPermissionRequestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraPermissionRequestDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraPermissionProvider;
};

export type CameraPermissionRequestProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraPermissionRequestPracticeProviderName,
  CameraPermissionProvider,
  CameraPermissionRequestDependencies
>;

export const cameraPermissionRequestDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.requestPermission",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera permission support exposed through BaseToolExecutorPort.computeruse.requestPermission.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera permission prompt dispatch.",
  },
  {
    dependencyId: "runtime.devicePolicy.camera",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS permission prompts, device leases, platform adapters, and camera privacy boundaries.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraPermissionProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraPermissionProvider | undefined {
  const requestPermission = executor?.computeruse?.requestPermission;
  if (requestPermission === undefined) return undefined;

  return async (request: CameraPermissionProviderRequest): Promise<CameraPermissionProviderResult> => {
    const result = await requestPermission({
      resource: "camera",
      purpose: request.target.purpose,
      deviceId: request.target.deviceId,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        targetApplication: request.target.targetApplication,
        mode: request.target.mode,
        requestedDurationMs: request.target.requestedDurationMs,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      granted: result.output.granted,
      leaseId: result.output.leaseId,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
