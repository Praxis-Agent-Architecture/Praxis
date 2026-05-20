import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  InputCheckboxConfirmProvider,
  InputCheckboxConfirmProviderRequest,
  InputCheckboxConfirmProviderResult,
} from "./core.js";

export type InputCheckboxConfirmPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type InputCheckboxConfirmDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: InputCheckboxConfirmProvider;
};

export type InputCheckboxConfirmProviderPractice = ComputerUseProviderPracticeMetadata<
  InputCheckboxConfirmPracticeProviderName,
  InputCheckboxConfirmProvider,
  InputCheckboxConfirmDependencies
>;

export const inputCheckboxConfirmDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.keyboardAction",
    kind: "runtime",
    required: true,
    description: "Runtime-owned keyboard confirm support exposed through BaseToolExecutorPort.computeruse.keyboardAction.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before checkbox confirmation keyboard dispatch.",
  },
  {
    dependencyId: "runtime.focusManager.keyboardTarget",
    kind: "runtime",
    required: true,
    description: "Runtime owns focus, active checkbox target resolution, platform input backend, event emission, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeInputCheckboxConfirmProvider(
  executor: BaseToolExecutorPort | undefined,
): InputCheckboxConfirmProvider | undefined {
  const keyboardAction = executor?.computeruse?.keyboardAction;
  if (keyboardAction === undefined) return undefined;

  return async (request: InputCheckboxConfirmProviderRequest): Promise<InputCheckboxConfirmProviderResult> => {
    const result = await keyboardAction({
      action: "confirm",
      keys: request.target.keySequence,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        label: request.target.label,
        selectorHint: request.target.selectorHint,
        expectedState: request.target.expectedState,
        currentState: request.target.currentState,
        confirmationKey: request.target.confirmationKey,
        wouldToggle: request.target.wouldToggle,
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
