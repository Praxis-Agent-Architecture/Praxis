import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicKeyboardSubmitInputPractice } from "./anthropic.js";
import { deepmindKeyboardSubmitInputPractice } from "./deepmind.js";
import {
  keyboardSubmitInputDependencyDeclarations,
  type KeyboardSubmitInputDependencies,
  type KeyboardSubmitInputPracticeProviderName,
  type KeyboardSubmitInputProviderPractice,
} from "./dependencies.js";
import { openaiKeyboardSubmitInputPractice } from "./openai.js";
import {
  executeKeyboardSubmitInput as executeKeyboardSubmitInputCore,
  keyboardSubmitInputDescriptor,
  planKeyboardSubmitInput,
  type KeyboardSubmitInputOutput,
  type KeyboardSubmitInputProvider,
  type KeyboardSubmitInputRequest,
} from "./core.js";

export type KeyboardSubmitInputBestPracticeRequest = KeyboardSubmitInputRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: KeyboardSubmitInputPracticeProviderName;
};

export type KeyboardSubmitInputHandlerInput = Omit<KeyboardSubmitInputBestPracticeRequest, "executor">;

export type KeyboardSubmitInputPracticeSelection = {
  providerName: KeyboardSubmitInputPracticeProviderName;
  practice: KeyboardSubmitInputProviderPractice;
  provider?: KeyboardSubmitInputProvider;
};

export const keyboardSubmitInputProviderPractices = [
  anthropicKeyboardSubmitInputPractice,
  openaiKeyboardSubmitInputPractice,
  deepmindKeyboardSubmitInputPractice,
] as const;

export const keyboardSubmitInputBestPracticeDescriptor = {
  toolId: "computeruse.keyboardSubmitInput",
  bestPractice: "storage-owned-runtime-computeruse-keyboard-submit-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: keyboardSubmitInputDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: KeyboardSubmitInputProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse keyboard provider is available; dry-run remains available."],
  createProvider: () => undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeContextWithAuditMetadata(
  context: unknown,
  auditMetadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!isRecord(context)) {
    return { auditMetadata };
  }
  return {
    ...context,
    auditMetadata: {
      ...(isRecord(context.auditMetadata) ? context.auditMetadata : {}),
      ...auditMetadata,
    },
  };
}

export function selectKeyboardSubmitInputPractice(
  dependencies: KeyboardSubmitInputDependencies & {
    preferredProvider?: KeyboardSubmitInputPracticeProviderName;
  } = {},
): KeyboardSubmitInputPracticeSelection {
  return selectComputerUseProviderPractice(
    keyboardSubmitInputProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as KeyboardSubmitInputPracticeSelection;
}

export async function executeKeyboardSubmitInput(
  request: KeyboardSubmitInputBestPracticeRequest = {},
): ReturnType<typeof executeKeyboardSubmitInputCore> {
  const selection = selectKeyboardSubmitInputPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeKeyboardSubmitInputCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const keyboardSubmitInputBaseToolDefinition = createComputerUseBaseToolDefinition<
  KeyboardSubmitInputHandlerInput,
  KeyboardSubmitInputOutput
>({
  toolId: keyboardSubmitInputDescriptor.toolId,
  title: "Computer Use Keyboard Submit Input",
  description: "Emit submit/Enter keyboard actions through governed runtime computer-use keyboard support.",
  summary: "Use computeruse.keyboardSubmitInput to ask runtime to submit the current governed input target.",
  storageGroup: "keyboardEmulation",
  riskLevel: "risky",
  permissionHints: ["device:keyboard", "keyboard:write", "ui:focus"],
  dependencies: keyboardSubmitInputDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.keyboardSubmitInput.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          submitKey: { type: "string", enum: ["Enter", "NumpadEnter"] },
          targetHint: { type: "string" },
          repeat: { type: "integer", minimum: 1, maximum: keyboardSubmitInputDescriptor.maxRepeat },
        },
      },
      submitKey: { type: "string", enum: ["Enter", "NumpadEnter"] },
      targetHint: { type: "string" },
      repeat: { type: "integer", minimum: 1, maximum: keyboardSubmitInputDescriptor.maxRepeat },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.keyboardSubmitInput.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.keyboardSubmitInput" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      actionEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const keyboardSubmitInputHandler: BaseToolHandler<KeyboardSubmitInputHandlerInput, KeyboardSubmitInputOutput> =
  createComputerUseCoreHandler(keyboardSubmitInputBaseToolDefinition, async (request) => {
    const selection = selectKeyboardSubmitInputPractice({
      ...request.input,
      executor: request.executor,
    });
    const auditMetadata = injectRuntimeInvocationMetadata(
      buildComputerUsePracticeAuditMetadata(selection),
      isRecord(request.input.context) && isRecord(request.input.context.auditMetadata)
        ? request.input.context.auditMetadata
        : undefined,
      request,
    );

    return executeKeyboardSubmitInputCore({
      ...request.input,
      provider: selection.provider,
      context: {
        ...(isRecord(request.input.context) ? request.input.context : {}),
        runtimeId: isRecord(request.input.context) && typeof request.input.context.runtimeId === "string"
          ? request.input.context.runtimeId
          : request.runtimeId,
        sessionId: isRecord(request.input.context) && typeof request.input.context.sessionId === "string"
          ? request.input.context.sessionId
          : request.sessionId,
        invocationId: isRecord(request.input.context) && typeof request.input.context.invocationId === "string"
          ? request.input.context.invocationId
          : request.toolCallId,
        auditMetadata,
      },
    });
  });

export { executeKeyboardSubmitInputCore, keyboardSubmitInputDescriptor, planKeyboardSubmitInput };

export type {
  KeyboardSubmitInputAuditEvent,
  KeyboardSubmitInputBoundary,
  KeyboardSubmitInputContext,
  KeyboardSubmitInputError,
  KeyboardSubmitInputErrorCode,
  KeyboardSubmitInputGate,
  KeyboardSubmitInputOutput,
  KeyboardSubmitInputProvider,
  KeyboardSubmitInputProviderRequest,
  KeyboardSubmitInputProviderResult,
  KeyboardSubmitInputRequest,
  KeyboardSubmitInputResult,
  KeyboardSubmitInputTarget,
  KeyboardSubmitKey,
} from "./core.js";
