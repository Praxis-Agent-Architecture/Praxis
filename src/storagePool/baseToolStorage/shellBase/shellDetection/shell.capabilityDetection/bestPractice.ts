/*
 * 文件定位：storagePool / baseToolStorage / shell.capabilityDetection bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的 Shell 能力探测调用面。
 */

import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellCapabilityDetectionPractice } from "./anthropic.js";
import { deepmindShellCapabilityDetectionPractice } from "./deepmind.js";
import { openaiShellCapabilityDetectionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellCapabilityDetection as executeShellCapabilityDetectionCore,
  type ShellCapabilityDetectionOutput,
  type ShellCapabilityDetectionProvider,
  type ShellCapabilityDetectionRequest,
} from "./core.js";
import {
  shellCapabilityDetectionDependencyDeclarations,
  type ShellCapabilityDetectionDependencies,
  type ShellCapabilityDetectionPracticeProviderName,
  type ShellCapabilityDetectionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellCapabilityDetectionBestPracticeRequest = ShellCapabilityDetectionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellCapabilityDetectionPracticeProviderName;
};

export type ShellCapabilityDetectionHandlerInput = Omit<ShellCapabilityDetectionBestPracticeRequest, "executor">;

export type ShellCapabilityDetectionPracticeSelection = {
  providerName: ShellCapabilityDetectionPracticeProviderName;
  practice: ShellCapabilityDetectionProviderPractice;
  provider?: ShellCapabilityDetectionProvider;
};

export const shellCapabilityDetectionProviderPractices = [
  anthropicShellCapabilityDetectionPractice,
  openaiShellCapabilityDetectionPractice,
  deepmindShellCapabilityDetectionPractice,
] as const;

function orderedPractices(
  preferredProvider: ShellCapabilityDetectionPracticeProviderName | undefined,
): readonly ShellCapabilityDetectionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellCapabilityDetectionProviderPractices;
  }

  return [
    ...shellCapabilityDetectionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellCapabilityDetectionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellCapabilityDetectionPractice(
  dependencies: ShellCapabilityDetectionDependencies & {
    preferredProvider?: ShellCapabilityDetectionPracticeProviderName;
  } = {},
): ShellCapabilityDetectionPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or host shell capability provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function buildShellCapabilityDetectionPracticeAuditMetadata(
  selection: ShellCapabilityDetectionPracticeSelection,
): Readonly<Record<string, unknown>> {
  return buildShellPracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function requestValue(value: unknown): ShellCapabilityDetectionBestPracticeRequest {
  return recordValue(value) as ShellCapabilityDetectionBestPracticeRequest;
}

export async function executeShellCapabilityDetection(
  request: ShellCapabilityDetectionBestPracticeRequest = {},
): ReturnType<typeof executeShellCapabilityDetectionCore> {
  const normalizedRequest = requestValue(request);
  const context = recordValue(normalizedRequest.context) as NonNullable<ShellCapabilityDetectionRequest["context"]>;
  const selection = selectShellCapabilityDetectionPractice({
    executor: normalizedRequest.executor,
    provider: normalizedRequest.provider,
    preferredProvider: normalizedRequest.preferredProvider,
  });
  return executeShellCapabilityDetectionCore({
    ...normalizedRequest,
    provider: selection.provider,
    context: {
      ...context,
      auditMetadata: {
        ...recordValue(context.auditMetadata),
        ...buildShellCapabilityDetectionPracticeAuditMetadata(selection),
      },
    },
  });
}

const shellDetectionContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
  },
} as const;

export const shellCapabilityDetectionBestPracticeDescriptor = {
  toolId: "shell.capabilityDetection",
  bestPractice: "runtime-execEngine-shellCapabilityProvider",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellCapabilityDetectionDependencyDeclarations,
} as const;

export const shellCapabilityDetectionBaseToolDefinition = createShellBaseToolDefinition<
  ShellCapabilityDetectionHandlerInput,
  ShellCapabilityDetectionOutput
>({
  toolId: "shell.capabilityDetection",
  title: "Shell Capability Detection",
  description: "Detect shell capability support through governed dry-run inference or a runtime shell provider.",
  summary: "Use shell.capabilityDetection to classify shell capabilities without owning approval or host probing policy.",
  storageGroup: "shellDetection",
  riskLevel: "risky",
  permissionHints: ["shell:detect"],
  dependencies: shellCapabilityDetectionDependencyDeclarations,
  inputSchema: jsonSchema("shell.capabilityDetection.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["shellExecutable"],
        properties: {
          shellExecutable: { type: "string", minLength: 1 },
          shellKind: { type: "string" },
          reportedVersion: { type: "string" },
          requestedCapabilities: { type: "array", items: { type: "string" } },
        },
      },
      context: shellDetectionContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
});

export const shellCapabilityDetectionHandler: BaseToolHandler<
  ShellCapabilityDetectionHandlerInput,
  ShellCapabilityDetectionOutput
> = createShellCoreHandler(shellCapabilityDetectionBaseToolDefinition, async (request) => {
  const input = recordValue(request.input) as ShellCapabilityDetectionHandlerInput;
  const inputContext = recordValue(input.context) as NonNullable<ShellCapabilityDetectionHandlerInput["context"]>;
  const practice = selectShellCapabilityDetectionPractice({
    ...input,
    executor: request.executor,
  });

  return executeShellCapabilityDetectionCore({
    ...input,
    provider: practice.provider,
    context: {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...buildShellCapabilityDetectionPracticeAuditMetadata(practice),
          ...recordValue(request.metadata),
        },
        recordValue(inputContext.auditMetadata),
        request,
      ),
    },
  });
});
