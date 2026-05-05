import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  KeyboardSubmitInputProvider,
  KeyboardSubmitInputProviderRequest,
  KeyboardSubmitInputProviderResult,
} from "./core.js";

export type KeyboardSubmitInputPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type KeyboardSubmitInputDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: KeyboardSubmitInputProvider;
};

export type KeyboardSubmitInputProviderPractice = ComputerUseProviderPracticeMetadata<
  KeyboardSubmitInputPracticeProviderName,
  KeyboardSubmitInputProvider,
  KeyboardSubmitInputDependencies
>;

export const keyboardSubmitInputDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.keyboardAction",
    kind: "runtime",
    required: true,
    description: "Runtime-owned keyboard action support exposed through BaseToolExecutorPort.computeruse.keyboardAction.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before submit keyboard event dispatch.",
  },
  {
    dependencyId: "runtime.focusManager.keyboardTarget",
    kind: "runtime",
    required: true,
    description: "Runtime owns focus, active target resolution, platform input backend, event emission, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeKeyboardSubmitInputProvider(
  executor: BaseToolExecutorPort | undefined,
): KeyboardSubmitInputProvider | undefined {
  const keyboardAction = executor?.computeruse?.keyboardAction;
  if (keyboardAction === undefined) return undefined;

  return async (request: KeyboardSubmitInputProviderRequest): Promise<KeyboardSubmitInputProviderResult> => {
    const result = await keyboardAction({
      action: "submit",
      keys: [request.target.submitKey],
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        targetHint: request.target.targetHint,
        submitKey: request.target.submitKey,
        repeat: request.target.repeat,
        actionIndex: request.actionIndex,
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
