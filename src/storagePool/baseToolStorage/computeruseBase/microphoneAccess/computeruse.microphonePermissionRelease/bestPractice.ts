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
import { anthropicMicrophonePermissionReleasePractice } from "./anthropic.js";
import { deepmindMicrophonePermissionReleasePractice } from "./deepmind.js";
import {
  microphonePermissionReleaseDependencyDeclarations,
  type MicrophonePermissionReleaseDependencies,
  type MicrophonePermissionReleasePracticeProviderName,
  type MicrophonePermissionReleaseProviderPractice,
} from "./dependencies.js";
import { openaiMicrophonePermissionReleasePractice } from "./openai.js";
import {
  executeMicrophonePermissionRelease as executeMicrophonePermissionReleaseCore,
  microphonePermissionReleaseDescriptor,
  planMicrophonePermissionRelease,
  type MicrophonePermissionReleaseOutput,
  type MicrophonePermissionReleaseProvider,
  type MicrophonePermissionReleaseRequest,
} from "./core.js";

export type MicrophonePermissionReleaseBestPracticeRequest = MicrophonePermissionReleaseRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MicrophonePermissionReleasePracticeProviderName;
};

export type MicrophonePermissionReleaseHandlerInput = Omit<MicrophonePermissionReleaseBestPracticeRequest, "executor">;

export type MicrophonePermissionReleasePracticeSelection = {
  providerName: MicrophonePermissionReleasePracticeProviderName;
  practice: MicrophonePermissionReleaseProviderPractice;
  provider?: MicrophonePermissionReleaseProvider;
};

export const microphonePermissionReleaseProviderPractices = [
  anthropicMicrophonePermissionReleasePractice,
  openaiMicrophonePermissionReleasePractice,
  deepmindMicrophonePermissionReleasePractice,
] as const;

export const microphonePermissionReleaseBestPracticeDescriptor = {
  toolId: "computeruse.microphonePermissionRelease",
  bestPractice: "storage-owned-runtime-computeruse-microphone-permission-release-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: microphonePermissionReleaseDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MicrophonePermissionReleaseProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse microphone permission release provider is available; dry-run remains available."],
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

export function selectMicrophonePermissionReleasePractice(
  dependencies: MicrophonePermissionReleaseDependencies & {
    preferredProvider?: MicrophonePermissionReleasePracticeProviderName;
  } = {},
): MicrophonePermissionReleasePracticeSelection {
  return selectComputerUseProviderPractice(
    microphonePermissionReleaseProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MicrophonePermissionReleasePracticeSelection;
}

export async function executeMicrophonePermissionRelease(
  request: MicrophonePermissionReleaseBestPracticeRequest = {},
): ReturnType<typeof executeMicrophonePermissionReleaseCore> {
  const selection = selectMicrophonePermissionReleasePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMicrophonePermissionReleaseCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const microphonePermissionReleaseBaseToolDefinition = createComputerUseBaseToolDefinition<
  MicrophonePermissionReleaseHandlerInput,
  MicrophonePermissionReleaseOutput
>({
  toolId: microphonePermissionReleaseDescriptor.toolId,
  title: "Computer Use Microphone Permission Release",
  description: "Release a microphone permission lease through governed runtime computer-use support.",
  summary: "Use computeruse.microphonePermissionRelease to ask runtime to release a microphone permission lease.",
  storageGroup: "microphoneAccess",
  riskLevel: "risky",
  permissionHints: ["device:microphone", "microphone:permission-release"],
  dependencies: microphonePermissionReleaseDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.microphonePermissionRelease.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          permissionLeaseId: { type: "string" },
          targetApplication: { type: "string" },
          deviceId: { type: "string" },
          releaseReason: { type: "string" },
        },
      },
      permissionLeaseId: { type: "string" },
      targetApplication: { type: "string" },
      deviceId: { type: "string" },
      releaseReason: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.microphonePermissionRelease.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "releaseEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.microphonePermissionRelease" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      releaseEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: false,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const microphonePermissionReleaseHandler: BaseToolHandler<
  MicrophonePermissionReleaseHandlerInput,
  MicrophonePermissionReleaseOutput
> = createComputerUseCoreHandler(microphonePermissionReleaseBaseToolDefinition, async (request) => {
  const selection = selectMicrophonePermissionReleasePractice({
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

  return executeMicrophonePermissionReleaseCore({
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
  executeMicrophonePermissionReleaseCore,
  microphonePermissionReleaseDescriptor,
  planMicrophonePermissionRelease,
};

export type {
  MicrophonePermissionReleaseAuditEvent,
  MicrophonePermissionReleaseBoundary,
  MicrophonePermissionReleaseContext,
  MicrophonePermissionReleaseError,
  MicrophonePermissionReleaseErrorCode,
  MicrophonePermissionReleaseGate,
  MicrophonePermissionReleaseOutput,
  MicrophonePermissionReleaseProvider,
  MicrophonePermissionReleaseProviderRequest,
  MicrophonePermissionReleaseProviderResult,
  MicrophonePermissionReleaseRequest,
  MicrophonePermissionReleaseResult,
  MicrophonePermissionReleaseTarget,
} from "./core.js";
