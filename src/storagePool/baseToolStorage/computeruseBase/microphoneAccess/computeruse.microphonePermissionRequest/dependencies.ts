import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MicrophonePermissionProvider,
  MicrophonePermissionProviderRequest,
  MicrophonePermissionProviderResult,
} from "./core.js";

export type MicrophonePermissionRequestPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MicrophonePermissionRequestDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MicrophonePermissionProvider;
};

export type MicrophonePermissionRequestProviderPractice = ComputerUseProviderPracticeMetadata<
  MicrophonePermissionRequestPracticeProviderName,
  MicrophonePermissionProvider,
  MicrophonePermissionRequestDependencies
>;

export const microphonePermissionRequestDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.requestPermission",
    kind: "runtime",
    required: true,
    description: "Runtime-owned microphone permission support exposed through BaseToolExecutorPort.computeruse.requestPermission.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before microphone permission prompt dispatch.",
  },
  {
    dependencyId: "runtime.devicePolicy.microphone",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS permission prompts, device leases, platform adapters, and microphone privacy boundaries.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMicrophonePermissionProvider(
  executor: BaseToolExecutorPort | undefined,
): MicrophonePermissionProvider | undefined {
  const requestPermission = executor?.computeruse?.requestPermission;
  if (requestPermission === undefined) return undefined;

  return async (request: MicrophonePermissionProviderRequest): Promise<MicrophonePermissionProviderResult> => {
    const result = await requestPermission({
      resource: "microphone",
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
