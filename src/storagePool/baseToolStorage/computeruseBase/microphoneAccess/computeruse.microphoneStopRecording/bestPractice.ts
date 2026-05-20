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
import { anthropicMicrophoneStopRecordingPractice } from "./anthropic.js";
import { deepmindMicrophoneStopRecordingPractice } from "./deepmind.js";
import {
  microphoneStopRecordingDependencyDeclarations,
  type MicrophoneStopRecordingDependencies,
  type MicrophoneStopRecordingPracticeProviderName,
  type MicrophoneStopRecordingProviderPractice,
} from "./dependencies.js";
import { openaiMicrophoneStopRecordingPractice } from "./openai.js";
import {
  executeMicrophoneStopRecording as executeMicrophoneStopRecordingCore,
  microphoneStopRecordingDescriptor,
  planMicrophoneStopRecording,
  type MicrophoneStopRecordingOutput,
  type MicrophoneStopRecordingProvider,
  type MicrophoneStopRecordingRequest,
} from "./core.js";

export type MicrophoneStopRecordingBestPracticeRequest = MicrophoneStopRecordingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MicrophoneStopRecordingPracticeProviderName;
};

export type MicrophoneStopRecordingHandlerInput = Omit<MicrophoneStopRecordingBestPracticeRequest, "executor">;

export type MicrophoneStopRecordingPracticeSelection = {
  providerName: MicrophoneStopRecordingPracticeProviderName;
  practice: MicrophoneStopRecordingProviderPractice;
  provider?: MicrophoneStopRecordingProvider;
};

export const microphoneStopRecordingProviderPractices = [
  anthropicMicrophoneStopRecordingPractice,
  openaiMicrophoneStopRecordingPractice,
  deepmindMicrophoneStopRecordingPractice,
] as const;

export const microphoneStopRecordingBestPracticeDescriptor = {
  toolId: "computeruse.microphoneStopRecording",
  bestPractice: "storage-owned-runtime-computeruse-microphone-recording-stop-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: microphoneStopRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MicrophoneStopRecordingProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse microphone recording stop provider is available; dry-run remains available."],
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

export function selectMicrophoneStopRecordingPractice(
  dependencies: MicrophoneStopRecordingDependencies & {
    preferredProvider?: MicrophoneStopRecordingPracticeProviderName;
  } = {},
): MicrophoneStopRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    microphoneStopRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MicrophoneStopRecordingPracticeSelection;
}

export async function executeMicrophoneStopRecording(
  request: MicrophoneStopRecordingBestPracticeRequest = {},
): ReturnType<typeof executeMicrophoneStopRecordingCore> {
  const selection = selectMicrophoneStopRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMicrophoneStopRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const microphoneStopRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  MicrophoneStopRecordingHandlerInput,
  MicrophoneStopRecordingOutput
>({
  toolId: microphoneStopRecordingDescriptor.toolId,
  title: "Computer Use Microphone Stop Recording",
  description: "Stop a microphone recording session through governed runtime computer-use support.",
  summary: "Use computeruse.microphoneStopRecording to stop a runtime-owned microphone recording session and receive an audio artifact handle.",
  storageGroup: "microphoneAccess",
  riskLevel: "risky",
  permissionHints: ["device:microphone", "microphone:record", "recording:session", "artifact:write"],
  dependencies: microphoneStopRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.microphoneStopRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          recordingId: { type: "string" },
          deviceId: { type: "string" },
          persistHint: { type: "string" },
          releaseDevice: { type: "boolean" },
        },
      },
      recordingId: { type: "string" },
      deviceId: { type: "string" },
      persistHint: { type: "string" },
      releaseDevice: { type: "boolean" },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.microphoneStopRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.microphoneStopRecording" },
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

export const microphoneStopRecordingHandler: BaseToolHandler<
  MicrophoneStopRecordingHandlerInput,
  MicrophoneStopRecordingOutput
> = createComputerUseCoreHandler(microphoneStopRecordingBaseToolDefinition, async (request) => {
  const selection = selectMicrophoneStopRecordingPractice({
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

  return executeMicrophoneStopRecordingCore({
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
  executeMicrophoneStopRecordingCore,
  microphoneStopRecordingDescriptor,
  planMicrophoneStopRecording,
};

export type {
  MicrophoneStopRecordingAuditEvent,
  MicrophoneStopRecordingBoundary,
  MicrophoneStopRecordingContext,
  MicrophoneStopRecordingError,
  MicrophoneStopRecordingErrorCode,
  MicrophoneStopRecordingGate,
  MicrophoneStopRecordingOutput,
  MicrophoneStopRecordingProvider,
  MicrophoneStopRecordingProviderRequest,
  MicrophoneStopRecordingProviderResult,
  MicrophoneStopRecordingRequest,
  MicrophoneStopRecordingResult,
  MicrophoneStopRecordingTarget,
} from "./core.js";
