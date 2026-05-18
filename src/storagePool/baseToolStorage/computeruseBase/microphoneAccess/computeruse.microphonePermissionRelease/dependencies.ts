import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MicrophonePermissionReleaseProvider,
  MicrophonePermissionReleaseProviderRequest,
  MicrophonePermissionReleaseProviderResult,
} from "./core.js";

export type MicrophonePermissionReleasePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MicrophonePermissionReleaseDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MicrophonePermissionReleaseProvider;
};

export type MicrophonePermissionReleaseProviderPractice = ComputerUseProviderPracticeMetadata<
  MicrophonePermissionReleasePracticeProviderName,
  MicrophonePermissionReleaseProvider,
  MicrophonePermissionReleaseDependencies
>;

export const microphonePermissionReleaseDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.releasePermission",
    kind: "runtime",
    required: true,
    description: "Runtime-owned microphone permission release support exposed through BaseToolExecutorPort.computeruse.releasePermission.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before microphone permission release dispatch.",
  },
  {
    dependencyId: "runtime.devicePolicy.microphone",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS permission leases, microphone privacy boundaries, revocation, platform adapters, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMicrophonePermissionReleaseProvider(
  executor: BaseToolExecutorPort | undefined,
): MicrophonePermissionReleaseProvider | undefined {
  const releasePermission = executor?.computeruse?.releasePermission;
  if (releasePermission === undefined) return undefined;

  return async (
    request: MicrophonePermissionReleaseProviderRequest,
  ): Promise<MicrophonePermissionReleaseProviderResult> => {
    const result = await releasePermission({
      resource: "microphone",
      leaseId: request.target.permissionLeaseId,
      deviceId: request.target.deviceId,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        targetApplication: request.target.targetApplication,
        releaseReason: request.target.releaseReason,
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
