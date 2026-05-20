import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  FullscreenScreenshotProvider,
  FullscreenScreenshotProviderRequest,
  FullscreenScreenshotProviderResult,
} from "./core.js";

export type FullscreenScreenshotPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type FullscreenScreenshotDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: FullscreenScreenshotProvider;
};

export type FullscreenScreenshotProviderPractice = ComputerUseProviderPracticeMetadata<
  FullscreenScreenshotPracticeProviderName,
  FullscreenScreenshotProvider,
  FullscreenScreenshotDependencies
>;

export const fullscreenScreenshotDependencyDeclarations = [
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

export function createRuntimeFullscreenScreenshotProvider(
  executor: BaseToolExecutorPort | undefined,
): FullscreenScreenshotProvider | undefined {
  const captureScreenshot = executor?.computeruse?.captureScreenshot;
  if (captureScreenshot === undefined) return undefined;

  return async (request: FullscreenScreenshotProviderRequest): Promise<FullscreenScreenshotProviderResult> => {
    const result = await captureScreenshot({
      target: "fullscreen",
      displayId: request.target.displayId,
      purpose: request.purpose,
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw Object.assign(new Error(result.error.message), { code: result.error.code });
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
