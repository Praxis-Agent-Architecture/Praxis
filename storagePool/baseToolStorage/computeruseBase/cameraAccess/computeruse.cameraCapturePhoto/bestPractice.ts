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
import { anthropicCameraCapturePhotoPractice } from "./anthropic.js";
import { deepmindCameraCapturePhotoPractice } from "./deepmind.js";
import {
  cameraCapturePhotoDependencyDeclarations,
  type CameraCapturePhotoDependencies,
  type CameraCapturePhotoPracticeProviderName,
  type CameraCapturePhotoProviderPractice,
} from "./dependencies.js";
import { openaiCameraCapturePhotoPractice } from "./openai.js";
import {
  cameraCapturePhotoDescriptor,
  executeCameraCapturePhoto as executeCameraCapturePhotoCore,
  planCameraCapturePhoto,
  type CameraCapturePhotoInput,
  type CameraCapturePhotoOutput,
  type CameraCapturePhotoProvider,
} from "./core.js";

export type CameraCapturePhotoBestPracticeRequest = CameraCapturePhotoInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraCapturePhotoPracticeProviderName;
};

export type CameraCapturePhotoHandlerInput = Omit<CameraCapturePhotoBestPracticeRequest, "executor">;

export type CameraCapturePhotoPracticeSelection = {
  providerName: CameraCapturePhotoPracticeProviderName;
  practice: CameraCapturePhotoProviderPractice;
  provider?: CameraCapturePhotoProvider;
};

export const cameraCapturePhotoProviderPractices = [
  anthropicCameraCapturePhotoPractice,
  openaiCameraCapturePhotoPractice,
  deepmindCameraCapturePhotoPractice,
] as const;

export const cameraCapturePhotoBestPracticeDescriptor = {
  toolId: "computeruse.cameraCapturePhoto",
  bestPractice: "storage-owned-runtime-computeruse-camera-photo-artifact-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraCapturePhotoDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraCapturePhotoProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera photo capture provider is available; dry-run remains available."],
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

export function selectCameraCapturePhotoPractice(
  dependencies: CameraCapturePhotoDependencies & {
    preferredProvider?: CameraCapturePhotoPracticeProviderName;
  } = {},
): CameraCapturePhotoPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraCapturePhotoProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraCapturePhotoPracticeSelection;
}

export async function executeCameraCapturePhoto(
  request: CameraCapturePhotoBestPracticeRequest = {},
): ReturnType<typeof executeCameraCapturePhotoCore> {
  const selection = selectCameraCapturePhotoPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraCapturePhotoCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraCapturePhotoBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraCapturePhotoHandlerInput,
  CameraCapturePhotoOutput
>({
  toolId: cameraCapturePhotoDescriptor.toolId,
  title: "Computer Use Camera Capture Photo",
  description: "Capture a camera photo artifact through governed runtime computer-use support.",
  summary: "Use computeruse.cameraCapturePhoto to ask runtime to capture a camera photo artifact.",
  storageGroup: "cameraAccess",
  riskLevel: "dangerous",
  permissionHints: ["device:camera", "camera:capture-photo"],
  dependencies: cameraCapturePhotoDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraCapturePhoto.input", {
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
          outputFormat: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
          permissionLeaseId: { type: "string" },
          leaseId: { type: "string" },
        },
      },
      cameraId: { type: "string" },
      purpose: { type: "string" },
      outputFormat: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
      permissionLeaseId: { type: "string" },
      leaseId: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraCapturePhoto.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "artifactEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraCapturePhoto" },
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

export const cameraCapturePhotoHandler: BaseToolHandler<
  CameraCapturePhotoHandlerInput,
  CameraCapturePhotoOutput
> = createComputerUseCoreHandler(cameraCapturePhotoBaseToolDefinition, async (request) => {
  const selection = selectCameraCapturePhotoPractice({
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

  return executeCameraCapturePhotoCore({
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
  cameraCapturePhotoDescriptor,
  executeCameraCapturePhotoCore,
  planCameraCapturePhoto,
};

export type {
  CameraCapturePhotoAuditEvent,
  CameraCapturePhotoBoundary,
  CameraCapturePhotoContext,
  CameraCapturePhotoError,
  CameraCapturePhotoErrorCode,
  CameraCapturePhotoGate,
  CameraCapturePhotoInput,
  CameraCapturePhotoOutput,
  CameraCapturePhotoProvider,
  CameraCapturePhotoProviderRequest,
  CameraCapturePhotoProviderResult,
  CameraCapturePhotoResult,
  CameraCapturePhotoTarget,
} from "./core.js";
