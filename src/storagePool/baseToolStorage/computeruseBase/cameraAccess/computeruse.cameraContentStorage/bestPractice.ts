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
import { anthropicCameraContentStoragePractice } from "./anthropic.js";
import { deepmindCameraContentStoragePractice } from "./deepmind.js";
import {
  cameraContentStorageDependencyDeclarations,
  type CameraContentStorageDependencies,
  type CameraContentStoragePracticeProviderName,
  type CameraContentStorageProviderPractice,
} from "./dependencies.js";
import { openaiCameraContentStoragePractice } from "./openai.js";
import {
  cameraContentStorageDescriptor,
  executeCameraContentStorage as executeCameraContentStorageCore,
  planCameraContentStorage,
  type CameraContentStorageOutput,
  type CameraContentStorageProvider,
  type CameraContentStorageRequest,
} from "./core.js";

export type CameraContentStorageBestPracticeRequest = CameraContentStorageRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CameraContentStoragePracticeProviderName;
};

export type CameraContentStorageHandlerInput = Omit<CameraContentStorageBestPracticeRequest, "executor">;

export type CameraContentStoragePracticeSelection = {
  providerName: CameraContentStoragePracticeProviderName;
  practice: CameraContentStorageProviderPractice;
  provider?: CameraContentStorageProvider;
};

export const cameraContentStorageProviderPractices = [
  anthropicCameraContentStoragePractice,
  openaiCameraContentStoragePractice,
  deepmindCameraContentStoragePractice,
] as const;

export const cameraContentStorageBestPracticeDescriptor = {
  toolId: "computeruse.cameraContentStorage",
  bestPractice: "storage-owned-runtime-computeruse-camera-artifact-storage-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: cameraContentStorageDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: CameraContentStorageProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime camera content artifact storage provider is available; dry-run remains available."],
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

export function selectCameraContentStoragePractice(
  dependencies: CameraContentStorageDependencies & {
    preferredProvider?: CameraContentStoragePracticeProviderName;
  } = {},
): CameraContentStoragePracticeSelection {
  return selectComputerUseProviderPractice(
    cameraContentStorageProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as CameraContentStoragePracticeSelection;
}

export async function executeCameraContentStorage(
  request: CameraContentStorageBestPracticeRequest = {},
): ReturnType<typeof executeCameraContentStorageCore> {
  const selection = selectCameraContentStoragePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeCameraContentStorageCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const cameraContentStorageBaseToolDefinition = createComputerUseBaseToolDefinition<
  CameraContentStorageHandlerInput,
  CameraContentStorageOutput
>({
  toolId: cameraContentStorageDescriptor.toolId,
  title: "Computer Use Camera Content Storage",
  description: "Store or retain a camera photo/frame/recording artifact through governed runtime artifact support.",
  summary: "Use computeruse.cameraContentStorage to ask runtime to retain or promote an existing camera content artifact.",
  storageGroup: "cameraAccess",
  riskLevel: "risky",
  permissionHints: ["device:camera", "artifact:read", "artifact:write"],
  dependencies: cameraContentStorageDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.cameraContentStorage.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          contentRef: { type: "string" },
          cameraContentRef: { type: "string" },
          artifactRef: { type: "string" },
          contentKind: { type: "string", enum: ["camera-photo", "camera-frame", "camera-recording", "generic"] },
          storageTarget: { type: "string" },
          retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
        },
      },
      contentRef: { type: "string" },
      cameraContentRef: { type: "string" },
      artifactRef: { type: "string" },
      contentKind: { type: "string", enum: ["camera-photo", "camera-frame", "camera-recording", "generic"] },
      storageTarget: { type: "string" },
      retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.cameraContentStorage.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "storageEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.cameraContentStorage" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-artifact"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      storageEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: true,
  },
});

export const cameraContentStorageHandler: BaseToolHandler<CameraContentStorageHandlerInput, CameraContentStorageOutput> =
  createComputerUseCoreHandler(cameraContentStorageBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeCameraContentStorageCore(rawInput);
    }
    const selection = selectCameraContentStoragePractice({
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

    return executeCameraContentStorageCore({
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

export { cameraContentStorageDescriptor, executeCameraContentStorageCore, planCameraContentStorage };

export type {
  CameraContentStorageAuditEvent,
  CameraContentStorageBoundary,
  CameraContentStorageContext,
  CameraContentStorageError,
  CameraContentStorageErrorCode,
  CameraContentStorageGate,
  CameraContentStorageKind,
  CameraContentStorageOutput,
  CameraContentStorageProvider,
  CameraContentStorageProviderRequest,
  CameraContentStorageProviderResult,
  CameraContentStorageRequest,
  CameraContentStorageResult,
  CameraContentStorageRetentionPolicy,
  CameraContentStorageTarget,
} from "./core.js";
