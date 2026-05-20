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
import { anthropicMicrophoneStartRecordingPractice } from "./anthropic.js";
import { deepmindMicrophoneStartRecordingPractice } from "./deepmind.js";
import {
  microphoneStartRecordingDependencyDeclarations,
  type MicrophoneStartRecordingDependencies,
  type MicrophoneStartRecordingPracticeProviderName,
  type MicrophoneStartRecordingProviderPractice,
} from "./dependencies.js";
import { openaiMicrophoneStartRecordingPractice } from "./openai.js";
import {
  executeMicrophoneStartRecording as executeMicrophoneStartRecordingCore,
  microphoneStartRecordingDescriptor,
  planMicrophoneStartRecording,
  type MicrophoneStartRecordingOutput,
  type MicrophoneStartRecordingProvider,
  type MicrophoneStartRecordingRequest,
} from "./core.js";

export type MicrophoneStartRecordingBestPracticeRequest = MicrophoneStartRecordingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MicrophoneStartRecordingPracticeProviderName;
};

export type MicrophoneStartRecordingHandlerInput = Omit<MicrophoneStartRecordingBestPracticeRequest, "executor">;

export type MicrophoneStartRecordingPracticeSelection = {
  providerName: MicrophoneStartRecordingPracticeProviderName;
  practice: MicrophoneStartRecordingProviderPractice;
  provider?: MicrophoneStartRecordingProvider;
};

export const microphoneStartRecordingProviderPractices = [
  anthropicMicrophoneStartRecordingPractice,
  openaiMicrophoneStartRecordingPractice,
  deepmindMicrophoneStartRecordingPractice,
] as const;

export const microphoneStartRecordingBestPracticeDescriptor = {
  toolId: "computeruse.microphoneStartRecording",
  bestPractice: "storage-owned-runtime-computeruse-microphone-recording-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: microphoneStartRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MicrophoneStartRecordingProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse microphone recording provider is available; dry-run remains available."],
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

export function selectMicrophoneStartRecordingPractice(
  dependencies: MicrophoneStartRecordingDependencies & {
    preferredProvider?: MicrophoneStartRecordingPracticeProviderName;
  } = {},
): MicrophoneStartRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    microphoneStartRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MicrophoneStartRecordingPracticeSelection;
}

export async function executeMicrophoneStartRecording(
  request: MicrophoneStartRecordingBestPracticeRequest = {},
): ReturnType<typeof executeMicrophoneStartRecordingCore> {
  const selection = selectMicrophoneStartRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMicrophoneStartRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const microphoneStartRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  MicrophoneStartRecordingHandlerInput,
  MicrophoneStartRecordingOutput
>({
  toolId: microphoneStartRecordingDescriptor.toolId,
  title: "Computer Use Microphone Start Recording",
  description: "Start a microphone recording session through governed runtime computer-use support.",
  summary: "Use computeruse.microphoneStartRecording to request a runtime-owned microphone recording session handle.",
  storageGroup: "microphoneAccess",
  riskLevel: "risky",
  permissionHints: ["device:microphone", "microphone:record", "recording:session", "artifact:write"],
  dependencies: microphoneStartRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.microphoneStartRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          deviceId: { type: "string" },
          permissionLeaseId: { type: "string" },
          recordingLabel: { type: "string" },
          destinationHint: { type: "string" },
          maxDurationMs: { type: "integer", minimum: 1, maximum: microphoneStartRecordingDescriptor.maxDurationMs },
          sampleRateHz: { type: "integer", minimum: 8000, maximum: 192000 },
          channelCount: { type: "integer", minimum: 1, maximum: 8 },
          outputFormat: { type: "string", enum: ["audio/wav", "audio/webm", "audio/mpeg"] },
        },
      },
      deviceId: { type: "string" },
      permissionLeaseId: { type: "string" },
      recordingLabel: { type: "string" },
      destinationHint: { type: "string" },
      maxDurationMs: { type: "integer", minimum: 1, maximum: microphoneStartRecordingDescriptor.maxDurationMs },
      sampleRateHz: { type: "integer", minimum: 8000, maximum: 192000 },
      channelCount: { type: "integer", minimum: 1, maximum: 8 },
      outputFormat: { type: "string", enum: ["audio/wav", "audio/webm", "audio/mpeg"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.microphoneStartRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.microphoneStartRecording" },
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

export const microphoneStartRecordingHandler: BaseToolHandler<
  MicrophoneStartRecordingHandlerInput,
  MicrophoneStartRecordingOutput
> = createComputerUseCoreHandler(microphoneStartRecordingBaseToolDefinition, async (request) => {
  const selection = selectMicrophoneStartRecordingPractice({
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

  return executeMicrophoneStartRecordingCore({
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

export {
  executeMicrophoneStartRecordingCore,
  microphoneStartRecordingDescriptor,
  planMicrophoneStartRecording,
};

export type {
  MicrophoneStartRecordingAuditEvent,
  MicrophoneStartRecordingBoundary,
  MicrophoneStartRecordingContext,
  MicrophoneStartRecordingError,
  MicrophoneStartRecordingErrorCode,
  MicrophoneStartRecordingGate,
  MicrophoneStartRecordingOutput,
  MicrophoneStartRecordingOutputFormat,
  MicrophoneStartRecordingProvider,
  MicrophoneStartRecordingProviderRequest,
  MicrophoneStartRecordingProviderResult,
  MicrophoneStartRecordingRequest,
  MicrophoneStartRecordingResult,
  MicrophoneStartRecordingTarget,
} from "./core.js";
