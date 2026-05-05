import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  FreeformScreenshotProvider,
  FreeformScreenshotProviderRequest,
  FreeformScreenshotProviderResult,
} from "./core.js";

export type FreeformScreenshotPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type FreeformScreenshotDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: FreeformScreenshotProvider;
};

export type FreeformScreenshotProviderPractice = ComputerUseProviderPracticeMetadata<
  FreeformScreenshotPracticeProviderName,
  FreeformScreenshotProvider,
  FreeformScreenshotDependencies
>;

export const freeformScreenshotDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.captureScreenshot",
    kind: "runtime",
    required: true,
    description: "Runtime-owned computer-use screenshot support exposed through BaseToolExecutorPort.computeruse.captureScreenshot.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before screen capture dispatch.",
  },
  {
    dependencyId: "runtime.artifactStore.screenCapture",
    kind: "runtime",
    required: true,
    description: "Runtime owns screen bytes, privacy boundaries, and artifact storage; computeruseBase returns only artifact metadata.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeFreeformScreenshotProvider(
  executor: BaseToolExecutorPort | undefined,
): FreeformScreenshotProvider | undefined {
  const captureScreenshot = executor?.computeruse?.captureScreenshot;
  if (captureScreenshot === undefined) return undefined;

  return async (request: FreeformScreenshotProviderRequest): Promise<FreeformScreenshotProviderResult> => {
    const result = await captureScreenshot({
      target: "freeform",
      displayId: request.target.displayId,
      region: request.target.boundingBox,
      purpose: request.purpose,
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        points: request.target.points,
        boundingBox: request.target.boundingBox,
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
