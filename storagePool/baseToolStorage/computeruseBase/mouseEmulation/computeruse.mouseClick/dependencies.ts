import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type { MouseClickProvider, MouseClickProviderRequest, MouseClickProviderResult } from "./core.js";

export type MouseClickPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MouseClickDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MouseClickProvider;
};

export type MouseClickProviderPractice = ComputerUseProviderPracticeMetadata<
  MouseClickPracticeProviderName,
  MouseClickProvider,
  MouseClickDependencies
>;

export const mouseClickDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.pointerAction",
    kind: "runtime",
    required: true,
    description: "Runtime-owned pointer action support exposed through BaseToolExecutorPort.computeruse.pointerAction.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before pointer click dispatch.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS pointer events, platform adapters, session focus, cleanup, and input policy.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMouseClickProvider(executor: BaseToolExecutorPort | undefined): MouseClickProvider | undefined {
  const pointerAction = executor?.computeruse?.pointerAction;
  if (pointerAction === undefined) return undefined;

  return async (request: MouseClickProviderRequest): Promise<MouseClickProviderResult> => {
    const result = await pointerAction({
      action: "click",
      target: {
        button: request.target.button,
        clickCount: request.target.clickCount,
        at: request.target.at,
        coordinateSpace: request.target.coordinateSpace,
        displayId: request.target.displayId,
        windowId: request.target.windowId,
        usesCurrentCursor: request.target.usesCurrentCursor,
      },
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
      actionId: result.output.actionId,
      metadata: {
        ...(result.output.metadata ?? {}),
        ...(result.metadata ?? {}),
      },
    };
  };
}
