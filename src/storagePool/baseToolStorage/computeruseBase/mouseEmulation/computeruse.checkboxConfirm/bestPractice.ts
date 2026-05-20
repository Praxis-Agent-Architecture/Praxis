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
import { anthropicCheckboxConfirmPractice } from "./anthropic.js";
import { deepmindCheckboxConfirmPractice } from "./deepmind.js";
import {
  checkboxConfirmDependencyDeclarations,
  type CheckboxConfirmDependencies,
  type CheckboxConfirmPracticeProviderName,
  type CheckboxConfirmProviderPractice,
} from "./dependencies.js";
import { openaiCheckboxConfirmPractice } from "./openai.js";
import {
  checkboxConfirmDescriptor,
  executeCheckboxConfirm as executeCheckboxConfirmCore,
  planCheckboxConfirm,
  type CheckboxConfirmOutput,
  type CheckboxConfirmProvider,
  type CheckboxConfirmRequest,
} from "./core.js";

export type CheckboxConfirmBestPracticeRequest = CheckboxConfirmRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CheckboxConfirmPracticeProviderName;
};

export type CheckboxConfirmHandlerInput = Omit<CheckboxConfirmBestPracticeRequest, "executor">;

export type CheckboxConfirmPracticeSelection = {
  providerName: CheckboxConfirmPracticeProviderName;
  practice: CheckboxConfirmProviderPractice;
  provider?: CheckboxConfirmProvider;
};

export const checkboxConfirmProviderPractices = [
  anthropicCheckboxConfirmPractice,
  openaiCheckboxConfirmPractice,
  deepmindCheckboxConfirmPractice,
] as const;

export const checkboxConfirmBestPracticeDescriptor = {
  toolId: "computeruse.checkboxConfirm",
  bestPractice: "storage-owned-runtime-computeruse-checkbox-confirm-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: checkboxConfirmDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CheckboxConfirmProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse pointer provider is available; dry-run remains available."],
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

export function selectCheckboxConfirmPractice(
  dependencies: CheckboxConfirmDependencies & {
    preferredProvider?: CheckboxConfirmPracticeProviderName;
  } = {},
): CheckboxConfirmPracticeSelection {
  return selectComputerUseProviderPractice(
    checkboxConfirmProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CheckboxConfirmPracticeSelection;
}

export async function executeCheckboxConfirm(request: CheckboxConfirmBestPracticeRequest = {}): ReturnType<typeof executeCheckboxConfirmCore> {
  const selection = selectCheckboxConfirmPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCheckboxConfirmCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const checkboxConfirmBaseToolDefinition = createComputerUseBaseToolDefinition<
  CheckboxConfirmHandlerInput,
  CheckboxConfirmOutput
>({
  toolId: checkboxConfirmDescriptor.toolId,
  title: "Computer Use Checkbox Confirm",
  description: "Confirm a checkbox state through governed runtime computer-use pointer support.",
  summary: "Use computeruse.checkboxConfirm to request a runtime-owned checkbox confirmation pointer action.",
  storageGroup: "mouseEmulation",
  riskLevel: "risky",
  permissionHints: ["device:pointer", "pointer:write", "ui:action"],
  dependencies: checkboxConfirmDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.checkboxConfirm.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          label: { type: "string" },
          selectorHint: { type: "string" },
          point: {
            type: "object",
            additionalProperties: true,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
          expectedState: { type: "string", enum: ["checked", "unchecked"] },
          currentState: { type: "string", enum: ["checked", "unchecked"] },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          displayId: { type: "string" },
          windowId: { type: "string" },
          clickMode: { type: "string", enum: ["single-click", "double-click"] },
        },
      },
      label: { type: "string" },
      selectorHint: { type: "string" },
      point: { type: "object", additionalProperties: true },
      expectedState: { type: "string", enum: ["checked", "unchecked"] },
      currentState: { type: "string", enum: ["checked", "unchecked"] },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      clickMode: { type: "string", enum: ["single-click", "double-click"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.checkboxConfirm.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.checkboxConfirm" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      actionEnvelope: { type: "object" },
      finalState: { type: "string", enum: ["checked", "unchecked"] },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const checkboxConfirmHandler: BaseToolHandler<CheckboxConfirmHandlerInput, CheckboxConfirmOutput> =
  createComputerUseCoreHandler(checkboxConfirmBaseToolDefinition, async (request) => {
    const selection = selectCheckboxConfirmPractice({
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

    return executeCheckboxConfirmCore({
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

export { checkboxConfirmDescriptor, executeCheckboxConfirmCore, planCheckboxConfirm };

export type {
  CheckboxConfirmAuditEvent,
  CheckboxConfirmBoundary,
  CheckboxConfirmClickMode,
  CheckboxConfirmContext,
  CheckboxConfirmCoordinateSpace,
  CheckboxConfirmError,
  CheckboxConfirmErrorCode,
  CheckboxConfirmGate,
  CheckboxConfirmOutput,
  CheckboxConfirmPoint,
  CheckboxConfirmProvider,
  CheckboxConfirmProviderRequest,
  CheckboxConfirmProviderResult,
  CheckboxConfirmRequest,
  CheckboxConfirmResult,
  CheckboxConfirmState,
  CheckboxConfirmTarget,
} from "./core.js";
