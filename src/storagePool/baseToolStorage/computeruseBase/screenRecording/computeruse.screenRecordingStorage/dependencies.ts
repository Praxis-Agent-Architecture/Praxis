import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  ScreenRecordingStorageProvider,
  ScreenRecordingStorageProviderRequest,
  ScreenRecordingStorageProviderResult,
} from "./core.js";

export type ScreenRecordingStoragePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ScreenRecordingStorageDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ScreenRecordingStorageProvider;
};

export type ScreenRecordingStorageProviderPractice = ComputerUseProviderPracticeMetadata<
  ScreenRecordingStoragePracticeProviderName,
  ScreenRecordingStorageProvider,
  ScreenRecordingStorageDependencies
>;

export const screenRecordingStorageDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.stopRecording",
    kind: "runtime",
    required: true,
    description: "Runtime-owned recording finalization support exposed through BaseToolExecutorPort.computeruse.stopRecording.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before screen recording finalization/storage dispatch.",
  },
  {
    dependencyId: "runtime.recordingSession.screen",
    kind: "runtime",
    required: true,
    description: "Runtime owns recording session handles, video artifacts, retention policy, privacy boundaries, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeScreenRecordingStorageProvider(
  executor: BaseToolExecutorPort | undefined,
): ScreenRecordingStorageProvider | undefined {
  const stopRecording = executor?.computeruse?.stopRecording;
  if (stopRecording === undefined) return undefined;

  return async (request: ScreenRecordingStorageProviderRequest): Promise<ScreenRecordingStorageProviderResult> => {
    const result = await stopRecording({
      resource: "screen",
      recordingId: request.target.recordingRef,
      storageTarget: request.target.storageTarget,
      retentionPolicy: request.target.retentionPolicy,
      purpose: request.purpose,
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
      storageUri: result.output.storageUri,
      retentionPolicy: result.output.retentionPolicy ?? request.target.retentionPolicy,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
