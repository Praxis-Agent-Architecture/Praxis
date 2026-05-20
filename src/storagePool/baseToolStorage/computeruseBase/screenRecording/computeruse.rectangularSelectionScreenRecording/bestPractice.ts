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
import { anthropicRectangularSelectionScreenRecordingPractice } from "./anthropic.js";
import { deepmindRectangularSelectionScreenRecordingPractice } from "./deepmind.js";
import {
  type RectangularSelectionScreenRecordingDependencies,
  type RectangularSelectionScreenRecordingPracticeProviderName,
  type RectangularSelectionScreenRecordingProviderPractice,
  rectangularSelectionScreenRecordingDependencyDeclarations,
} from "./dependencies.js";
import { openaiRectangularSelectionScreenRecordingPractice } from "./openai.js";
import {
  executeRectangularSelectionScreenRecording as executeRectangularSelectionScreenRecordingCore,
  planRectangularSelectionScreenRecording,
  type RectangularSelectionScreenRecordingOutput,
  type RectangularSelectionScreenRecordingProvider,
  type RectangularSelectionScreenRecordingRequest,
  rectangularSelectionScreenRecordingDescriptor,
} from "./core.js";

export type RectangularSelectionScreenRecordingBestPracticeRequest = RectangularSelectionScreenRecordingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: RectangularSelectionScreenRecordingPracticeProviderName;
};

export type RectangularSelectionScreenRecordingHandlerInput = Omit<RectangularSelectionScreenRecordingBestPracticeRequest, "executor">;

export type RectangularSelectionScreenRecordingPracticeSelection = {
  providerName: RectangularSelectionScreenRecordingPracticeProviderName;
  practice: RectangularSelectionScreenRecordingProviderPractice;
  provider?: RectangularSelectionScreenRecordingProvider;
};

export const rectangularSelectionScreenRecordingProviderPractices = [
  anthropicRectangularSelectionScreenRecordingPractice,
  openaiRectangularSelectionScreenRecordingPractice,
  deepmindRectangularSelectionScreenRecordingPractice,
] as const;

export const rectangularSelectionScreenRecordingBestPracticeDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenRecording",
  bestPractice: "storage-owned-runtime-computeruse-region-recording-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: rectangularSelectionScreenRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: RectangularSelectionScreenRecordingProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse recording provider is available; dry-run remains available."],
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

export function selectRectangularSelectionScreenRecordingPractice(
  dependencies: RectangularSelectionScreenRecordingDependencies & {
    preferredProvider?: RectangularSelectionScreenRecordingPracticeProviderName;
  } = {},
): RectangularSelectionScreenRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    rectangularSelectionScreenRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as RectangularSelectionScreenRecordingPracticeSelection;
}

export async function executeRectangularSelectionScreenRecording(
  request: RectangularSelectionScreenRecordingBestPracticeRequest = {},
): ReturnType<typeof executeRectangularSelectionScreenRecordingCore> {
  const selection = selectRectangularSelectionScreenRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeRectangularSelectionScreenRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const rectangularSelectionScreenRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  RectangularSelectionScreenRecordingHandlerInput,
  RectangularSelectionScreenRecordingOutput
>({
  toolId: rectangularSelectionScreenRecordingDescriptor.toolId,
  title: "Computer Use Rectangular Selection Screen Recording",
  description: "Start a rectangular-region screen recording session through governed runtime computer-use support.",
  summary: "Use computeruse.rectangularSelectionScreenRecording to request a runtime-owned rectangular region recording session handle.",
  storageGroup: "screenRecording",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:record", "display:capture", "ui:selection"],
  dependencies: rectangularSelectionScreenRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.rectangularSelectionScreenRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          rect: {
            type: "object",
            additionalProperties: true,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
            },
          },
          region: {
            type: "object",
            additionalProperties: true,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
            },
          },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          maxDurationMs: { type: "integer", minimum: 1, maximum: rectangularSelectionScreenRecordingDescriptor.maxDurationMs },
          frameRate: { type: "integer", minimum: 1, maximum: rectangularSelectionScreenRecordingDescriptor.maxFrameRate },
          includeCursor: { type: "boolean" },
          includeAudio: { type: "boolean" },
          outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
          destinationHint: { type: "string" },
        },
      },
      displayId: { type: "string" },
      rect: { type: "object", additionalProperties: true },
      region: { type: "object", additionalProperties: true },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      maxDurationMs: { type: "integer", minimum: 1, maximum: rectangularSelectionScreenRecordingDescriptor.maxDurationMs },
      frameRate: { type: "integer", minimum: 1, maximum: rectangularSelectionScreenRecordingDescriptor.maxFrameRate },
      includeCursor: { type: "boolean" },
      includeAudio: { type: "boolean" },
      outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
      destinationHint: { type: "string" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.rectangularSelectionScreenRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.rectangularSelectionScreenRecording" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      recordingEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const rectangularSelectionScreenRecordingHandler: BaseToolHandler<RectangularSelectionScreenRecordingHandlerInput, RectangularSelectionScreenRecordingOutput> =
  createComputerUseCoreHandler(rectangularSelectionScreenRecordingBaseToolDefinition, async (request) => {
    const selection = selectRectangularSelectionScreenRecordingPractice({
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

    return executeRectangularSelectionScreenRecordingCore({
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

export { executeRectangularSelectionScreenRecordingCore, planRectangularSelectionScreenRecording, rectangularSelectionScreenRecordingDescriptor };

export type {
  RectangularSelectionScreenRecordingAuditEvent,
  RectangularSelectionScreenRecordingBoundary,
  RectangularSelectionScreenRecordingContext,
  RectangularSelectionScreenRecordingCoordinateSpace,
  RectangularSelectionScreenRecordingError,
  RectangularSelectionScreenRecordingErrorCode,
  RectangularSelectionScreenRecordingGate,
  RectangularSelectionScreenRecordingOutput,
  RectangularSelectionScreenRecordingOutputFormat,
  RectangularSelectionScreenRecordingProvider,
  RectangularSelectionScreenRecordingProviderRequest,
  RectangularSelectionScreenRecordingProviderResult,
  RectangularSelectionScreenRecordingRect,
  RectangularSelectionScreenRecordingRequest,
  RectangularSelectionScreenRecordingResult,
  RectangularSelectionScreenRecordingTarget,
} from "./core.js";
