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
import { anthropicWindowScreenRecordingPractice } from "./anthropic.js";
import { deepmindWindowScreenRecordingPractice } from "./deepmind.js";
import {
  type WindowScreenRecordingDependencies,
  type WindowScreenRecordingPracticeProviderName,
  type WindowScreenRecordingProviderPractice,
  windowScreenRecordingDependencyDeclarations,
} from "./dependencies.js";
import { openaiWindowScreenRecordingPractice } from "./openai.js";
import {
  executeWindowScreenRecording as executeWindowScreenRecordingCore,
  planWindowScreenRecording,
  type WindowScreenRecordingOutput,
  type WindowScreenRecordingProvider,
  type WindowScreenRecordingRequest,
  windowScreenRecordingDescriptor,
} from "./core.js";

export type WindowScreenRecordingBestPracticeRequest = WindowScreenRecordingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: WindowScreenRecordingPracticeProviderName;
};

export type WindowScreenRecordingHandlerInput = Omit<WindowScreenRecordingBestPracticeRequest, "executor">;

export type WindowScreenRecordingPracticeSelection = {
  providerName: WindowScreenRecordingPracticeProviderName;
  practice: WindowScreenRecordingProviderPractice;
  provider?: WindowScreenRecordingProvider;
};

export const windowScreenRecordingProviderPractices = [
  anthropicWindowScreenRecordingPractice,
  openaiWindowScreenRecordingPractice,
  deepmindWindowScreenRecordingPractice,
] as const;

export const windowScreenRecordingBestPracticeDescriptor = {
  toolId: "computeruse.windowScreenRecording",
  bestPractice: "storage-owned-runtime-computeruse-window-recording-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: windowScreenRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: WindowScreenRecordingProviderPractice = {
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

export function selectWindowScreenRecordingPractice(
  dependencies: WindowScreenRecordingDependencies & {
    preferredProvider?: WindowScreenRecordingPracticeProviderName;
  } = {},
): WindowScreenRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    windowScreenRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as WindowScreenRecordingPracticeSelection;
}

export async function executeWindowScreenRecording(
  request: WindowScreenRecordingBestPracticeRequest = {},
): ReturnType<typeof executeWindowScreenRecordingCore> {
  const selection = selectWindowScreenRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeWindowScreenRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const windowScreenRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  WindowScreenRecordingHandlerInput,
  WindowScreenRecordingOutput
>({
  toolId: windowScreenRecordingDescriptor.toolId,
  title: "Computer Use Window Screen Recording",
  description: "Start a window-scoped screen recording session through governed runtime computer-use support.",
  summary: "Use computeruse.windowScreenRecording to request a runtime-owned window recording session handle.",
  storageGroup: "screenRecording",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:record", "display:capture", "window:inspect"],
  dependencies: windowScreenRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.windowScreenRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          windowId: { type: "string" },
          titleHint: { type: "string" },
          maxDurationMs: { type: "integer", minimum: 1, maximum: windowScreenRecordingDescriptor.maxDurationMs },
          frameRate: { type: "integer", minimum: 1, maximum: windowScreenRecordingDescriptor.maxFrameRate },
          includeCursor: { type: "boolean" },
          outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
          destinationHint: { type: "string" },
        },
      },
      windowId: { type: "string" },
      titleHint: { type: "string" },
      maxDurationMs: { type: "integer", minimum: 1, maximum: windowScreenRecordingDescriptor.maxDurationMs },
      frameRate: { type: "integer", minimum: 1, maximum: windowScreenRecordingDescriptor.maxFrameRate },
      includeCursor: { type: "boolean" },
      outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
      destinationHint: { type: "string" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.windowScreenRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.windowScreenRecording" },
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

export const windowScreenRecordingHandler: BaseToolHandler<WindowScreenRecordingHandlerInput, WindowScreenRecordingOutput> =
  createComputerUseCoreHandler(windowScreenRecordingBaseToolDefinition, async (request) => {
    const selection = selectWindowScreenRecordingPractice({
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

    return executeWindowScreenRecordingCore({
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

export { executeWindowScreenRecordingCore, planWindowScreenRecording, windowScreenRecordingDescriptor };

export type {
  WindowScreenRecordingAuditEvent,
  WindowScreenRecordingBoundary,
  WindowScreenRecordingContext,
  WindowScreenRecordingError,
  WindowScreenRecordingErrorCode,
  WindowScreenRecordingGate,
  WindowScreenRecordingOutput,
  WindowScreenRecordingOutputFormat,
  WindowScreenRecordingProvider,
  WindowScreenRecordingProviderRequest,
  WindowScreenRecordingProviderResult,
  WindowScreenRecordingRequest,
  WindowScreenRecordingResult,
  WindowScreenRecordingTarget,
} from "./core.js";
