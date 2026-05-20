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
import { anthropicMouseScrollPractice } from "./anthropic.js";
import { deepmindMouseScrollPractice } from "./deepmind.js";
import {
  mouseScrollDependencyDeclarations,
  type MouseScrollDependencies,
  type MouseScrollPracticeProviderName,
  type MouseScrollProviderPractice,
} from "./dependencies.js";
import { openaiMouseScrollPractice } from "./openai.js";
import {
  executeMouseScroll as executeMouseScrollCore,
  mouseScrollDescriptor,
  planMouseScroll,
  type MouseScrollOutput,
  type MouseScrollProvider,
  type MouseScrollRequest,
} from "./core.js";

export type MouseScrollBestPracticeRequest = MouseScrollRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MouseScrollPracticeProviderName;
};

export type MouseScrollHandlerInput = Omit<MouseScrollBestPracticeRequest, "executor">;

export type MouseScrollPracticeSelection = {
  providerName: MouseScrollPracticeProviderName;
  practice: MouseScrollProviderPractice;
  provider?: MouseScrollProvider;
};

export const mouseScrollProviderPractices = [
  anthropicMouseScrollPractice,
  openaiMouseScrollPractice,
  deepmindMouseScrollPractice,
] as const;

export const mouseScrollBestPracticeDescriptor = {
  toolId: "computeruse.mouseScroll",
  bestPractice: "storage-owned-runtime-computeruse-pointer-scroll-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mouseScrollDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MouseScrollProviderPractice = {
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

export function selectMouseScrollPractice(
  dependencies: MouseScrollDependencies & {
    preferredProvider?: MouseScrollPracticeProviderName;
  } = {},
): MouseScrollPracticeSelection {
  return selectComputerUseProviderPractice(
    mouseScrollProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MouseScrollPracticeSelection;
}

export async function executeMouseScroll(request: MouseScrollBestPracticeRequest = {}): ReturnType<typeof executeMouseScrollCore> {
  const selection = selectMouseScrollPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMouseScrollCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const mouseScrollBaseToolDefinition = createComputerUseBaseToolDefinition<
  MouseScrollHandlerInput,
  MouseScrollOutput
>({
  toolId: mouseScrollDescriptor.toolId,
  title: "Computer Use Mouse Scroll",
  description: "Scroll through governed runtime computer-use pointer support.",
  summary: "Use computeruse.mouseScroll to request a runtime-owned pointer wheel scroll action.",
  storageGroup: "mouseEmulation",
  riskLevel: "risky",
  permissionHints: ["device:pointer", "pointer:write", "ui:action"],
  dependencies: mouseScrollDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.mouseScroll.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          deltaX: { type: "number" },
          deltaY: { type: "number" },
          at: {
            type: "object",
            additionalProperties: true,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          displayId: { type: "string" },
          windowId: { type: "string" },
          durationMs: { type: "integer", minimum: 0, maximum: mouseScrollDescriptor.maxDurationMs },
        },
      },
      deltaX: { type: "number" },
      deltaY: { type: "number" },
      at: { type: "object", additionalProperties: true },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      durationMs: { type: "integer", minimum: 0, maximum: mouseScrollDescriptor.maxDurationMs },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.mouseScroll.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.mouseScroll" },
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

export const mouseScrollHandler: BaseToolHandler<MouseScrollHandlerInput, MouseScrollOutput> =
  createComputerUseCoreHandler(mouseScrollBaseToolDefinition, async (request) => {
    const selection = selectMouseScrollPractice({
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

    return executeMouseScrollCore({
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

export { executeMouseScrollCore, mouseScrollDescriptor, planMouseScroll };

export type {
  MouseScrollAuditEvent,
  MouseScrollBoundary,
  MouseScrollContext,
  MouseScrollCoordinateSpace,
  MouseScrollError,
  MouseScrollErrorCode,
  MouseScrollGate,
  MouseScrollOutput,
  MouseScrollPoint,
  MouseScrollProvider,
  MouseScrollProviderRequest,
  MouseScrollProviderResult,
  MouseScrollRequest,
  MouseScrollResult,
  MouseScrollTarget,
} from "./core.js";
