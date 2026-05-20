import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  RectangularSelectionScreenRecordingProvider,
  RectangularSelectionScreenRecordingProviderRequest,
  RectangularSelectionScreenRecordingProviderResult,
} from "./core.js";

export type RectangularSelectionScreenRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type RectangularSelectionScreenRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: RectangularSelectionScreenRecordingProvider;
};

export type RectangularSelectionScreenRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  RectangularSelectionScreenRecordingPracticeProviderName,
  RectangularSelectionScreenRecordingProvider,
  RectangularSelectionScreenRecordingDependencies
>;

export const rectangularSelectionScreenRecordingDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before rectangular selection screen recording dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.screen",
    kind: "runtime",
    required: true,
    description: "Runtime owns region selection, recording streams, session handles, codecs, artifacts, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeRectangularSelectionScreenRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): RectangularSelectionScreenRecordingProvider | undefined {
  const startRecording = executor?.computeruse?.startRecording;
  if (startRecording === undefined) return undefined;

  return async (request: RectangularSelectionScreenRecordingProviderRequest): Promise<RectangularSelectionScreenRecordingProviderResult> => {
    const result = await startRecording({
      resource: "screen",
      target: {
        target: "region",
        displayId: request.target.displayId,
        region: request.target.rect,
        maxDurationMs: request.target.maxDurationMs,
        frameRate: request.target.frameRate,
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
