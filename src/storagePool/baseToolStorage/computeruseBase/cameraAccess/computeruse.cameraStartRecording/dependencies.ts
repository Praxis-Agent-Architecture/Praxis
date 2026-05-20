import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraStartRecordingProvider,
  CameraStartRecordingProviderRequest,
  CameraStartRecordingProviderResult,
} from "./core.js";

export type CameraStartRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraStartRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraStartRecordingProvider;
};

export type CameraStartRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraStartRecordingPracticeProviderName,
  CameraStartRecordingProvider,
  CameraStartRecordingDependencies
>;

export const cameraStartRecordingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.startRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera recording start support exposed through BaseToolExecutorPort.computeruse.startRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera recording starts.",
  },
  {
    dependencyId: "runtime.mediaSession.cameraRecording",
    kind: "runtime",
    required: true,
    description: "Runtime owns camera streams, recording session handles, codecs, artifact lifecycle, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraStartRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraStartRecordingProvider | undefined {
  const startRecording = executor?.computeruse?.startRecording;
  if (startRecording === undefined) return undefined;

  return async (request: CameraStartRecordingProviderRequest): Promise<CameraStartRecordingProviderResult> => {
    const result = await startRecording({
      resource: "camera",
      target: {
        cameraId: request.target.cameraId,
        purpose: request.target.purpose,
        includeAudio: request.target.includeAudio,
        maxDurationMs: request.target.maxDurationMs,
        recordingLabel: request.target.recordingLabel,
        destinationHint: request.target.destinationHint,
        permissionLeaseId: request.target.permissionLeaseId,
      },
      outputFormat: request.target.outputFormat,
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
      recordingId: result.output.recordingId,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
