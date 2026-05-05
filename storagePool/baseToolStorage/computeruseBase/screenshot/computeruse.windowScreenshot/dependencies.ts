import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  WindowScreenshotProvider,
  WindowScreenshotProviderRequest,
  WindowScreenshotProviderResult,
} from "./core.js";

export type WindowScreenshotPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type WindowScreenshotDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: WindowScreenshotProvider;
};

export type WindowScreenshotProviderPractice = ComputerUseProviderPracticeMetadata<
  WindowScreenshotPracticeProviderName,
  WindowScreenshotProvider,
  WindowScreenshotDependencies
>;

export const windowScreenshotDependencyDeclarations = [
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

export function createRuntimeWindowScreenshotProvider(
  executor: BaseToolExecutorPort | undefined,
): WindowScreenshotProvider | undefined {
  const captureScreenshot = executor?.computeruse?.captureScreenshot;
  if (captureScreenshot === undefined) return undefined;

  return async (request: WindowScreenshotProviderRequest): Promise<WindowScreenshotProviderResult> => {
    const result = await captureScreenshot({
      target: "window",
      displayId: request.target.displayId,
      windowId: request.target.windowRef,
      purpose: request.purpose,
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        windowRef: request.target.windowRef,
        titleHint: request.target.titleHint,
        includeWindowFrame: request.target.includeWindowFrame,
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
