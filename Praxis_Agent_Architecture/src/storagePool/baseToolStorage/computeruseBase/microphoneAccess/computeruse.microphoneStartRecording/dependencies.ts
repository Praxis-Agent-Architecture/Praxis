import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MicrophoneStartRecordingProvider,
  MicrophoneStartRecordingProviderRequest,
  MicrophoneStartRecordingProviderResult,
} from "./core.js";

export type MicrophoneStartRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MicrophoneStartRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MicrophoneStartRecordingProvider;
};

export type MicrophoneStartRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  MicrophoneStartRecordingPracticeProviderName,
  MicrophoneStartRecordingProvider,
  MicrophoneStartRecordingDependencies
>;

export const microphoneStartRecordingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.startRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned microphone recording support exposed through BaseToolExecutorPort.computeruse.startRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before microphone recording dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.microphone",
    kind: "runtime",
    required: true,
    description: "Runtime owns microphone streams, recording session handles, codecs, artifacts, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMicrophoneStartRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): MicrophoneStartRecordingProvider | undefined {
  const startRecording = executor?.computeruse?.startRecording;
  if (startRecording === undefined) return undefined;

  return async (
    request: MicrophoneStartRecordingProviderRequest,
  ): Promise<MicrophoneStartRecordingProviderResult> => {
    const result = await startRecording({
      resource: "microphone",
      target: {
        target: "microphone",
        microphoneId: request.target.deviceId,
        deviceId: request.target.deviceId,
        maxDurationMs: request.target.maxDurationMs,
        sampleRateHz: request.target.sampleRateHz,
        channelCount: request.target.channelCount,
        permissionLeaseId: request.target.permissionLeaseId,
        recordingLabel: request.target.recordingLabel,
        destinationHint: request.target.destinationHint,
      },
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        purpose: request.purpose,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      recordingId: result.output.recordingId,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
