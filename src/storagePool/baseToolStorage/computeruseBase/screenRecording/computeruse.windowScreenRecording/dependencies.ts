import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  WindowScreenRecordingProvider,
  WindowScreenRecordingProviderRequest,
  WindowScreenRecordingProviderResult,
} from "./core.js";

export type WindowScreenRecordingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type WindowScreenRecordingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: WindowScreenRecordingProvider;
};

export type WindowScreenRecordingProviderPractice = ComputerUseProviderPracticeMetadata<
  WindowScreenRecordingPracticeProviderName,
  WindowScreenRecordingProvider,
  WindowScreenRecordingDependencies
>;

export const windowScreenRecordingDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before window screen recording dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.screen",
    kind: "runtime",
    required: true,
    description: "Runtime owns window selection, recording streams, session handles, codecs, artifacts, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeWindowScreenRecordingProvider(
  executor: BaseToolExecutorPort | undefined,
): WindowScreenRecordingProvider | undefined {
  const startRecording = executor?.computeruse?.startRecording;
  if (startRecording === undefined) return undefined;

  return async (request: WindowScreenRecordingProviderRequest): Promise<WindowScreenRecordingProviderResult> => {
    const result = await startRecording({
      resource: "screen",
      target: {
        target: "window",
        windowId: request.target.windowId,
        titleHint: request.target.titleHint,
        maxDurationMs: request.target.maxDurationMs,
        frameRate: request.target.frameRate,
        includeCursor: request.target.includeCursor,
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
