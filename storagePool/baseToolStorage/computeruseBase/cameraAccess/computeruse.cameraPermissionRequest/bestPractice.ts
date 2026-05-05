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
import { anthropicCameraPermissionRequestPractice } from "./anthropic.js";
import { deepmindCameraPermissionRequestPractice } from "./deepmind.js";
import {
  cameraPermissionRequestDependencyDeclarations,
  type CameraPermissionRequestDependencies,
  type CameraPermissionRequestPracticeProviderName,
  type CameraPermissionRequestProviderPractice,
} from "./dependencies.js";
import { openaiCameraPermissionRequestPractice } from "./openai.js";
import {
  executeCameraPermissionRequest as executeCameraPermissionRequestCore,
  cameraPermissionRequestDescriptor,
  planCameraPermissionRequest,
  type CameraPermissionProvider,
  type CameraPermissionRequestInput,
  type CameraPermissionRequestOutput,
} from "./core.js";

export type CameraPermissionRequestBestPracticeRequest = CameraPermissionRequestInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraPermissionRequestPracticeProviderName;
};

export type CameraPermissionRequestHandlerInput = Omit<CameraPermissionRequestBestPracticeRequest, "executor">;

export type CameraPermissionRequestPracticeSelection = {
  providerName: CameraPermissionRequestPracticeProviderName;
  practice: CameraPermissionRequestProviderPractice;
  provider?: CameraPermissionProvider;
};

export const cameraPermissionRequestProviderPractices = [
  anthropicCameraPermissionRequestPractice,
  openaiCameraPermissionRequestPractice,
  deepmindCameraPermissionRequestPractice,
] as const;

export const cameraPermissionRequestBestPracticeDescriptor = {
  toolId: "computeruse.cameraPermissionRequest",
  bestPractice: "storage-owned-runtime-computeruse-camera-permission-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraPermissionRequestDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraPermissionRequestProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera permission provider is available; dry-run remains available."],
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

export function selectCameraPermissionRequestPractice(
  dependencies: CameraPermissionRequestDependencies & {
    preferredProvider?: CameraPermissionRequestPracticeProviderName;
  } = {},
): CameraPermissionRequestPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraPermissionRequestProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraPermissionRequestPracticeSelection;
}

export async function executeCameraPermissionRequest(
  request: CameraPermissionRequestBestPracticeRequest = {},
): ReturnType<typeof executeCameraPermissionRequestCore> {
  const selection = selectCameraPermissionRequestPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraPermissionRequestCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraPermissionRequestBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraPermissionRequestHandlerInput,
  CameraPermissionRequestOutput
>({
  toolId: cameraPermissionRequestDescriptor.toolId,
  title: "Computer Use Camera Permission Request",
  description: "Request camera access through governed runtime computer-use support.",
  summary: "Use computeruse.cameraPermissionRequest to ask runtime for a camera permission lease.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "camera:permission-request"],
  dependencies: cameraPermissionRequestDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraPermissionRequest.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          targetApplication: { type: "string" },
          purpose: { type: "string" },
          deviceId: { type: "string" },
          mode: { type: "string", enum: ["session", "single-capture", "recording"] },
          requestedDurationMs: { type: "integer", minimum: 1 },
          maxDurationMs: { type: "integer", minimum: 1 },
        },
      },
      targetApplication: { type: "string" },
      purpose: { type: "string" },
      deviceId: { type: "string" },
      mode: { type: "string", enum: ["session", "single-capture", "recording"] },
      requestedDurationMs: { type: "integer", minimum: 1 },
      maxDurationMs: { type: "integer", minimum: 1 },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraPermissionRequest.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "permissionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraPermissionRequest" },
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

export const cameraPermissionRequestHandler: BaseToolHandler<
  CameraPermissionRequestHandlerInput,
  CameraPermissionRequestOutput
> = createComputerUseCoreHandler(cameraPermissionRequestBaseToolDefinition, async (request) => {
  const selection = selectCameraPermissionRequestPractice({
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

  return executeCameraPermissionRequestCore({
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
  executeCameraPermissionRequestCore,
  cameraPermissionRequestDescriptor,
  planCameraPermissionRequest,
};

export type {
  CameraPermissionProvider,
  CameraPermissionProviderRequest,
  CameraPermissionProviderResult,
  CameraPermissionRequestAuditEvent,
  CameraPermissionRequestBoundary,
  CameraPermissionRequestContext,
  CameraPermissionRequestError,
  CameraPermissionRequestErrorCode,
  CameraPermissionRequestGate,
  CameraPermissionRequestInput,
  CameraPermissionRequestMode,
  CameraPermissionRequestOutput,
  CameraPermissionRequestResult,
  CameraPermissionRequestTarget,
} from "./core.js";
