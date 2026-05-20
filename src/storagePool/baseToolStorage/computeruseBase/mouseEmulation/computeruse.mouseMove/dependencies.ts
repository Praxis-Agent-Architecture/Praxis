import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type { MouseMoveProvider, MouseMoveProviderRequest, MouseMoveProviderResult } from "./core.js";

export type MouseMovePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
const publicSafeProviderFailurePrefix = "PUBLIC_SAFE_PROVIDER_FAILURE:";

export type MouseMoveDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MouseMoveProvider;
};

export type MouseMoveProviderPractice = ComputerUseProviderPracticeMetadata<
  MouseMovePracticeProviderName,
  MouseMoveProvider,
  MouseMoveDependencies
>;

export const mouseMoveDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before pointer movement dispatch.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS pointer events, coordinate translation, focus, platform adapters, cleanup, and input policy.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMouseMoveProvider(executor: BaseToolExecutorPort | undefined): MouseMoveProvider | undefined {
  const pointerAction = executor?.computeruse?.pointerAction;
  if (pointerAction === undefined) return undefined;

  return async (request: MouseMoveProviderRequest): Promise<MouseMoveProviderResult> => {
    const result = await pointerAction({
      action: "move",
      target: {
        x: request.target.x,
        y: request.target.y,
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
        runtimeGuardAccepted: true,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(`${publicSafeProviderFailurePrefix}${result.error.message}`);
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
