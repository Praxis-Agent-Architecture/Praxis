import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  ScreenshotStorageProvider,
  ScreenshotStorageProviderRequest,
  ScreenshotStorageProviderResult,
} from "./core.js";

export type ScreenshotStoragePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ScreenshotStorageDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ScreenshotStorageProvider;
};

export type ScreenshotStorageProviderPractice = ComputerUseProviderPracticeMetadata<
  ScreenshotStoragePracticeProviderName,
  ScreenshotStorageProvider,
  ScreenshotStorageDependencies
>;

export const screenshotStorageDependencyDeclarations = [
  {
    dependencyId: "runtime.artifactStore.store",
    kind: "runtime",
    required: true,
    description: "Runtime-owned artifact storage support exposed through BaseToolExecutorPort.artifact.store.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before screenshot artifact storage dispatch.",
  },
  {
    dependencyId: "runtime.artifactStore.screenCapture",
    kind: "runtime",
    required: true,
    description: "Runtime owns screenshot bytes, artifact retention, privacy boundaries, and storage cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeScreenshotStorageProvider(
  executor: BaseToolExecutorPort | undefined,
): ScreenshotStorageProvider | undefined {
  const storeArtifact = executor?.artifact?.store;
  if (storeArtifact === undefined) return undefined;

  return async (request: ScreenshotStorageProviderRequest): Promise<ScreenshotStorageProviderResult> => {
    const result = await storeArtifact({
      artifactRef: request.target.screenshotRef,
      artifactKind: "screenshot",
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
      storedArtifactId: result.output.artifactId,
      storageUri: result.output.storageUri,
      retentionPolicy: result.output.retentionPolicy,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
