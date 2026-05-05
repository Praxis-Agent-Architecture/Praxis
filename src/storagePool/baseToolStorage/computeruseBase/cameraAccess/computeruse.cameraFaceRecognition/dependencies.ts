import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  CameraFaceRecognitionProvider,
  CameraFaceRecognitionProviderRequest,
  CameraFaceRecognitionProviderResult,
} from "./core.js";

export type CameraFaceRecognitionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CameraFaceRecognitionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CameraFaceRecognitionProvider;
};

export type CameraFaceRecognitionProviderPractice = ComputerUseProviderPracticeMetadata<
  CameraFaceRecognitionPracticeProviderName,
  CameraFaceRecognitionProvider,
  CameraFaceRecognitionDependencies
>;

export const cameraFaceRecognitionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.analyzeCameraFrame",
    kind: "runtime",
    required: true,
    description: "Runtime-owned camera frame analysis support exposed through BaseToolExecutorPort.computeruse.analyzeCameraFrame.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before camera face analysis dispatch.",
  },
  {
    dependencyId: "runtime.biometricPolicy.subjectConsent",
    kind: "permission",
    required: true,
    description: "Identity-level modes require explicit subject consent before provider dispatch.",
  },
  {
    dependencyId: "runtime.visionProvider.faceAnalysis",
    kind: "runtime",
    required: true,
    description: "Runtime owns camera bytes, biometric matching, model/provider dependencies, retention policy, and privacy boundaries.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCameraFaceRecognitionProvider(
  executor: BaseToolExecutorPort | undefined,
): CameraFaceRecognitionProvider | undefined {
  const analyzeCameraFrame = executor?.computeruse?.analyzeCameraFrame;
  if (analyzeCameraFrame === undefined) return undefined;

  return async (request: CameraFaceRecognitionProviderRequest): Promise<CameraFaceRecognitionProviderResult> => {
    const result = await analyzeCameraFrame({
      frameRef: request.target.frameRef,
      operation: request.target.mode,
      deviceId: request.target.deviceId,
      maxFaces: request.target.maxFaces,
      subjectRef: request.target.subjectRef,
      metadata: {
        subjectConsent: request.target.subjectConsent,
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
      faceCount: result.output.faceCount ?? result.output.faces?.length ?? 0,
      faces: result.output.faces ?? [],
      identityResolved: result.output.identityResolved === true,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
