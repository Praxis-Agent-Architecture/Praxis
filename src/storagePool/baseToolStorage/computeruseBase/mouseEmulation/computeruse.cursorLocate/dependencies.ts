import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type { CursorLocateProvider, CursorLocateProviderRequest, CursorLocateProviderResult } from "./core.js";

export type CursorLocatePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CursorLocateDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CursorLocateProvider;
};

export type CursorLocateProviderPractice = ComputerUseProviderPracticeMetadata<
  CursorLocatePracticeProviderName,
  CursorLocateProvider,
  CursorLocateDependencies
>;

export const cursorLocateDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.locateCursor",
    kind: "runtime",
    required: true,
    description: "Runtime-owned cursor read support exposed through BaseToolExecutorPort.computeruse.locateCursor.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before live cursor observation.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns cursor position reads, coordinate translation, focus policy, platform adapters, and privacy boundaries.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCursorLocateProvider(executor: BaseToolExecutorPort | undefined): CursorLocateProvider | undefined {
  const locateCursor = executor?.computeruse?.locateCursor;
  if (locateCursor === undefined) return undefined;

  return async (request: CursorLocateProviderRequest): Promise<CursorLocateProviderResult> => {
    const result = await locateCursor({
      coordinateSpace: request.target.coordinateSpace,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        purpose: request.purpose,
        displayId: request.target.displayId,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      position: {
        x: result.output.x,
        y: result.output.y,
        coordinateSpace: result.output.coordinateSpace,
        displayId: request.target.displayId,
      },
      metadata: result.metadata,
    };
  };
}
