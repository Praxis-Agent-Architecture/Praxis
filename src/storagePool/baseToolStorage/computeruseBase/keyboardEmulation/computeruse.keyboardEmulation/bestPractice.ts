import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicKeyboardEmulationPractice } from "./anthropic.js";
import { deepmindKeyboardEmulationPractice } from "./deepmind.js";
import {
  keyboardEmulationDependencyDeclarations,
  type KeyboardEmulationDependencies,
  type KeyboardEmulationPracticeProviderName,
  type KeyboardEmulationProviderPractice,
} from "./dependencies.js";
import { openaiKeyboardEmulationPractice } from "./openai.js";
import {
  executeKeyboardEmulation as executeKeyboardEmulationCore,
  keyboardEmulationDescriptor,
  planKeyboardEmulation,
  type KeyboardEmulationOutput,
  type KeyboardEmulationProvider,
  type KeyboardEmulationRequest,
} from "./core.js";

export type KeyboardEmulationBestPracticeRequest = KeyboardEmulationRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: KeyboardEmulationPracticeProviderName;
};

export type KeyboardEmulationHandlerInput = Omit<KeyboardEmulationBestPracticeRequest, "executor">;

export type KeyboardEmulationPracticeSelection = {
  providerName: KeyboardEmulationPracticeProviderName;
  practice: KeyboardEmulationProviderPractice;
  provider?: KeyboardEmulationProvider;
};

export const keyboardEmulationProviderPractices = [
  anthropicKeyboardEmulationPractice,
  openaiKeyboardEmulationPractice,
  deepmindKeyboardEmulationPractice,
] as const;

export const keyboardEmulationBestPracticeDescriptor = {
  toolId: "computeruse.keyboardEmulation",
  bestPractice: "storage-owned-runtime-computeruse-keyboard-sequence-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: keyboardEmulationDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: KeyboardEmulationProviderPractice = {
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

export function selectKeyboardEmulationPractice(
  dependencies: KeyboardEmulationDependencies & {
    preferredProvider?: KeyboardEmulationPracticeProviderName;
  } = {},
): KeyboardEmulationPracticeSelection {
  return selectComputerUseProviderPractice(
    keyboardEmulationProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as KeyboardEmulationPracticeSelection;
}

export async function executeKeyboardEmulation(
  request: KeyboardEmulationBestPracticeRequest = {},
): ReturnType<typeof executeKeyboardEmulationCore> {
  const selection = selectKeyboardEmulationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeKeyboardEmulationCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const keyboardEmulationBaseToolDefinition = createComputerUseBaseToolDefinition<
  KeyboardEmulationHandlerInput,
  KeyboardEmulationOutput
>({
  toolId: keyboardEmulationDescriptor.toolId,
  title: "Computer Use Keyboard Emulation",
  description: "Emit generic keyboard action sequences through governed runtime computer-use keyboard support.",
  summary: "Use computeruse.keyboardEmulation to ask runtime to perform key-press, text, or shortcut keyboard actions.",
  storageGroup: "keyboardEmulation",
  riskLevel: "risky",
  permissionHints: ["device:keyboard", "keyboard:write", "ui:focus"],
  dependencies: keyboardEmulationDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.keyboardEmulation.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["kind"],
              properties: {
                kind: { type: "string", enum: ["key-press", "text", "shortcut"] },
                key: { type: "string" },
                repeat: { type: "integer", minimum: 1, maximum: keyboardEmulationDescriptor.maxKeyRepeat },
                text: { type: "string", minLength: 1, maxLength: keyboardEmulationDescriptor.maxTextLength },
                keys: {
                  type: "array",
                  minItems: 2,
                  maxItems: keyboardEmulationDescriptor.maxShortcutKeys,
                  items: { type: "string" },
                },
              },
            },
          },
          targetHint: { type: "string" },
        },
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["kind"],
          properties: {
            kind: { type: "string", enum: ["key-press", "text", "shortcut"] },
            key: { type: "string" },
            repeat: { type: "integer", minimum: 1, maximum: keyboardEmulationDescriptor.maxKeyRepeat },
            text: { type: "string", minLength: 1, maxLength: keyboardEmulationDescriptor.maxTextLength },
            keys: {
              type: "array",
              minItems: 2,
              maxItems: keyboardEmulationDescriptor.maxShortcutKeys,
              items: { type: "string" },
            },
          },
        },
      },
      targetHint: { type: "string" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.keyboardEmulation.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.keyboardEmulation" },
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

export const keyboardEmulationHandler: BaseToolHandler<KeyboardEmulationHandlerInput, KeyboardEmulationOutput> =
  createComputerUseCoreHandler(keyboardEmulationBaseToolDefinition, async (request) => {
    const selection = selectKeyboardEmulationPractice({
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

    return executeKeyboardEmulationCore({
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

export { executeKeyboardEmulationCore, keyboardEmulationDescriptor, planKeyboardEmulation };

export type {
  KeyboardEmulationAction,
  KeyboardEmulationActionSummary,
  KeyboardEmulationAuditEvent,
  KeyboardEmulationBoundary,
  KeyboardEmulationContext,
  KeyboardEmulationError,
  KeyboardEmulationErrorCode,
  KeyboardEmulationGate,
  KeyboardEmulationOutput,
  KeyboardEmulationProvider,
  KeyboardEmulationProviderRequest,
  KeyboardEmulationProviderResult,
  KeyboardEmulationRequest,
  KeyboardEmulationResult,
  KeyboardEmulationTarget,
} from "./core.js";
