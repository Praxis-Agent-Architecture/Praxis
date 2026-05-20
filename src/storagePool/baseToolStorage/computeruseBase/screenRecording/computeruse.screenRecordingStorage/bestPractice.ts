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
import { anthropicScreenRecordingStoragePractice } from "./anthropic.js";
import { deepmindScreenRecordingStoragePractice } from "./deepmind.js";
import {
  type ScreenRecordingStorageDependencies,
  type ScreenRecordingStoragePracticeProviderName,
  type ScreenRecordingStorageProviderPractice,
  screenRecordingStorageDependencyDeclarations,
} from "./dependencies.js";
import { openaiScreenRecordingStoragePractice } from "./openai.js";
import {
  executeScreenRecordingStorage as executeScreenRecordingStorageCore,
  planScreenRecordingStorage,
  type ScreenRecordingStorageOutput,
  type ScreenRecordingStorageProvider,
  type ScreenRecordingStorageRequest,
  screenRecordingStorageDescriptor,
} from "./core.js";

export type ScreenRecordingStorageBestPracticeRequest = ScreenRecordingStorageRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ScreenRecordingStoragePracticeProviderName;
};

export type ScreenRecordingStorageHandlerInput = Omit<ScreenRecordingStorageBestPracticeRequest, "executor">;

export type ScreenRecordingStoragePracticeSelection = {
  providerName: ScreenRecordingStoragePracticeProviderName;
  practice: ScreenRecordingStorageProviderPractice;
  provider?: ScreenRecordingStorageProvider;
};

export const screenRecordingStorageProviderPractices = [
  anthropicScreenRecordingStoragePractice,
  openaiScreenRecordingStoragePractice,
  deepmindScreenRecordingStoragePractice,
] as const;

export const screenRecordingStorageBestPracticeDescriptor = {
  toolId: "computeruse.screenRecordingStorage",
  bestPractice: "storage-owned-runtime-computeruse-recording-storage-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: screenRecordingStorageDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: ScreenRecordingStorageProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse recording storage provider is available; dry-run remains available."],
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

export function selectScreenRecordingStoragePractice(
  dependencies: ScreenRecordingStorageDependencies & {
    preferredProvider?: ScreenRecordingStoragePracticeProviderName;
  } = {},
): ScreenRecordingStoragePracticeSelection {
  return selectComputerUseProviderPractice(
    screenRecordingStorageProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as ScreenRecordingStoragePracticeSelection;
}

export async function executeScreenRecordingStorage(
  request: ScreenRecordingStorageBestPracticeRequest = {},
): ReturnType<typeof executeScreenRecordingStorageCore> {
  const selection = selectScreenRecordingStoragePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeScreenRecordingStorageCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const screenRecordingStorageBaseToolDefinition = createComputerUseBaseToolDefinition<
  ScreenRecordingStorageHandlerInput,
  ScreenRecordingStorageOutput
>({
  toolId: screenRecordingStorageDescriptor.toolId,
  title: "Computer Use Screen Recording Storage",
  description: "Finalize and store a runtime-owned screen recording session through governed computer-use support.",
  summary: "Use computeruse.screenRecordingStorage to request a video artifact from a runtime-owned recording session handle.",
  storageGroup: "screenRecording",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:record", "recording:session", "artifact:write"],
  dependencies: screenRecordingStorageDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.screenRecordingStorage.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          recordingRef: { type: "string" },
          storageTarget: { type: "string" },
          retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
        },
      },
      recordingRef: { type: "string" },
      storageTarget: { type: "string" },
      retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.screenRecordingStorage.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "storageEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.screenRecordingStorage" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
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
    reusable: false,
  },
});

export const screenRecordingStorageHandler: BaseToolHandler<ScreenRecordingStorageHandlerInput, ScreenRecordingStorageOutput> =
  createComputerUseCoreHandler(screenRecordingStorageBaseToolDefinition, async (request) => {
    const selection = selectScreenRecordingStoragePractice({
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

    return executeScreenRecordingStorageCore({
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

export { executeScreenRecordingStorageCore, planScreenRecordingStorage, screenRecordingStorageDescriptor };

export type {
  ScreenRecordingStorageAuditEvent,
  ScreenRecordingStorageBoundary,
  ScreenRecordingStorageContext,
  ScreenRecordingStorageError,
  ScreenRecordingStorageErrorCode,
  ScreenRecordingStorageGate,
  ScreenRecordingStorageOutput,
  ScreenRecordingStorageProvider,
  ScreenRecordingStorageProviderRequest,
  ScreenRecordingStorageProviderResult,
  ScreenRecordingStorageRequest,
  ScreenRecordingStorageResult,
  ScreenRecordingStorageRetentionPolicy,
  ScreenRecordingStorageTarget,
} from "./core.js";
