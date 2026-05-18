import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraStopRecordingProvider,
  CameraStopRecordingProviderRequest,
  CameraStopRecordingProviderResult,
} from "./core.js";

export type CameraStopRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraStopRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraStopRecordingProvider;
};

export type CameraStopRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraStopRecordingPracticeProviderName,
  CameraStopRecordingProvider,
  CameraStopRecordingDependencies
>;

export const cameraStopRecordingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.stopRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera recording finalization support exposed through BaseToolExecutorPort.computeruse.stopRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera recording is stopped.",
  },
  {
    dependencyId: "runtime.mediaSession.cameraRecording",
    kind: "runtime",
    required: true,
    description: "Runtime owns camera recording sessions, codecs, video artifacts, retention policy, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraStopRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraStopRecordingProvider | undefined {
  const stopRecording = executor?.computeruse?.stopRecording;
  if (stopRecording === undefined) return undefined;

  return async (request: CameraStopRecordingProviderRequest): Promise<CameraStopRecordingProviderResult> => {
    const result = await stopRecording({
      resource: "camera",
      recordingId: request.target.recordingId,
      storageTarget: request.target.storageTarget ?? request.target.destinationHint,
      retentionPolicy: request.target.retentionPolicy,
      purpose: request.target.purpose,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      artifactId: result.output.artifactId,
      mimeType: result.output.mimeType,
      storageUri: typeof result.output.metadata?.storageUri === "string" ? result.output.metadata.storageUri : undefined,
      retentionPolicy:
        result.output.metadata?.retentionPolicy === "ephemeral" ||
        result.output.metadata?.retentionPolicy === "session-only" ||
        result.output.metadata?.retentionPolicy === "session-scoped" ||
        result.output.metadata?.retentionPolicy === "persistent"
          ? result.output.metadata.retentionPolicy
          : request.target.retentionPolicy,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
