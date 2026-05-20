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
import { anthropicMouseMovePractice } from "./anthropic.js";
import { deepmindMouseMovePractice } from "./deepmind.js";
import {
  mouseMoveDependencyDeclarations,
  type MouseMoveDependencies,
  type MouseMovePracticeProviderName,
  type MouseMoveProviderPractice,
} from "./dependencies.js";
import { openaiMouseMovePractice } from "./openai.js";
import {
  executeMouseMove as executeMouseMoveCore,
  mouseMoveDescriptor,
  planMouseMove,
  type MouseMoveOutput,
  type MouseMoveProvider,
  type MouseMoveRequest,
} from "./core.js";

export type MouseMoveBestPracticeRequest = MouseMoveRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MouseMovePracticeProviderName;
};

export type MouseMoveHandlerInput = Omit<MouseMoveBestPracticeRequest, "executor">;

export type MouseMovePracticeSelection = {
  providerName: MouseMovePracticeProviderName;
  practice: MouseMoveProviderPractice;
  provider?: MouseMoveProvider;
};

export const mouseMoveProviderPractices = [
  anthropicMouseMovePractice,
  openaiMouseMovePractice,
  deepmindMouseMovePractice,
] as const;

export const mouseMoveBestPracticeDescriptor = {
  toolId: "computeruse.mouseMove",
  bestPractice: "storage-owned-runtime-computeruse-pointer-action-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mouseMoveDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MouseMoveProviderPractice = {
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

export function selectMouseMovePractice(
  dependencies: MouseMoveDependencies & {
    preferredProvider?: MouseMovePracticeProviderName;
  } = {},
): MouseMovePracticeSelection {
  return selectComputerUseProviderPractice(
    mouseMoveProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MouseMovePracticeSelection;
}

export async function executeMouseMove(request: MouseMoveBestPracticeRequest = {}): ReturnType<typeof executeMouseMoveCore> {
  const selection = selectMouseMovePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMouseMoveCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const mouseMoveBaseToolDefinition = createComputerUseBaseToolDefinition<
  MouseMoveHandlerInput,
  MouseMoveOutput
>({
  toolId: mouseMoveDescriptor.toolId,
  title: "Computer Use Mouse Move",
  description: "Move the pointer through governed runtime computer-use support.",
  summary: "Use computeruse.mouseMove to request a runtime-owned pointer movement action.",
  storageGroup: "mouseEmulation",
  riskLevel: "risky",
  permissionHints: ["device:pointer", "pointer:write", "ui:action"],
  dependencies: mouseMoveDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.mouseMove.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          displayId: { type: "string" },
          windowId: { type: "string" },
          durationMs: { type: "integer", minimum: 0, maximum: mouseMoveDescriptor.maxDurationMs },
        },
      },
      x: { type: "number" },
      y: { type: "number" },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      durationMs: { type: "integer", minimum: 0, maximum: mouseMoveDescriptor.maxDurationMs },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.mouseMove.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.mouseMove" },
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

export const mouseMoveHandler: BaseToolHandler<MouseMoveHandlerInput, MouseMoveOutput> =
  createComputerUseCoreHandler(mouseMoveBaseToolDefinition, async (request) => {
    const selection = selectMouseMovePractice({
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

    return executeMouseMoveCore({
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

export { executeMouseMoveCore, mouseMoveDescriptor, planMouseMove };

export type {
  MouseMoveAuditEvent,
  MouseMoveBoundary,
  MouseMoveContext,
  MouseMoveCoordinateSpace,
  MouseMoveError,
  MouseMoveErrorCode,
  MouseMoveGate,
  MouseMoveOutput,
  MouseMovePoint,
  MouseMoveProvider,
  MouseMoveProviderRequest,
  MouseMoveProviderResult,
  MouseMoveRequest,
  MouseMoveResult,
  MouseMoveTarget,
} from "./core.js";
