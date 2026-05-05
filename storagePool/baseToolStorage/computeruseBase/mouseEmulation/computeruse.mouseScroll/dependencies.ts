import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type { MouseScrollProvider, MouseScrollProviderRequest, MouseScrollProviderResult } from "./core.js";

export type MouseScrollPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MouseScrollDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MouseScrollProvider;
};

export type MouseScrollProviderPractice = ComputerUseProviderPracticeMetadata<
  MouseScrollPracticeProviderName,
  MouseScrollProvider,
  MouseScrollDependencies
>;

export const mouseScrollDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before pointer scroll dispatch.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS wheel events, coordinate translation, focus, platform adapters, cleanup, and input policy.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMouseScrollProvider(executor: BaseToolExecutorPort | undefined): MouseScrollProvider | undefined {
  const pointerAction = executor?.computeruse?.pointerAction;
  if (pointerAction === undefined) return undefined;

  return async (request: MouseScrollProviderRequest): Promise<MouseScrollProviderResult> => {
    const result = await pointerAction({
      action: "scroll",
      target: {
        deltaX: request.target.deltaX,
        deltaY: request.target.deltaY,
        unit: request.target.unit,
        at: request.target.at,
        coordinateSpace: request.target.coordinateSpace,
        displayId: request.target.displayId,
        windowId: request.target.windowId,
        durationMs: request.target.durationMs,
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
