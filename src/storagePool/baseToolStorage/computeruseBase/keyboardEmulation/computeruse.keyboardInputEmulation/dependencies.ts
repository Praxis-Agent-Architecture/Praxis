import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  KeyboardInputEmulationProvider,
  KeyboardInputEmulationProviderRequest,
  KeyboardInputEmulationProviderResult,
} from "./core.js";

export type KeyboardInputEmulationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type KeyboardInputEmulationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: KeyboardInputEmulationProvider;
};

export type KeyboardInputEmulationProviderPractice = ComputerUseProviderPracticeMetadata<
  KeyboardInputEmulationPracticeProviderName,
  KeyboardInputEmulationProvider,
  KeyboardInputEmulationDependencies
>;

export const keyboardInputEmulationDependencyDeclarations = [
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
    description: "dryRun:false requires an affirmative runtime guard before keyboard event dispatch.",
  },
  {
    dependencyId: "runtime.focusManager.keyboardTarget",
    kind: "runtime",
    required: true,
    description: "Runtime owns focus, active target resolution, platform input backend, event emission, and cleanup.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeKeyboardInputEmulationProvider(
  executor: BaseToolExecutorPort | undefined,
): KeyboardInputEmulationProvider | undefined {
  const keyboardAction = executor?.computeruse?.keyboardAction;
  if (keyboardAction === undefined) return undefined;

  return async (request: KeyboardInputEmulationProviderRequest): Promise<KeyboardInputEmulationProviderResult> => {
    const result = await keyboardAction({
      action: "type",
      text: request.target.text,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        inputMode: request.target.inputMode,
        targetHint: request.target.targetHint,
        textCharacters: request.target.text.length,
        runtimeGuardAccepted: true,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(`PUBLIC_SAFE_PROVIDER_FAILURE:${result.error.message}`);
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
