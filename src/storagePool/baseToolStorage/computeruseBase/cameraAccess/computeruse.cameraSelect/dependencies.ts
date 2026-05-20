import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraSelectProvider,
  CameraSelectProviderRequest,
  CameraSelectProviderResult,
} from "./core.js";

export type CameraSelectPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraSelectDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraSelectProvider;
};

export type CameraSelectProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraSelectPracticeProviderName,
  CameraSelectProvider,
  CameraSelectDependencies
>;

export const cameraSelectDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.selectDevice",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera device selection support exposed through BaseToolExecutorPort.computeruse.selectDevice.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera selection.",
  },
  {
    dependencyId: "runtime.devicePolicy.camera",
    kind: "runtime",
    required: true,
    description: "Runtime owns device inventory, OS policy, active camera selection, privacy cleanup, and lease coupling.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraSelectProvider(executor: BaseToolExecutorPort | undefined): CameraSelectProvider | undefined {
  const selectDevice = executor?.computeruse?.selectDevice;
  if (selectDevice === undefined) return undefined;

  return async (request: CameraSelectProviderRequest): Promise<CameraSelectProviderResult> => {
    const result = await selectDevice({
      resource: "camera",
      deviceId: request.target.deviceId,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        purpose: request.target.purpose,
        availableDeviceCount: request.target.availableDevices?.length,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      selected: result.output.selected,
      deviceId: result.output.deviceId,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
