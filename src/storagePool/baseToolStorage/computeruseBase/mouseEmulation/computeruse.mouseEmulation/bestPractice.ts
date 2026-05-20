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
import { anthropicMouseEmulationPractice } from "./anthropic.js";
import { deepmindMouseEmulationPractice } from "./deepmind.js";
import {
  mouseEmulationDependencyDeclarations,
  type MouseEmulationDependencies,
  type MouseEmulationPracticeProviderName,
  type MouseEmulationProviderPractice,
} from "./dependencies.js";
import { openaiMouseEmulationPractice } from "./openai.js";
import {
  executeMouseEmulation as executeMouseEmulationCore,
  mouseEmulationDescriptor,
  planMouseEmulation,
  type MouseEmulationOutput,
  type MouseEmulationProvider,
  type MouseEmulationRequest,
} from "./core.js";

export type MouseEmulationBestPracticeRequest = MouseEmulationRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MouseEmulationPracticeProviderName;
};

export type MouseEmulationHandlerInput = Omit<MouseEmulationBestPracticeRequest, "executor">;

export type MouseEmulationPracticeSelection = {
  providerName: MouseEmulationPracticeProviderName;
  practice: MouseEmulationProviderPractice;
  provider?: MouseEmulationProvider;
};

export const mouseEmulationProviderPractices = [
  anthropicMouseEmulationPractice,
  openaiMouseEmulationPractice,
  deepmindMouseEmulationPractice,
] as const;

export const mouseEmulationBestPracticeDescriptor = {
  toolId: "computeruse.mouseEmulation",
  bestPractice: "storage-owned-runtime-computeruse-pointer-sequence-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mouseEmulationDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MouseEmulationProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse pointer sequence provider is available; dry-run remains available."],
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

export function selectMouseEmulationPractice(
  dependencies: MouseEmulationDependencies & {
    preferredProvider?: MouseEmulationPracticeProviderName;
  } = {},
): MouseEmulationPracticeSelection {
  return selectComputerUseProviderPractice(
    mouseEmulationProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MouseEmulationPracticeSelection;
}

export async function executeMouseEmulation(
  request: MouseEmulationBestPracticeRequest = {},
): ReturnType<typeof executeMouseEmulationCore> {
  const selection = selectMouseEmulationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMouseEmulationCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const mouseEmulationBaseToolDefinition = createComputerUseBaseToolDefinition<
  MouseEmulationHandlerInput,
  MouseEmulationOutput
>({
  toolId: mouseEmulationDescriptor.toolId,
  title: "Computer Use Mouse Emulation",
  description: "Run a governed sequence of cursor observation and pointer actions through runtime computer-use support.",
  summary: "Use computeruse.mouseEmulation to request a runtime-owned mouse operation sequence.",
  storageGroup: "mouseEmulation",
  riskLevel: "risky",
  permissionHints: ["device:pointer", "pointer:read", "pointer:write", "ui:action"],
  dependencies: mouseEmulationDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.mouseEmulation.input", {
    type: "object",
    additionalProperties: true,
    required: ["steps", "purpose"],
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            kind: { type: "string", enum: ["locate", "move", "click"] },
            target: { type: "object", additionalProperties: true },
            at: { type: "object", additionalProperties: true },
            button: { type: "string", enum: ["left", "right", "middle", "back", "forward"] },
            clickCount: { type: "integer", minimum: 1, maximum: 3 },
            coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
            displayId: { type: "string" },
            windowId: { type: "string" },
            durationMs: { type: "integer", minimum: 0 },
          },
        },
      },
      maxSteps: { type: "integer", minimum: 1 },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.mouseEmulation.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "operation", "purpose", "steps", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "sequenceEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.mouseEmulation" },
      operation: { const: "simulate-mouse-operations" },
      purpose: { type: "string" },
      steps: { type: "array" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      sequenceEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const mouseEmulationHandler: BaseToolHandler<MouseEmulationHandlerInput, MouseEmulationOutput> =
  createComputerUseCoreHandler(mouseEmulationBaseToolDefinition, async (request) => {
    const selection = selectMouseEmulationPractice({
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

    return executeMouseEmulationCore({
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

export { executeMouseEmulationCore, mouseEmulationDescriptor, planMouseEmulation };

export type {
  MouseEmulationAuditEvent,
  MouseEmulationBoundary,
  MouseEmulationButton,
  MouseEmulationClickStep,
  MouseEmulationContext,
  MouseEmulationCoordinateSpace,
  MouseEmulationError,
  MouseEmulationErrorCode,
  MouseEmulationGate,
  MouseEmulationLocateStep,
  MouseEmulationMoveStep,
  MouseEmulationOutput,
  MouseEmulationPoint,
  MouseEmulationProvider,
  MouseEmulationProviderRequest,
  MouseEmulationProviderResult,
  MouseEmulationProviderStepResult,
  MouseEmulationRequest,
  MouseEmulationResult,
  MouseEmulationStep,
  MouseEmulationStepEnvelope,
} from "./core.js";
