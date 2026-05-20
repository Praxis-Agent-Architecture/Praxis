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
import { anthropicCameraSelectPractice } from "./anthropic.js";
import { deepmindCameraSelectPractice } from "./deepmind.js";
import {
  cameraSelectDependencyDeclarations,
  type CameraSelectDependencies,
  type CameraSelectPracticeProviderName,
  type CameraSelectProviderPractice,
} from "./dependencies.js";
import { openaiCameraSelectPractice } from "./openai.js";
import {
  cameraSelectDescriptor,
  executeCameraSelect as executeCameraSelectCore,
  planCameraSelect,
  type CameraSelectInput,
  type CameraSelectOutput,
  type CameraSelectProvider,
} from "./core.js";

export type CameraSelectBestPracticeRequest = CameraSelectInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraSelectPracticeProviderName;
};

export type CameraSelectHandlerInput = Omit<CameraSelectBestPracticeRequest, "executor">;

export type CameraSelectPracticeSelection = {
  providerName: CameraSelectPracticeProviderName;
  practice: CameraSelectProviderPractice;
  provider?: CameraSelectProvider;
};

export const cameraSelectProviderPractices = [
  anthropicCameraSelectPractice,
  openaiCameraSelectPractice,
  deepmindCameraSelectPractice,
] as const;

export const cameraSelectBestPracticeDescriptor = {
  toolId: "computeruse.cameraSelect",
  bestPractice: "storage-owned-runtime-computeruse-camera-device-select-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraSelectDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraSelectProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse camera device selection provider is available; dry-run remains available."],
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

export function selectCameraSelectPractice(
  dependencies: CameraSelectDependencies & {
    preferredProvider?: CameraSelectPracticeProviderName;
  } = {},
): CameraSelectPracticeSelection {
  return selectComputerUseProviderPractice(
    cameraSelectProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraSelectPracticeSelection;
}

export async function executeCameraSelect(
  request: CameraSelectBestPracticeRequest = {},
): ReturnType<typeof executeCameraSelectCore> {
  const selection = selectCameraSelectPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraSelectCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraSelectBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraSelectHandlerInput,
  CameraSelectOutput
>({
  toolId: cameraSelectDescriptor.toolId,
  title: "Computer Use Camera Select",
  description: "Select the active camera device through governed runtime computer-use support.",
  summary: "Use computeruse.cameraSelect to ask runtime to select a camera device.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "camera:select"],
  dependencies: cameraSelectDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraSelect.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          deviceId: { type: "string" },
          purpose: { type: "string" },
          availableDevices: { type: "array" },
        },
      },
      deviceId: { type: "string" },
      purpose: { type: "string" },
      availableDevices: { type: "array" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraSelect.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "selectionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraSelect" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      selectionEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const cameraSelectHandler: BaseToolHandler<CameraSelectHandlerInput, CameraSelectOutput> =
  createComputerUseCoreHandler(cameraSelectBaseToolDefinition, async (request) => {
    const selection = selectCameraSelectPractice({
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

    return executeCameraSelectCore({
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
  cameraSelectDescriptor,
  executeCameraSelectCore,
  planCameraSelect,
};

export type {
  CameraSelectableDevice,
  CameraSelectableDeviceKind,
  CameraSelectAuditEvent,
  CameraSelectBoundary,
  CameraSelectContext,
  CameraSelectError,
  CameraSelectErrorCode,
  CameraSelectGate,
  CameraSelectInput,
  CameraSelectOutput,
  CameraSelectProvider,
  CameraSelectProviderRequest,
  CameraSelectProviderResult,
  CameraSelectResult,
  CameraSelectTarget,
} from "./core.js";
