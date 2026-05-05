import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  KeyboardEmulationAction,
  KeyboardEmulationProvider,
  KeyboardEmulationProviderRequest,
  KeyboardEmulationProviderResult,
} from "./core.js";

export type KeyboardEmulationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type KeyboardEmulationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: KeyboardEmulationProvider;
};

export type KeyboardEmulationProviderPractice = ComputerUseProviderPracticeMetadata<
  KeyboardEmulationPracticeProviderName,
  KeyboardEmulationProvider,
  KeyboardEmulationDependencies
>;

export const keyboardEmulationDependencyDeclarations = [
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

function runtimeActionKind(action: KeyboardEmulationAction): "press" | "type" | "shortcut" {
  if (action.kind === "key-press") return "press";
  if (action.kind === "text") return "type";
  return "shortcut";
}

export function createRuntimeKeyboardEmulationProvider(
  executor: BaseToolExecutorPort | undefined,
): KeyboardEmulationProvider | undefined {
  const keyboardAction = executor?.computeruse?.keyboardAction;
  if (keyboardAction === undefined) return undefined;

  return async (request: KeyboardEmulationProviderRequest): Promise<KeyboardEmulationProviderResult> => {
    const result = await keyboardAction({
      action: runtimeActionKind(request.action),
      text: request.action.kind === "text" ? request.action.text : undefined,
      keys: request.action.kind === "shortcut"
        ? request.action.keys
        : request.action.kind === "key-press"
          ? [request.action.key]
          : undefined,
      metadata: {
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        targetHint: request.targetHint,
        actionIndex: request.actionIndex,
        actionKind: request.action.kind,
        repeat: request.action.kind === "key-press" ? request.action.repeat : undefined,
        textCharacters: request.action.kind === "text" ? request.action.text.length : undefined,
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
