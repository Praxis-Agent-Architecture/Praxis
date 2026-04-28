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
import { anthropicFullscreenScreenRecordingPractice } from "./anthropic.js";
import { deepmindFullscreenScreenRecordingPractice } from "./deepmind.js";
import {
  fullscreenScreenRecordingDependencyDeclarations,
  type FullscreenScreenRecordingDependencies,
  type FullscreenScreenRecordingPracticeProviderName,
  type FullscreenScreenRecordingProviderPractice,
} from "./dependencies.js";
import { openaiFullscreenScreenRecordingPractice } from "./openai.js";
import {
  executeFullscreenScreenRecording as executeFullscreenScreenRecordingCore,
  fullscreenScreenRecordingDescriptor,
  planFullscreenScreenRecording,
  type FullscreenScreenRecordingOutput,
  type FullscreenScreenRecordingProvider,
  type FullscreenScreenRecordingRequest,
} from "./core.js";

export type FullscreenScreenRecordingBestPracticeRequest = FullscreenScreenRecordingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: FullscreenScreenRecordingPracticeProviderName;
};

export type FullscreenScreenRecordingHandlerInput = Omit<FullscreenScreenRecordingBestPracticeRequest, "executor">;

export type FullscreenScreenRecordingPracticeSelection = {
  providerName: FullscreenScreenRecordingPracticeProviderName;
  practice: FullscreenScreenRecordingProviderPractice;
  provider?: FullscreenScreenRecordingProvider;
};

export const fullscreenScreenRecordingProviderPractices = [
  anthropicFullscreenScreenRecordingPractice,
  openaiFullscreenScreenRecordingPractice,
  deepmindFullscreenScreenRecordingPractice,
] as const;

export const fullscreenScreenRecordingBestPracticeDescriptor = {
  toolId: "computeruse.fullscreenScreenRecording",
  bestPractice: "storage-owned-runtime-computeruse-recording-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: fullscreenScreenRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: FullscreenScreenRecordingProviderPractice = {
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

export function selectFullscreenScreenRecordingPractice(
  dependencies: FullscreenScreenRecordingDependencies & {
    preferredProvider?: FullscreenScreenRecordingPracticeProviderName;
  } = {},
): FullscreenScreenRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    fullscreenScreenRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as FullscreenScreenRecordingPracticeSelection;
}

export async function executeFullscreenScreenRecording(
  request: FullscreenScreenRecordingBestPracticeRequest = {},
): ReturnType<typeof executeFullscreenScreenRecordingCore> {
  const selection = selectFullscreenScreenRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeFullscreenScreenRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const fullscreenScreenRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  FullscreenScreenRecordingHandlerInput,
  FullscreenScreenRecordingOutput
>({
  toolId: fullscreenScreenRecordingDescriptor.toolId,
  title: "Computer Use Fullscreen Screen Recording",
  description: "Start a fullscreen screen recording session through governed runtime computer-use support.",
  summary: "Use computeruse.fullscreenScreenRecording to request a runtime-owned fullscreen recording session handle.",
  storageGroup: "screenRecording",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:record", "display:capture"],
  dependencies: fullscreenScreenRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.fullscreenScreenRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          maxDurationMs: { type: "integer", minimum: 1, maximum: fullscreenScreenRecordingDescriptor.maxDurationMs },
          includeCursor: { type: "boolean" },
          includeAudio: { type: "boolean" },
          outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
          destinationHint: { type: "string" },
        },
      },
      displayId: { type: "string" },
      maxDurationMs: { type: "integer", minimum: 1, maximum: fullscreenScreenRecordingDescriptor.maxDurationMs },
      includeCursor: { type: "boolean" },
      includeAudio: { type: "boolean" },
      outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
      destinationHint: { type: "string" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.fullscreenScreenRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.fullscreenScreenRecording" },
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

export const fullscreenScreenRecordingHandler: BaseToolHandler<
  FullscreenScreenRecordingHandlerInput,
  FullscreenScreenRecordingOutput
> = createComputerUseCoreHandler(fullscreenScreenRecordingBaseToolDefinition, async (request) => {
  const selection = selectFullscreenScreenRecordingPractice({
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

  return executeFullscreenScreenRecordingCore({
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

export { executeFullscreenScreenRecordingCore, fullscreenScreenRecordingDescriptor, planFullscreenScreenRecording };

export type {
  FullscreenScreenRecordingAuditEvent,
  FullscreenScreenRecordingBoundary,
  FullscreenScreenRecordingContext,
  FullscreenScreenRecordingError,
  FullscreenScreenRecordingErrorCode,
  FullscreenScreenRecordingGate,
  FullscreenScreenRecordingOutput,
  FullscreenScreenRecordingOutputFormat,
  FullscreenScreenRecordingProvider,
  FullscreenScreenRecordingProviderRequest,
  FullscreenScreenRecordingProviderResult,
  FullscreenScreenRecordingRequest,
  FullscreenScreenRecordingResult,
  FullscreenScreenRecordingTarget,
} from "./core.js";
