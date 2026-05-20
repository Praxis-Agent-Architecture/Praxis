import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraContentStorageKind,
  CameraContentStorageProvider,
  CameraContentStorageProviderRequest,
  CameraContentStorageProviderResult,
} from "./core.js";

export type CameraContentStoragePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraContentStorageDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraContentStorageProvider;
};

export type CameraContentStorageProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraContentStoragePracticeProviderName,
  CameraContentStorageProvider,
  CameraContentStorageDependencies
>;

export const cameraContentStorageDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before camera content storage dispatch.",
  },
  {
    dependencyId: "runtime.artifactStore.cameraContent",
    kind: "runtime",
    required: true,
    description: "Runtime owns camera bytes, video/photo material, artifact retention, privacy boundaries, and storage cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function toArtifactKind(contentKind: CameraContentStorageKind): "camera-photo" | "video" | "generic" {
  if (contentKind === "camera-recording") return "video";
  if (contentKind === "generic") return "generic";
  return "camera-photo";
}

export function createRuntimeCameraContentStorageProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraContentStorageProvider | undefined {
  const storeArtifact = executor?.artifact?.store;
  if (storeArtifact === undefined) return undefined;

  return async (request: CameraContentStorageProviderRequest): Promise<CameraContentStorageProviderResult> => {
    const result = await storeArtifact({
      artifactRef: request.target.contentRef,
      artifactKind: toArtifactKind(request.target.contentKind),
      storageTarget: request.target.storageTarget,
      retentionPolicy: request.target.retentionPolicy,
      purpose: request.purpose,
      metadata: {
        contentKind: request.target.contentKind,
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
