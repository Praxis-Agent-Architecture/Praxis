import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type { CheckboxConfirmProvider, CheckboxConfirmProviderRequest, CheckboxConfirmProviderResult } from "./core.js";

export type CheckboxConfirmPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
const publicSafeProviderFailurePrefix = "PUBLIC_SAFE_PROVIDER_FAILURE:";

export type CheckboxConfirmDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CheckboxConfirmProvider;
};

export type CheckboxConfirmProviderPractice = ComputerUseProviderPracticeMetadata<
  CheckboxConfirmPracticeProviderName,
  CheckboxConfirmProvider,
  CheckboxConfirmDependencies
>;

export const checkboxConfirmDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.pointerAction",
    kind: "runtime",
    required: true,
    description: "Runtime-owned pointer confirmation support exposed through BaseToolExecutorPort.computeruse.pointerAction.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before checkbox confirmation dispatch.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS pointer events, focus, target resolution, platform adapters, cleanup, and input policy.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeCheckboxConfirmProvider(executor: BaseToolExecutorPort | undefined): CheckboxConfirmProvider | undefined {
  const pointerAction = executor?.computeruse?.pointerAction;
  if (pointerAction === undefined) return undefined;

  return async (request: CheckboxConfirmProviderRequest): Promise<CheckboxConfirmProviderResult> => {
    const result = await pointerAction({
      action: "confirm",
      target: {
        expectedState: request.target.expectedState,
        currentState: request.target.currentState,
        label: request.target.label,
        selectorHint: request.target.selectorHint,
        point: request.target.point,
        coordinateSpace: request.target.coordinateSpace,
        displayId: request.target.displayId,
        windowId: request.target.windowId,
        clickMode: request.target.clickMode,
        clickCount: request.target.clickCount,
        wouldToggle: request.target.wouldToggle,
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
