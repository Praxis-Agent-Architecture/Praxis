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
import { anthropicCameraPermissionReleasePractice } from "./anthropic.js";
import { deepmindCameraPermissionReleasePractice } from "./deepmind.js";
import {
  cameraPermissionReleaseDependencyDeclarations,
  type CameraPermissionReleaseDependencies,
  type CameraPermissionReleasePracticeProviderName,
  type CameraPermissionReleaseProviderPractice,
} from "./dependencies.js";
import { openaiCameraPermissionReleasePractice } from "./openai.js";
import {
  cameraPermissionReleaseDescriptor,
  executeCameraPermissionRelease as executeCameraPermissionReleaseCore,
  planCameraPermissionRelease,
  type CameraPermissionReleaseInput,
  type CameraPermissionReleaseOutput,
  type CameraPermissionReleaseProvider,
} from "./core.js";

export type CameraPermissionReleaseBestPracticeRequest = CameraPermissionReleaseInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraPermissionReleasePracticeProviderName;
};

export type CameraPermissionReleaseHandlerInput = Omit<CameraPermissionReleaseBestPracticeRequest, "executor">;

export type CameraPermissionReleasePracticeSelection = {
  providerName: CameraPermissionReleasePracticeProviderName;
  practice: CameraPermissionReleaseProviderPractice;
  provider?: CameraPermissionReleaseProvider;
};

export const cameraPermissionReleaseProviderPractices = [
  anthropicCameraPermissionReleasePractice,
  openaiCameraPermissionReleasePractice,
  deepmindCameraPermissionReleasePractice,
] as const;

export const cameraPermissionReleaseBestPracticeDescriptor = {
  toolId: "computeruse.cameraPermissionRelease",
  bestPractice: "storage-owned-runtime-computeruse-camera-permission-release-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraPermissionReleaseDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraPermissionReleaseProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera permission release provider is available; dry-run remains available."],
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

export function selectCameraPermissionReleasePractice(
  dependencies: CameraPermissionReleaseDependencies & {
    preferredProvider?: CameraPermissionReleasePracticeProviderName;
  } = {},
): CameraPermissionReleasePracticeSelection {
  return selectComputerUseProviderPractice(
    cameraPermissionReleaseProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraPermissionReleasePracticeSelection;
}

export async function executeCameraPermissionRelease(
  request: CameraPermissionReleaseBestPracticeRequest = {},
): ReturnType<typeof executeCameraPermissionReleaseCore> {
  const selection = selectCameraPermissionReleasePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraPermissionReleaseCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraPermissionReleaseBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraPermissionReleaseHandlerInput,
  CameraPermissionReleaseOutput
>({
  toolId: cameraPermissionReleaseDescriptor.toolId,
  title: "Computer Use Camera Permission Release",
  description: "Release a camera permission lease through governed runtime computer-use support.",
  summary: "Use computeruse.cameraPermissionRelease to ask runtime to release a camera permission lease.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "camera:permission-release"],
  dependencies: cameraPermissionReleaseDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraPermissionRelease.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          leaseId: { type: "string" },
          permissionToken: { type: "string" },
          deviceId: { type: "string" },
          reason: { type: "string" },
        },
      },
      leaseId: { type: "string" },
      permissionToken: { type: "string" },
      deviceId: { type: "string" },
      reason: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraPermissionRelease.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "permissionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraPermissionRelease" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      permissionEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cameraPermissionReleaseHandler: BaseToolHandler<
  CameraPermissionReleaseHandlerInput,
  CameraPermissionReleaseOutput
> = createComputerUseCoreHandler(cameraPermissionReleaseBaseToolDefinition, async (request) => {
  const selection = selectCameraPermissionReleasePractice({
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

  return executeCameraPermissionReleaseCore({
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
  cameraPermissionReleaseDescriptor,
  executeCameraPermissionReleaseCore,
  planCameraPermissionRelease,
};

export type {
  CameraPermissionReleaseAuditEvent,
  CameraPermissionReleaseBoundary,
  CameraPermissionReleaseContext,
  CameraPermissionReleaseError,
  CameraPermissionReleaseErrorCode,
  CameraPermissionReleaseGate,
  CameraPermissionReleaseInput,
  CameraPermissionReleaseOutput,
  CameraPermissionReleaseProvider,
  CameraPermissionReleaseProviderRequest,
  CameraPermissionReleaseProviderResult,
  CameraPermissionReleaseResult,
  CameraPermissionReleaseTarget,
} from "./core.js";
