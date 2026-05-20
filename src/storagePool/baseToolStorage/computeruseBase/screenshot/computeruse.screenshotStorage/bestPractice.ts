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
import { anthropicScreenshotStoragePractice } from "./anthropic.js";
import { deepmindScreenshotStoragePractice } from "./deepmind.js";
import {
  screenshotStorageDependencyDeclarations,
  type ScreenshotStorageDependencies,
  type ScreenshotStoragePracticeProviderName,
  type ScreenshotStorageProviderPractice,
} from "./dependencies.js";
import { openaiScreenshotStoragePractice } from "./openai.js";
import {
  executeScreenshotStorage as executeScreenshotStorageCore,
  planScreenshotStorage,
  screenshotStorageDescriptor,
  type ScreenshotStorageOutput,
  type ScreenshotStorageProvider,
  type ScreenshotStorageRequest,
} from "./core.js";

export type ScreenshotStorageBestPracticeRequest = ScreenshotStorageRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ScreenshotStoragePracticeProviderName;
};

export type ScreenshotStorageHandlerInput = Omit<ScreenshotStorageBestPracticeRequest, "executor">;

export type ScreenshotStoragePracticeSelection = {
  providerName: ScreenshotStoragePracticeProviderName;
  practice: ScreenshotStorageProviderPractice;
  provider?: ScreenshotStorageProvider;
};

export const screenshotStorageProviderPractices = [
  anthropicScreenshotStoragePractice,
  openaiScreenshotStoragePractice,
  deepmindScreenshotStoragePractice,
] as const;

export const screenshotStorageBestPracticeDescriptor = {
  toolId: "computeruse.screenshotStorage",
  bestPractice: "storage-owned-runtime-computeruse-artifact-storage-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: screenshotStorageDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: ScreenshotStorageProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse artifact storage provider is available; dry-run remains available."],
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

export function selectScreenshotStoragePractice(
  dependencies: ScreenshotStorageDependencies & {
    preferredProvider?: ScreenshotStoragePracticeProviderName;
  } = {},
): ScreenshotStoragePracticeSelection {
  return selectComputerUseProviderPractice(
    screenshotStorageProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as ScreenshotStoragePracticeSelection;
}

export async function executeScreenshotStorage(
  request: ScreenshotStorageBestPracticeRequest = {},
): ReturnType<typeof executeScreenshotStorageCore> {
  const selection = selectScreenshotStoragePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeScreenshotStorageCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const screenshotStorageBaseToolDefinition = createComputerUseBaseToolDefinition<
  ScreenshotStorageHandlerInput,
  ScreenshotStorageOutput
>({
  toolId: screenshotStorageDescriptor.toolId,
  title: "Computer Use Screenshot Storage",
  description: "Store or retain a screenshot artifact through governed runtime computer-use support.",
  summary: "Use computeruse.screenshotStorage to ask runtime to retain or promote a screenshot artifact.",
  storageGroup: "screenshot",
  riskLevel: "risky",
  permissionHints: ["device:screen", "artifact:read", "artifact:write"],
  dependencies: screenshotStorageDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.screenshotStorage.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          screenshotRef: { type: "string" },
          storageTarget: { type: "string" },
          retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
        },
      },
      screenshotRef: { type: "string" },
      storageTarget: { type: "string" },
      retentionPolicy: { type: "string", enum: ["ephemeral", "session-only", "session-scoped", "persistent"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.screenshotStorage.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "storageEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.screenshotStorage" },
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
    reusable: true,
  },
});

export const screenshotStorageHandler: BaseToolHandler<ScreenshotStorageHandlerInput, ScreenshotStorageOutput> =
  createComputerUseCoreHandler(screenshotStorageBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeScreenshotStorageCore(rawInput);
    }
    const selection = selectScreenshotStoragePractice({
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

    return executeScreenshotStorageCore({
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

export { executeScreenshotStorageCore, planScreenshotStorage, screenshotStorageDescriptor };

export type {
  ScreenshotStorageAuditEvent,
  ScreenshotStorageBoundary,
  ScreenshotStorageContext,
  ScreenshotStorageError,
  ScreenshotStorageErrorCode,
  ScreenshotStorageGate,
  ScreenshotStorageOutput,
  ScreenshotStorageProvider,
  ScreenshotStorageProviderRequest,
  ScreenshotStorageProviderResult,
  ScreenshotStorageRequest,
  ScreenshotStorageResult,
  ScreenshotStorageRetentionPolicy,
  ScreenshotStorageTarget,
} from "./core.js";
