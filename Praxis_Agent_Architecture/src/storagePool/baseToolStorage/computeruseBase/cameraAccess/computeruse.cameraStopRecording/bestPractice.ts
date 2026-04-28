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
import { anthropicCameraStopRecordingPractice } from "./anthropic.js";
import { deepmindCameraStopRecordingPractice } from "./deepmind.js";
import {
  cameraStopRecordingDependencyDeclarations,
  type CameraStopRecordingDependencies,
  type CameraStopRecordingPracticeProviderName,
  type CameraStopRecordingProviderPractice,
} from "./dependencies.js";
import { openaiCameraStopRecordingPractice } from "./openai.js";
import {
  cameraStopRecordingDescriptor,
  executeCameraStopRecording as executeCameraStopRecordingCore,
  planCameraStopRecording,
  type CameraStopRecordingInput,
  type CameraStopRecordingOutput,
  type CameraStopRecordingProvider,
} from "./core.js";

export type CameraStopRecordingBestPracticeRequest = CameraStopRecordingInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraStopRecordingPracticeProviderName;
};

export type CameraStopRecordingHandlerInput = Omit<CameraStopRecordingBestPracticeRequest, "executor">;

export type CameraStopRecordingPracticeSelection = {
  providerName: CameraStopRecordingPracticeProviderName;
  practice: CameraStopRecordingProviderPractice;
  provider?: CameraStopRecordingProvider;
};

export const cameraStopRecordingProviderPractices = [
  anthropicCameraStopRecordingPractice,
  openaiCameraStopRecordingPractice,
  deepmindCameraStopRecordingPractice,
] as const;

export const cameraStopRecordingBestPracticeDescriptor = {
  toolId: "computeruse.cameraStopRecording",
  bestPractice: "storage-owned-runtime-computeruse-camera-stop-recording-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraStopRecordingDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraStopRecordingProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera recording stop provider is available; dry-run remains available."],
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

export function selectCameraStopRecordingPractice(
  dependencies: CameraStopRecordingDependencies & {
    preferredProvider?: CameraStopRecordingPracticeProviderName;
  } = {},
): CameraStopRecordingPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraStopRecordingProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraStopRecordingPracticeSelection;
}

export async function executeCameraStopRecording(
  request: CameraStopRecordingBestPracticeRequest = {},
): ReturnType<typeof executeCameraStopRecordingCore> {
  const selection = selectCameraStopRecordingPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraStopRecordingCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraStopRecordingBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraStopRecordingHandlerInput,
  CameraStopRecordingOutput
>({
  toolId: cameraStopRecordingDescriptor.toolId,
  title: "Computer Use Camera Stop Recording",
  description: "Stop a camera recording session through governed runtime computer-use support and return a video artifact reference.",
  summary: "Use computeruse.cameraStopRecording to ask runtime to stop a camera recording session handle.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "camera:stop-recording", "recording:session", "artifact:write"],
  dependencies: cameraStopRecordingDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraStopRecording.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          recordingId: { type: "string" },
          recordingRef: { type: "string" },
          purpose: { type: "string" },
          storageTarget: { type: "string" },
          retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
          destinationHint: { type: "string" },
        },
      },
      recordingId: { type: "string" },
      recordingRef: { type: "string" },
      purpose: { type: "string" },
      storageTarget: { type: "string" },
      retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
      destinationHint: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraStopRecording.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "artifactEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraStopRecording" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      artifactEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cameraStopRecordingHandler: BaseToolHandler<
  CameraStopRecordingHandlerInput,
  CameraStopRecordingOutput
> = createComputerUseCoreHandler(cameraStopRecordingBaseToolDefinition, async (request) => {
  const selection = selectCameraStopRecordingPractice({
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

  return executeCameraStopRecordingCore({
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
  cameraStopRecordingDescriptor,
  executeCameraStopRecordingCore,
  planCameraStopRecording,
};

export type {
  CameraStopRecordingAuditEvent,
  CameraStopRecordingBoundary,
  CameraStopRecordingContext,
  CameraStopRecordingError,
  CameraStopRecordingErrorCode,
  CameraStopRecordingGate,
  CameraStopRecordingInput,
  CameraStopRecordingOutput,
  CameraStopRecordingProvider,
  CameraStopRecordingProviderRequest,
  CameraStopRecordingProviderResult,
  CameraStopRecordingResult,
  CameraStopRecordingRetentionPolicy,
  CameraStopRecordingTarget,
} from "./core.js";
