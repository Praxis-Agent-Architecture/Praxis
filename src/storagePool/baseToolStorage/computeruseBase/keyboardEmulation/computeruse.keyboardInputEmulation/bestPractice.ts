import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicKeyboardInputEmulationPractice } from "./anthropic.js";
import { deepmindKeyboardInputEmulationPractice } from "./deepmind.js";
import {
  keyboardInputEmulationDependencyDeclarations,
  type KeyboardInputEmulationDependencies,
  type KeyboardInputEmulationPracticeProviderName,
  type KeyboardInputEmulationProviderPractice,
} from "./dependencies.js";
import { openaiKeyboardInputEmulationPractice } from "./openai.js";
import {
  executeKeyboardInputEmulation as executeKeyboardInputEmulationCore,
  keyboardInputEmulationDescriptor,
  planKeyboardInputEmulation,
  type KeyboardInputEmulationOutput,
  type KeyboardInputEmulationProvider,
  type KeyboardInputEmulationRequest,
} from "./core.js";

export type KeyboardInputEmulationBestPracticeRequest = KeyboardInputEmulationRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: KeyboardInputEmulationPracticeProviderName;
};

export type KeyboardInputEmulationHandlerInput = Omit<KeyboardInputEmulationBestPracticeRequest, "executor">;

export type KeyboardInputEmulationPracticeSelection = {
  providerName: KeyboardInputEmulationPracticeProviderName;
  practice: KeyboardInputEmulationProviderPractice;
  provider?: KeyboardInputEmulationProvider;
};

export const keyboardInputEmulationProviderPractices = [
  anthropicKeyboardInputEmulationPractice,
  openaiKeyboardInputEmulationPractice,
  deepmindKeyboardInputEmulationPractice,
] as const;

export const keyboardInputEmulationBestPracticeDescriptor = {
  toolId: "computeruse.keyboardInputEmulation",
  bestPractice: "storage-owned-runtime-computeruse-keyboard-action-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: keyboardInputEmulationDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: KeyboardInputEmulationProviderPractice = {
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

export function selectKeyboardInputEmulationPractice(
  dependencies: KeyboardInputEmulationDependencies & {
    preferredProvider?: KeyboardInputEmulationPracticeProviderName;
  } = {},
): KeyboardInputEmulationPracticeSelection {
  return selectComputerUseProviderPractice(
    keyboardInputEmulationProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as KeyboardInputEmulationPracticeSelection;
}

export async function executeKeyboardInputEmulation(
  request: KeyboardInputEmulationBestPracticeRequest = {},
): ReturnType<typeof executeKeyboardInputEmulationCore> {
  const selection = selectKeyboardInputEmulationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeKeyboardInputEmulationCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const keyboardInputEmulationBaseToolDefinition = createComputerUseBaseToolDefinition<
  KeyboardInputEmulationHandlerInput,
  KeyboardInputEmulationOutput
>({
  toolId: keyboardInputEmulationDescriptor.toolId,
  title: "Computer Use Keyboard Input Emulation",
  description: "Emit text input through governed runtime computer-use keyboard support.",
  summary: "Use computeruse.keyboardInputEmulation to ask runtime to type text into the current governed target.",
  storageGroup: "keyboardEmulation",
  riskLevel: "risky",
  permissionHints: ["device:keyboard", "keyboard:write", "ui:focus"],
  dependencies: keyboardInputEmulationDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.keyboardInputEmulation.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          text: { type: "string" },
          inputMode: { type: "string", enum: ["text", "paste"] },
          targetHint: { type: "string" },
          maxTextLength: { type: "integer", minimum: 1, maximum: keyboardInputEmulationDescriptor.maxTextLengthLimit },
        },
      },
      text: { type: "string" },
      inputMode: { type: "string", enum: ["text", "paste"] },
      targetHint: { type: "string" },
      maxTextLength: { type: "integer", minimum: 1, maximum: keyboardInputEmulationDescriptor.maxTextLengthLimit },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.keyboardInputEmulation.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.keyboardInputEmulation" },
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

export const keyboardInputEmulationHandler: BaseToolHandler<
  KeyboardInputEmulationHandlerInput,
  KeyboardInputEmulationOutput
> = createComputerUseCoreHandler(keyboardInputEmulationBaseToolDefinition, async (request) => {
  const selection = selectKeyboardInputEmulationPractice({
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

  return executeKeyboardInputEmulationCore({
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

export { executeKeyboardInputEmulationCore, keyboardInputEmulationDescriptor, planKeyboardInputEmulation };

export type {
  KeyboardInputEmulationAuditEvent,
  KeyboardInputEmulationBoundary,
  KeyboardInputEmulationContext,
  KeyboardInputEmulationError,
  KeyboardInputEmulationErrorCode,
  KeyboardInputEmulationGate,
  KeyboardInputEmulationOutput,
  KeyboardInputEmulationProvider,
  KeyboardInputEmulationProviderRequest,
  KeyboardInputEmulationProviderResult,
  KeyboardInputEmulationRequest,
  KeyboardInputEmulationResult,
  KeyboardInputEmulationTarget,
  KeyboardInputMode,
} from "./core.js";
