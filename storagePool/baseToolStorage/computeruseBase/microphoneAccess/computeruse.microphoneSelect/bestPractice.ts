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
import { anthropicMicrophoneSelectPractice } from "./anthropic.js";
import { deepmindMicrophoneSelectPractice } from "./deepmind.js";
import {
  microphoneSelectDependencyDeclarations,
  type MicrophoneSelectDependencies,
  type MicrophoneSelectPracticeProviderName,
  type MicrophoneSelectProviderPractice,
} from "./dependencies.js";
import { openaiMicrophoneSelectPractice } from "./openai.js";
import {
  executeMicrophoneSelect as executeMicrophoneSelectCore,
  microphoneSelectDescriptor,
  planMicrophoneSelect,
  type MicrophoneSelectOutput,
  type MicrophoneSelectProvider,
  type MicrophoneSelectRequest,
} from "./core.js";

export type MicrophoneSelectBestPracticeRequest = MicrophoneSelectRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: MicrophoneSelectPracticeProviderName;
};

export type MicrophoneSelectHandlerInput = Omit<MicrophoneSelectBestPracticeRequest, "executor">;

export type MicrophoneSelectPracticeSelection = {
  providerName: MicrophoneSelectPracticeProviderName;
  practice: MicrophoneSelectProviderPractice;
  provider?: MicrophoneSelectProvider;
};

export const microphoneSelectProviderPractices = [
  anthropicMicrophoneSelectPractice,
  openaiMicrophoneSelectPractice,
  deepmindMicrophoneSelectPractice,
] as const;

export const microphoneSelectBestPracticeDescriptor = {
  toolId: "computeruse.microphoneSelect",
  bestPractice: "storage-owned-runtime-computeruse-microphone-select-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: microphoneSelectDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: MicrophoneSelectProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse microphone select provider is available; dry-run remains available."],
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

export function selectMicrophoneSelectPractice(
  dependencies: MicrophoneSelectDependencies & {
    preferredProvider?: MicrophoneSelectPracticeProviderName;
  } = {},
): MicrophoneSelectPracticeSelection {
  return selectComputerUseProviderPractice(
    microphoneSelectProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as MicrophoneSelectPracticeSelection;
}

export async function executeMicrophoneSelect(
  request: MicrophoneSelectBestPracticeRequest = {},
): ReturnType<typeof executeMicrophoneSelectCore> {
  const selection = selectMicrophoneSelectPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeMicrophoneSelectCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const microphoneSelectBaseToolDefinition = createComputerUseBaseToolDefinition<
  MicrophoneSelectHandlerInput,
  MicrophoneSelectOutput
>({
  toolId: microphoneSelectDescriptor.toolId,
  title: "Computer Use Microphone Select",
  description: "Select a microphone device through governed runtime computer-use support.",
  summary: "Use computeruse.microphoneSelect to ask runtime to select a microphone device for a session or app target.",
  storageGroup: "microphoneAccess",
  riskLevel: "risky",
  permissionHints: ["device:microphone", "microphone:select"],
  dependencies: microphoneSelectDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.microphoneSelect.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          deviceId: { type: "string" },
          targetApplication: { type: "string" },
          permissionLeaseId: { type: "string" },
          selectionReason: { type: "string" },
          availableDevices: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
      deviceId: { type: "string" },
      targetApplication: { type: "string" },
      permissionLeaseId: { type: "string" },
      selectionReason: { type: "string" },
      availableDevices: { type: "array", items: { type: "object", additionalProperties: true } },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.microphoneSelect.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "selectionEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.microphoneSelect" },
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

export const microphoneSelectHandler: BaseToolHandler<MicrophoneSelectHandlerInput, MicrophoneSelectOutput> =
  createComputerUseCoreHandler(microphoneSelectBaseToolDefinition, async (request) => {
    const selection = selectMicrophoneSelectPractice({
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

    return executeMicrophoneSelectCore({
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
  executeMicrophoneSelectCore,
  microphoneSelectDescriptor,
  planMicrophoneSelect,
};

export type {
  MicrophoneAccessBoundary,
  MicrophoneAccessGate,
  MicrophoneSelectableDevice,
  MicrophoneSelectableDeviceKind,
  MicrophoneSelectAuditEvent,
  MicrophoneSelectBoundary,
  MicrophoneSelectContext,
  MicrophoneSelectError,
  MicrophoneSelectErrorCode,
  MicrophoneSelectGate,
  MicrophoneSelectOutput,
  MicrophoneSelectProvider,
  MicrophoneSelectProviderRequest,
  MicrophoneSelectProviderResult,
  MicrophoneSelectRequest,
  MicrophoneSelectResult,
  MicrophoneSelectTarget,
} from "./core.js";
