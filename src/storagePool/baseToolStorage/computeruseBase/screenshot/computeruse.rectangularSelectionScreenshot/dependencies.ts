import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  RectangularSelectionScreenshotProvider,
  RectangularSelectionScreenshotProviderRequest,
  RectangularSelectionScreenshotProviderResult,
} from "./core.js";

export type RectangularSelectionScreenshotPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type RectangularSelectionScreenshotDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: RectangularSelectionScreenshotProvider;
};

export type RectangularSelectionScreenshotProviderPractice = ComputerUseProviderPracticeMetadata<
  RectangularSelectionScreenshotPracticeProviderName,
  RectangularSelectionScreenshotProvider,
  RectangularSelectionScreenshotDependencies
>;

export const rectangularSelectionScreenshotDependencyDeclarations = [
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

export function createRuntimeRectangularSelectionScreenshotProvider(
  executor: BaseToolExecutorPort | undefined,
): RectangularSelectionScreenshotProvider | undefined {
  const captureScreenshot = executor?.computeruse?.captureScreenshot;
  if (captureScreenshot === undefined) return undefined;

  return async (request: RectangularSelectionScreenshotProviderRequest): Promise<RectangularSelectionScreenshotProviderResult> => {
    const result = await captureScreenshot({
      target: "region",
      displayId: request.target.displayId,
      region: request.target.rect,
      purpose: request.purpose,
      outputFormat: request.target.outputFormat,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        rect: request.target.rect,
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
