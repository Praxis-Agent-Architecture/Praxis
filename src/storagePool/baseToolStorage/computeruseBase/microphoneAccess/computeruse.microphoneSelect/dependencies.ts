import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MicrophoneSelectProvider,
  MicrophoneSelectProviderRequest,
  MicrophoneSelectProviderResult,
} from "./core.js";

export type MicrophoneSelectPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MicrophoneSelectDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MicrophoneSelectProvider;
};

export type MicrophoneSelectProviderPractice = ComputerUseProviderPracticeMetadata<
  MicrophoneSelectPracticeProviderName,
  MicrophoneSelectProvider,
  MicrophoneSelectDependencies
>;

export const microphoneSelectDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.selectDevice",
    kind: "runtime",
    required: true,
    description: "Runtime-owned microphone device selection support exposed through BaseToolExecutorPort.computeruse.selectDevice.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before microphone device selection dispatch.",
  },
  {
    dependencyId: "runtime.devicePolicy.microphone",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS microphone inventory, permission leases, device selection, platform adapters, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMicrophoneSelectProvider(
  executor: BaseToolExecutorPort | undefined,
): MicrophoneSelectProvider | undefined {
  const selectDevice = executor?.computeruse?.selectDevice;
  if (selectDevice === undefined) return undefined;

  return async (request: MicrophoneSelectProviderRequest): Promise<MicrophoneSelectProviderResult> => {
    const result = await selectDevice({
      resource: "microphone",
      deviceId: request.target.deviceId,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        targetApplication: request.target.targetApplication,
        permissionLeaseId: request.target.permissionLeaseId,
        selectionReason: request.target.selectionReason,
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
