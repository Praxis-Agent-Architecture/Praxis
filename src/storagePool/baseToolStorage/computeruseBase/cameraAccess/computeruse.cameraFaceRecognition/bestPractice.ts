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
import { anthropicCameraFaceRecognitionPractice } from "./anthropic.js";
import { deepmindCameraFaceRecognitionPractice } from "./deepmind.js";
import {
  cameraFaceRecognitionDependencyDeclarations,
  type CameraFaceRecognitionDependencies,
  type CameraFaceRecognitionPracticeProviderName,
  type CameraFaceRecognitionProviderPractice,
} from "./dependencies.js";
import { openaiCameraFaceRecognitionPractice } from "./openai.js";
import {
  cameraFaceRecognitionDescriptor,
  executeCameraFaceRecognition as executeCameraFaceRecognitionCore,
  planCameraFaceRecognition,
  type CameraFaceRecognitionInput,
  type CameraFaceRecognitionOutput,
  type CameraFaceRecognitionProvider,
} from "./core.js";

export type CameraFaceRecognitionBestPracticeRequest = CameraFaceRecognitionInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraFaceRecognitionPracticeProviderName;
};

export type CameraFaceRecognitionHandlerInput = Omit<CameraFaceRecognitionBestPracticeRequest, "executor">;

export type CameraFaceRecognitionPracticeSelection = {
  providerName: CameraFaceRecognitionPracticeProviderName;
  practice: CameraFaceRecognitionProviderPractice;
  provider?: CameraFaceRecognitionProvider;
};

export const cameraFaceRecognitionProviderPractices = [
  anthropicCameraFaceRecognitionPractice,
  openaiCameraFaceRecognitionPractice,
  deepmindCameraFaceRecognitionPractice,
] as const;

export const cameraFaceRecognitionBestPracticeDescriptor = {
  toolId: "computeruse.cameraFaceRecognition",
  bestPractice: "storage-owned-runtime-computeruse-camera-frame-face-analysis-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraFaceRecognitionDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraFaceRecognitionProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera frame face-analysis provider is available; dry-run remains available."],
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

export function selectCameraFaceRecognitionPractice(
  dependencies: CameraFaceRecognitionDependencies & {
    preferredProvider?: CameraFaceRecognitionPracticeProviderName;
  } = {},
): CameraFaceRecognitionPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraFaceRecognitionProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraFaceRecognitionPracticeSelection;
}

export async function executeCameraFaceRecognition(
  request: CameraFaceRecognitionBestPracticeRequest = {},
): ReturnType<typeof executeCameraFaceRecognitionCore> {
  const selection = selectCameraFaceRecognitionPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraFaceRecognitionCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraFaceRecognitionBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraFaceRecognitionHandlerInput,
  CameraFaceRecognitionOutput
>({
  toolId: cameraFaceRecognitionDescriptor.toolId,
  title: "Computer Use Camera Face Recognition",
  description: "Analyze an existing camera frame for faces through governed runtime computer-use support.",
  summary: "Use computeruse.cameraFaceRecognition to ask runtime to analyze faces in an existing camera frame reference.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "vision:face-analysis", "biometric:subject-consent"],
  dependencies: cameraFaceRecognitionDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraFaceRecognition.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          frameRef: { type: "string" },
          cameraFrameRef: { type: "string" },
          deviceId: { type: "string" },
          mode: { type: "string", enum: ["detect-faces", "verify-consented-face", "identify-consented-face"] },
          maxFaces: { type: "integer", minimum: 1, maximum: 64 },
          subjectRef: { type: "string" },
          subjectConsent: { type: "object", additionalProperties: true },
        },
      },
      frameRef: { type: "string" },
      cameraFrameRef: { type: "string" },
      deviceId: { type: "string" },
      mode: { type: "string", enum: ["detect-faces", "verify-consented-face", "identify-consented-face"] },
      maxFaces: { type: "integer", minimum: 1, maximum: 64 },
      subjectRef: { type: "string" },
      subjectConsent: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraFaceRecognition.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "recognitionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraFaceRecognition" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      recognitionEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cameraFaceRecognitionHandler: BaseToolHandler<CameraFaceRecognitionHandlerInput, CameraFaceRecognitionOutput> =
  createComputerUseCoreHandler(cameraFaceRecognitionBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeCameraFaceRecognitionCore(rawInput);
    }
    const selection = selectCameraFaceRecognitionPractice({
      ...rawInput,
      executor: request.executor,
    });
    const auditMetadata = injectRuntimeInvocationMetadata(
      buildComputerUsePracticeAuditMetadata(selection),
      isRecord(rawInput.context) && isRecord(rawInput.context.auditMetadata)
        ? rawInput.context.auditMetadata
        : undefined,
      request,
    );

    return executeCameraFaceRecognitionCore({
      ...rawInput,
      provider: selection.provider,
      context: {
        ...(isRecord(rawInput.context) ? rawInput.context : {}),
        runtimeId: isRecord(rawInput.context) && typeof rawInput.context.runtimeId === "string"
          ? rawInput.context.runtimeId
          : request.runtimeId,
        sessionId: isRecord(rawInput.context) && typeof rawInput.context.sessionId === "string"
          ? rawInput.context.sessionId
          : request.sessionId,
        invocationId: isRecord(rawInput.context) && typeof rawInput.context.invocationId === "string"
          ? rawInput.context.invocationId
          : request.toolCallId,
        auditMetadata,
      },
    });
  });

export { cameraFaceRecognitionDescriptor, executeCameraFaceRecognitionCore, planCameraFaceRecognition };

export type {
  CameraFaceRecognitionAuditEvent,
  CameraFaceRecognitionBoundary,
  CameraFaceRecognitionContext,
  CameraFaceRecognitionError,
  CameraFaceRecognitionErrorCode,
  CameraFaceRecognitionFace,
  CameraFaceRecognitionGate,
  CameraFaceRecognitionInput,
  CameraFaceRecognitionMode,
  CameraFaceRecognitionOutput,
  CameraFaceRecognitionProvider,
  CameraFaceRecognitionProviderRequest,
  CameraFaceRecognitionProviderResult,
  CameraFaceRecognitionResult,
  CameraFaceRecognitionTarget,
} from "./core.js";
