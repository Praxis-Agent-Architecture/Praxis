import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  FullscreenScreenRecordingProvider,
  FullscreenScreenRecordingProviderRequest,
  FullscreenScreenRecordingProviderResult,
} from "./core.js";

export type FullscreenScreenRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type FullscreenScreenRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: FullscreenScreenRecordingProvider;
};

export type FullscreenScreenRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  FullscreenScreenRecordingPracticeProviderName,
  FullscreenScreenRecordingProvider,
  FullscreenScreenRecordingDependencies
>;

export const fullscreenScreenRecordingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.startRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned computer-use recording support exposed through BaseToolExecutorPort.computeruse.startRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before screen recording dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.screen",
    kind: "runtime",
    required: true,
    description: "Runtime owns screen recording streams, session handles, codecs, artifacts, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeFullscreenScreenRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): FullscreenScreenRecordingProvider | undefined {
  const startRecording = executor?.computeruse?.startRecording;
  if (startRecording === undefined) return undefined;

  return async (
    request: FullscreenScreenRecordingProviderRequest,
  ): Promise<FullscreenScreenRecordingProviderResult> => {
    const result = await startRecording({
      resource: "screen",
      target: {
        target: "fullscreen",
        displayId: request.target.displayId,
        maxDurationMs: request.target.maxDurationMs,
        includeCursor: request.target.includeCursor,
        includeAudio: request.target.includeAudio,
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
