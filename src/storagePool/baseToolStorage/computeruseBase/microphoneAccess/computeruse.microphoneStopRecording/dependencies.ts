import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MicrophoneStopRecordingProvider,
  MicrophoneStopRecordingProviderRequest,
  MicrophoneStopRecordingProviderResult,
} from "./core.js";

export type MicrophoneStopRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MicrophoneStopRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MicrophoneStopRecordingProvider;
};

export type MicrophoneStopRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  MicrophoneStopRecordingPracticeProviderName,
  MicrophoneStopRecordingProvider,
  MicrophoneStopRecordingDependencies
>;

export const microphoneStopRecordingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.stopRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned microphone recording stop/finalization support exposed through BaseToolExecutorPort.computeruse.stopRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before microphone recording stop dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.microphone",
    kind: "runtime",
    required: true,
    description: "Runtime owns microphone recording session handles, final audio artifacts, device cleanup, privacy boundaries, and retention.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMicrophoneStopRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): MicrophoneStopRecordingProvider | undefined {
  const stopRecording = executor?.computeruse?.stopRecording;
  if (stopRecording === undefined) return undefined;

  return async (
    request: MicrophoneStopRecordingProviderRequest,
  ): Promise<MicrophoneStopRecordingProviderResult> => {
    const result = await stopRecording({
      resource: "microphone",
      recordingId: request.target.recordingId,
      storageTarget: request.target.persistHint,
      purpose: request.purpose,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        deviceId: request.target.deviceId,
        releaseDevice: request.target.releaseDevice,
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
