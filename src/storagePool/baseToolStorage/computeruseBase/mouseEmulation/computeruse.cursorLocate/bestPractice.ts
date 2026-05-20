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
import { anthropicCursorLocatePractice } from "./anthropic.js";
import { deepmindCursorLocatePractice } from "./deepmind.js";
import {
  cursorLocateDependencyDeclarations,
  type CursorLocateDependencies,
  type CursorLocatePracticeProviderName,
  type CursorLocateProviderPractice,
} from "./dependencies.js";
import { openaiCursorLocatePractice } from "./openai.js";
import {
  cursorLocateDescriptor,
  executeCursorLocate as executeCursorLocateCore,
  planCursorLocate,
  type CursorLocateOutput,
  type CursorLocateProvider,
  type CursorLocateRequest,
} from "./core.js";

export type CursorLocateBestPracticeRequest = CursorLocateRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CursorLocatePracticeProviderName;
};

export type CursorLocateHandlerInput = Omit<CursorLocateBestPracticeRequest, "executor">;

export type CursorLocatePracticeSelection = {
  providerName: CursorLocatePracticeProviderName;
  practice: CursorLocateProviderPractice;
  provider?: CursorLocateProvider;
};

export const cursorLocateProviderPractices = [
  anthropicCursorLocatePractice,
  openaiCursorLocatePractice,
  deepmindCursorLocatePractice,
] as const;

export const cursorLocateBestPracticeDescriptor = {
  toolId: "computeruse.cursorLocate",
  bestPractice: "storage-owned-runtime-computeruse-cursor-locate-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cursorLocateDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CursorLocateProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse cursor provider is available; dry-run remains available."],
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

export function selectCursorLocatePractice(
  dependencies: CursorLocateDependencies & {
    preferredProvider?: CursorLocatePracticeProviderName;
  } = {},
): CursorLocatePracticeSelection {
  return selectComputerUseProviderPractice(
    cursorLocateProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CursorLocatePracticeSelection;
}

export async function executeCursorLocate(request: CursorLocateBestPracticeRequest = {}): ReturnType<typeof executeCursorLocateCore> {
  const selection = selectCursorLocatePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCursorLocateCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cursorLocateBaseToolDefinition = createComputerUseBaseToolDefinition<
  CursorLocateHandlerInput,
  CursorLocateOutput
>({
  toolId: cursorLocateDescriptor.toolId,
  title: "Computer Use Cursor Locate",
  description: "Locate the current cursor through governed runtime computer-use support.",
  summary: "Use computeruse.cursorLocate to request a runtime-owned cursor position observation.",
  storageGroup: "mouseEmulation",
  riskLevel: "normal",
  permissionHints: ["device:pointer", "pointer:read", "ui:observe"],
  dependencies: cursorLocateDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cursorLocate.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          displayId: { type: "string" },
        },
      },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      displayId: { type: "string" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cursorLocate.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "observationEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cursorLocate" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      observationEnvelope: { type: "object" },
      position: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cursorLocateHandler: BaseToolHandler<CursorLocateHandlerInput, CursorLocateOutput> =
  createComputerUseCoreHandler(cursorLocateBaseToolDefinition, async (request) => {
    const selection = selectCursorLocatePractice({
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

    return executeCursorLocateCore({
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

export { cursorLocateDescriptor, executeCursorLocateCore, planCursorLocate };

export type {
  CursorLocateAuditEvent,
  CursorLocateBoundary,
  CursorLocateContext,
  CursorLocateCoordinateSpace,
  CursorLocateError,
  CursorLocateErrorCode,
  CursorLocateGate,
  CursorLocateOutput,
  CursorLocateProvider,
  CursorLocateProviderRequest,
  CursorLocateProviderResult,
  CursorLocateRequest,
  CursorLocateResult,
  CursorLocateTarget,
  CursorPosition,
} from "./core.js";
