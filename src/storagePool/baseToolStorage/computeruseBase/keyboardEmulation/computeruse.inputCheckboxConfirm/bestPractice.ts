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
import { anthropicInputCheckboxConfirmPractice } from "./anthropic.js";
import { deepmindInputCheckboxConfirmPractice } from "./deepmind.js";
import {
  inputCheckboxConfirmDependencyDeclarations,
  type InputCheckboxConfirmDependencies,
  type InputCheckboxConfirmPracticeProviderName,
  type InputCheckboxConfirmProviderPractice,
} from "./dependencies.js";
import { openaiInputCheckboxConfirmPractice } from "./openai.js";
import {
  executeInputCheckboxConfirm as executeInputCheckboxConfirmCore,
  inputCheckboxConfirmDescriptor,
  planInputCheckboxConfirm,
  type InputCheckboxConfirmOutput,
  type InputCheckboxConfirmProvider,
  type InputCheckboxConfirmRequest,
} from "./core.js";

export type InputCheckboxConfirmBestPracticeRequest = InputCheckboxConfirmRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: InputCheckboxConfirmPracticeProviderName;
};

export type InputCheckboxConfirmHandlerInput = Omit<InputCheckboxConfirmBestPracticeRequest, "executor">;

export type InputCheckboxConfirmPracticeSelection = {
  providerName: InputCheckboxConfirmPracticeProviderName;
  practice: InputCheckboxConfirmProviderPractice;
  provider?: InputCheckboxConfirmProvider;
};

export const inputCheckboxConfirmProviderPractices = [
  anthropicInputCheckboxConfirmPractice,
  openaiInputCheckboxConfirmPractice,
  deepmindInputCheckboxConfirmPractice,
] as const;

export const inputCheckboxConfirmBestPracticeDescriptor = {
  toolId: "computeruse.inputCheckboxConfirm",
  bestPractice: "storage-owned-runtime-computeruse-checkbox-confirm-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: inputCheckboxConfirmDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: InputCheckboxConfirmProviderPractice = {
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

export function selectInputCheckboxConfirmPractice(
  dependencies: InputCheckboxConfirmDependencies & {
    preferredProvider?: InputCheckboxConfirmPracticeProviderName;
  } = {},
): InputCheckboxConfirmPracticeSelection {
  return selectComputerUseProviderPractice(
    inputCheckboxConfirmProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as InputCheckboxConfirmPracticeSelection;
}

export async function executeInputCheckboxConfirm(
  request: InputCheckboxConfirmBestPracticeRequest = {},
): ReturnType<typeof executeInputCheckboxConfirmCore> {
  const selection = selectInputCheckboxConfirmPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeInputCheckboxConfirmCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const inputCheckboxConfirmBaseToolDefinition = createComputerUseBaseToolDefinition<
  InputCheckboxConfirmHandlerInput,
  InputCheckboxConfirmOutput
>({
  toolId: inputCheckboxConfirmDescriptor.toolId,
  title: "Computer Use Input Checkbox Confirm",
  description: "Confirm a focused checkbox target through governed runtime computer-use keyboard support.",
  summary: "Use computeruse.inputCheckboxConfirm to ask runtime to confirm a checkbox state with Space or Enter.",
  storageGroup: "keyboardEmulation",
  riskLevel: "risky",
  permissionHints: ["device:keyboard", "keyboard:write", "ui:focus"],
  dependencies: inputCheckboxConfirmDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.inputCheckboxConfirm.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          label: { type: "string" },
          selectorHint: { type: "string" },
          expectedState: { type: "string", enum: ["checked", "unchecked"] },
          currentState: { type: "string", enum: ["checked", "unchecked"] },
          confirmationKey: { type: "string", enum: ["space", "enter"] },
        },
      },
      label: { type: "string" },
      selectorHint: { type: "string" },
      expectedState: { type: "string", enum: ["checked", "unchecked"] },
      currentState: { type: "string", enum: ["checked", "unchecked"] },
      confirmationKey: { type: "string", enum: ["space", "enter"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.inputCheckboxConfirm.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.inputCheckboxConfirm" },
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

export const inputCheckboxConfirmHandler: BaseToolHandler<
  InputCheckboxConfirmHandlerInput,
  InputCheckboxConfirmOutput
> = createComputerUseCoreHandler(inputCheckboxConfirmBaseToolDefinition, async (request) => {
  const selection = selectInputCheckboxConfirmPractice({
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

  return executeInputCheckboxConfirmCore({
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

export { executeInputCheckboxConfirmCore, inputCheckboxConfirmDescriptor, planInputCheckboxConfirm };

export type {
  InputCheckboxConfirmAuditEvent,
  InputCheckboxConfirmBoundary,
  InputCheckboxConfirmContext,
  InputCheckboxConfirmError,
  InputCheckboxConfirmErrorCode,
  InputCheckboxConfirmGate,
  InputCheckboxConfirmKey,
  InputCheckboxConfirmOutput,
  InputCheckboxConfirmProvider,
  InputCheckboxConfirmProviderRequest,
  InputCheckboxConfirmProviderResult,
  InputCheckboxConfirmRequest,
  InputCheckboxConfirmResult,
  InputCheckboxConfirmState,
  InputCheckboxConfirmTarget,
} from "./core.js";
