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
import { anthropicMouseClickPractice } from "./anthropic.js";
import { deepmindMouseClickPractice } from "./deepmind.js";
import {
  mouseClickDependencyDeclarations,
  type MouseClickDependencies,
  type MouseClickPracticeProviderName,
  type MouseClickProviderPractice,
} from "./dependencies.js";
import { openaiMouseClickPractice } from "./openai.js";
import {
  executeMouseClick as executeMouseClickCore,
  mouseClickDescriptor,
  planMouseClick,
  type MouseClickOutput,
  type MouseClickProvider,
  type MouseClickRequest,
} from "./core.js";

export type MouseClickBestPracticeRequest = MouseClickRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MouseClickPracticeProviderName;
};

export type MouseClickHandlerInput = Omit<MouseClickBestPracticeRequest, "executor">;

export type MouseClickPracticeSelection = {
  providerName: MouseClickPracticeProviderName;
  practice: MouseClickProviderPractice;
  provider?: MouseClickProvider;
};

export const mouseClickProviderPractices = [
  anthropicMouseClickPractice,
  openaiMouseClickPractice,
  deepmindMouseClickPractice,
] as const;

export const mouseClickBestPracticeDescriptor = {
  toolId: "computeruse.mouseClick",
  bestPractice: "storage-owned-runtime-computeruse-pointer-action-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mouseClickDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MouseClickProviderPractice = {
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

export function selectMouseClickPractice(
  dependencies: MouseClickDependencies & {
    preferredProvider?: MouseClickPracticeProviderName;
  } = {},
): MouseClickPracticeSelection {
  return selectComputerUseProviderPractice(
    mouseClickProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MouseClickPracticeSelection;
}

export async function executeMouseClick(request: MouseClickBestPracticeRequest = {}): ReturnType<typeof executeMouseClickCore> {
  const selection = selectMouseClickPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMouseClickCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const mouseClickBaseToolDefinition = createComputerUseBaseToolDefinition<
  MouseClickHandlerInput,
  MouseClickOutput
>({
  toolId: mouseClickDescriptor.toolId,
  title: "Computer Use Mouse Click",
  description: "Click the pointer through governed runtime computer-use support.",
  summary: "Use computeruse.mouseClick to request a runtime-owned pointer click action.",
  storageGroup: "mouseEmulation",
  riskLevel: "risky",
  permissionHints: ["device:pointer", "pointer:write", "ui:action"],
  dependencies: mouseClickDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.mouseClick.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          button: { type: "string", enum: ["left", "right", "middle", "back", "forward"] },
          clickCount: { type: "integer", minimum: 1, maximum: 3 },
          at: { type: "object", additionalProperties: true },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          displayId: { type: "string" },
          windowId: { type: "string" },
        },
      },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.mouseClick.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "actionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.mouseClick" },
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

export const mouseClickHandler: BaseToolHandler<MouseClickHandlerInput, MouseClickOutput> =
  createComputerUseCoreHandler(mouseClickBaseToolDefinition, async (request) => {
    const selection = selectMouseClickPractice({
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

    return executeMouseClickCore({
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

export { executeMouseClickCore, mouseClickDescriptor, planMouseClick };

export type {
  MouseClickAuditEvent,
  MouseClickBoundary,
  MouseClickButton,
  MouseClickContext,
  MouseClickCoordinateSpace,
  MouseClickError,
  MouseClickErrorCode,
  MouseClickGate,
  MouseClickOutput,
  MouseClickPoint,
  MouseClickProvider,
  MouseClickProviderRequest,
  MouseClickProviderResult,
  MouseClickRequest,
  MouseClickResult,
  MouseClickTarget,
} from "./core.js";
