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
import { anthropicCameraStartRecordingPractice } from "./anthropic.js";
import { deepmindCameraStartRecordingPractice } from "./deepmind.js";
import {
  cameraStartRecordingDependencyDeclarations,
  type CameraStartRecordingDependencies,
  type CameraStartRecordingPracticeProviderName,
  type CameraStartRecordingProviderPractice,
} from "./dependencies.js";
import { openaiCameraStartRecordingPractice } from "./openai.js";
import {
  cameraStartRecordingDescriptor,
  executeCameraStartRecording as executeCameraStartRecordingCore,
  planCameraStartRecording,
  type CameraStartRecordingInput,
  type CameraStartRecordingOutput,
  type CameraStartRecordingProvider,
} from "./core.js";

export type CameraStartRecordingBestPracticeRequest = CameraStartRecordingInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraStartRecordingPracticeProviderName;
};

export type CameraStartRecordingHandlerInput = Omit<CameraStartRecordingBestPracticeRequest, "executor">;

export type CameraStartRecordingPracticeSelection = {
  providerName: CameraStartRecordingPracticeProviderName;
  practice: CameraStartRecordingProviderPractice;
  provider?: CameraStartRecordingProvider;
};

export const cameraStartRecordingProviderPractices = [
  anthropicCameraStartRecordingPractice,
  openaiCameraStartRecordingPractice,
  deepmindCameraStartRecordingPractice,
] as const;

export const cameraStartRecordingBestPracticeDescriptor = {
  toolId: "computeruse.cameraStartRecording",
  bestPractice: "storage-owned-runtime-computeruse-camera-recording-session-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraStartRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraStartRecordingProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera recording provider is available; dry-run remains available."],
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

export function selectCameraStartRecordingPractice(
  dependencies: CameraStartRecordingDependencies & {
    preferredProvider?: CameraStartRecordingPracticeProviderName;
  } = {},
): CameraStartRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraStartRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraStartRecordingPracticeSelection;
}

export async function executeCameraStartRecording(
  request: CameraStartRecordingBestPracticeRequest = {},
): ReturnType<typeof executeCameraStartRecordingCore> {
  const selection = selectCameraStartRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraStartRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraStartRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraStartRecordingHandlerInput,
  CameraStartRecordingOutput
>({
  toolId: cameraStartRecordingDescriptor.toolId,
  title: "Computer Use Camera Start Recording",
  description: "Start a camera recording session through governed runtime computer-use support.",
  summary: "Use computeruse.cameraStartRecording to ask runtime to start a camera recording session handle.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "camera:start-recording"],
  dependencies: cameraStartRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraStartRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          cameraId: { type: "string" },
          deviceId: { type: "string" },
          purpose: { type: "string" },
          outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
          includeAudio: { type: "boolean" },
          maxDurationMs: { type: "integer", minimum: 1 },
          recordingLabel: { type: "string" },
          destinationHint: { type: "string" },
          permissionLeaseId: { type: "string" },
        },
      },
      cameraId: { type: "string" },
      purpose: { type: "string" },
      outputFormat: { type: "string", enum: ["video/webm", "video/mp4", "video/quicktime"] },
      includeAudio: { type: "boolean" },
      maxDurationMs: { type: "integer", minimum: 1 },
      recordingLabel: { type: "string" },
      destinationHint: { type: "string" },
      permissionLeaseId: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraStartRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recordingEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraStartRecording" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      recordingEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cameraStartRecordingHandler: BaseToolHandler<
  CameraStartRecordingHandlerInput,
  CameraStartRecordingOutput
> = createComputerUseCoreHandler(cameraStartRecordingBaseToolDefinition, async (request) => {
  const selection = selectCameraStartRecordingPractice({
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

  return executeCameraStartRecordingCore({
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
  cameraStartRecordingDescriptor,
  executeCameraStartRecordingCore,
  planCameraStartRecording,
};

export type {
  CameraStartRecordingAuditEvent,
  CameraStartRecordingBoundary,
  CameraStartRecordingContext,
  CameraStartRecordingError,
  CameraStartRecordingErrorCode,
  CameraStartRecordingGate,
  CameraStartRecordingInput,
  CameraStartRecordingOutput,
  CameraStartRecordingProvider,
  CameraStartRecordingProviderRequest,
  CameraStartRecordingProviderResult,
  CameraStartRecordingResult,
  CameraStartRecordingTarget,
} from "./core.js";
