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
import { anthropicMicrophonePermissionRequestPractice } from "./anthropic.js";
import { deepmindMicrophonePermissionRequestPractice } from "./deepmind.js";
import {
  microphonePermissionRequestDependencyDeclarations,
  type MicrophonePermissionRequestDependencies,
  type MicrophonePermissionRequestPracticeProviderName,
  type MicrophonePermissionRequestProviderPractice,
} from "./dependencies.js";
import { openaiMicrophonePermissionRequestPractice } from "./openai.js";
import {
  executeMicrophonePermissionRequest as executeMicrophonePermissionRequestCore,
  microphonePermissionRequestDescriptor,
  planMicrophonePermissionRequest,
  type MicrophonePermissionProvider,
  type MicrophonePermissionRequestInput,
  type MicrophonePermissionRequestOutput,
} from "./core.js";

export type MicrophonePermissionRequestBestPracticeRequest = MicrophonePermissionRequestInput & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MicrophonePermissionRequestPracticeProviderName;
};

export type MicrophonePermissionRequestHandlerInput = Omit<MicrophonePermissionRequestBestPracticeRequest, "executor">;

export type MicrophonePermissionRequestPracticeSelection = {
  providerName: MicrophonePermissionRequestPracticeProviderName;
  practice: MicrophonePermissionRequestProviderPractice;
  provider?: MicrophonePermissionProvider;
};

export const microphonePermissionRequestProviderPractices = [
  anthropicMicrophonePermissionRequestPractice,
  openaiMicrophonePermissionRequestPractice,
  deepmindMicrophonePermissionRequestPractice,
] as const;

export const microphonePermissionRequestBestPracticeDescriptor = {
  toolId: "computeruse.microphonePermissionRequest",
  bestPractice: "storage-owned-runtime-computeruse-microphone-permission-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: microphonePermissionRequestDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MicrophonePermissionRequestProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse microphone permission provider is available; dry-run remains available."],
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

export function selectMicrophonePermissionRequestPractice(
  dependencies: MicrophonePermissionRequestDependencies & {
    preferredProvider?: MicrophonePermissionRequestPracticeProviderName;
  } = {},
): MicrophonePermissionRequestPracticeSelection {
  return selectComputerUseProviderPractice(
    microphonePermissionRequestProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MicrophonePermissionRequestPracticeSelection;
}

export async function executeMicrophonePermissionRequest(
  request: MicrophonePermissionRequestBestPracticeRequest = {},
): ReturnType<typeof executeMicrophonePermissionRequestCore> {
  const selection = selectMicrophonePermissionRequestPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMicrophonePermissionRequestCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const microphonePermissionRequestBaseToolDefinition = createComputerUseBaseToolDefinition<
  MicrophonePermissionRequestHandlerInput,
  MicrophonePermissionRequestOutput
>({
  toolId: microphonePermissionRequestDescriptor.toolId,
  title: "Computer Use Microphone Permission Request",
  description: "Request microphone access through governed runtime computer-use support.",
  summary: "Use computeruse.microphonePermissionRequest to ask runtime for a microphone permission lease.",
  storageGroup: "microphoneAccess",
  riskLevel: "risky",
  permissionHints: ["device:microphone", "microphone:permission-request"],
  dependencies: microphonePermissionRequestDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.microphonePermissionRequest.input", {
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
  outputSchema: jsonSchema("computeruse.microphonePermissionRequest.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "permissionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.microphonePermissionRequest" },
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

export const microphonePermissionRequestHandler: BaseToolHandler<
  MicrophonePermissionRequestHandlerInput,
  MicrophonePermissionRequestOutput
> = createComputerUseCoreHandler(microphonePermissionRequestBaseToolDefinition, async (request) => {
  const selection = selectMicrophonePermissionRequestPractice({
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

  return executeMicrophonePermissionRequestCore({
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
  executeMicrophonePermissionRequestCore,
  microphonePermissionRequestDescriptor,
  planMicrophonePermissionRequest,
};

export type {
  MicrophonePermissionProvider,
  MicrophonePermissionProviderRequest,
  MicrophonePermissionProviderResult,
  MicrophonePermissionRequestAuditEvent,
  MicrophonePermissionRequestBoundary,
  MicrophonePermissionRequestContext,
  MicrophonePermissionRequestError,
  MicrophonePermissionRequestErrorCode,
  MicrophonePermissionRequestGate,
  MicrophonePermissionRequestInput,
  MicrophonePermissionRequestMode,
  MicrophonePermissionRequestOutput,
  MicrophonePermissionRequestResult,
  MicrophonePermissionRequestTarget,
} from "./core.js";
