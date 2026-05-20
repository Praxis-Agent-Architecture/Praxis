import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellEnvironmentInspectionPractice } from "./anthropic.js";
import { deepmindShellEnvironmentInspectionPractice } from "./deepmind.js";
import { openaiShellEnvironmentInspectionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellEnvironmentInspection as executeShellEnvironmentInspectionCore,
  type ShellEnvironmentInspectionOutput,
  type ShellEnvironmentInspectionProvider,
  type ShellEnvironmentInspectionRequest,
} from "./core.js";
import {
  shellEnvironmentInspectionDependencyDeclarations,
  type ShellEnvironmentInspectionDependencies,
  type ShellEnvironmentInspectionPracticeProviderName,
  type ShellEnvironmentInspectionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellEnvironmentInspectionBestPracticeRequest = ShellEnvironmentInspectionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellEnvironmentInspectionPracticeProviderName;
};

export type ShellEnvironmentInspectionHandlerInput = Omit<ShellEnvironmentInspectionBestPracticeRequest, "executor">;

export type ShellEnvironmentInspectionPracticeSelection = {
  providerName: ShellEnvironmentInspectionPracticeProviderName;
  practice: ShellEnvironmentInspectionProviderPractice;
  provider?: ShellEnvironmentInspectionProvider;
};

export const shellEnvironmentInspectionProviderPractices = [
  anthropicShellEnvironmentInspectionPractice,
  openaiShellEnvironmentInspectionPractice,
  deepmindShellEnvironmentInspectionPractice,
] as const;

function orderedPractices(
  preferredProvider: ShellEnvironmentInspectionPracticeProviderName | undefined,
): readonly ShellEnvironmentInspectionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellEnvironmentInspectionProviderPractices;
  }

  return [
    ...shellEnvironmentInspectionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellEnvironmentInspectionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellEnvironmentInspectionPractice(
  dependencies: ShellEnvironmentInspectionDependencies & {
    preferredProvider?: ShellEnvironmentInspectionPracticeProviderName;
  } = {},
): ShellEnvironmentInspectionPracticeSelection {
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
      notes: ["No injected or host environment inspection provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function auditMetadata(selection: ShellEnvironmentInspectionPracticeSelection): Readonly<Record<string, unknown>> {
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

function requestValue(value: unknown): ShellEnvironmentInspectionBestPracticeRequest {
  return recordValue(value) as ShellEnvironmentInspectionBestPracticeRequest;
}

export async function executeShellEnvironmentInspection(
  request: ShellEnvironmentInspectionBestPracticeRequest = {},
): ReturnType<typeof executeShellEnvironmentInspectionCore> {
  const normalizedRequest = requestValue(request);
  const context = recordValue(normalizedRequest.context) as NonNullable<ShellEnvironmentInspectionRequest["context"]>;
  const selection = selectShellEnvironmentInspectionPractice({
    executor: normalizedRequest.executor,
    provider: normalizedRequest.provider,
    preferredProvider: normalizedRequest.preferredProvider,
  });
  return executeShellEnvironmentInspectionCore({
    ...normalizedRequest,
    provider: selection.provider,
    context: {
      ...context,
      auditMetadata: {
        ...recordValue(context.auditMetadata),
        ...auditMetadata(selection),
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

export const shellEnvironmentInspectionBestPracticeDescriptor = {
  toolId: "shell.environmentInspection",
  bestPractice: "runtime-execEngine-shellEnvironmentProvider",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellEnvironmentInspectionDependencyDeclarations,
} as const;

export const shellEnvironmentInspectionBaseToolDefinition = createShellBaseToolDefinition<
  ShellEnvironmentInspectionHandlerInput,
  ShellEnvironmentInspectionOutput
>({
  toolId: "shell.environmentInspection",
  title: "Shell Environment Inspection",
  description: "Inspect shell environment variables through a provided snapshot or governed runtime shell provider.",
  summary: "Use shell.environmentInspection to summarize environment material without bypassing runtime policy.",
  storageGroup: "shellDetection",
  riskLevel: "risky",
  permissionHints: ["shell:environment:inspect"],
  dependencies: shellEnvironmentInspectionDependencyDeclarations,
  inputSchema: jsonSchema("shell.environmentInspection.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["workingDirectory"],
        properties: {
          workingDirectory: { type: "string", minLength: 1 },
          shellExecutable: { type: "string" },
          environment: { type: "object", additionalProperties: { type: "string" } },
          variablesToInspect: { type: "array", items: { type: "string" } },
        },
      },
      context: shellDetectionContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
});

export const shellEnvironmentInspectionHandler: BaseToolHandler<
  ShellEnvironmentInspectionHandlerInput,
  ShellEnvironmentInspectionOutput
> = createShellCoreHandler(shellEnvironmentInspectionBaseToolDefinition, async (request) => {
  const input = recordValue(request.input) as ShellEnvironmentInspectionHandlerInput;
  const inputContext = recordValue(input.context) as NonNullable<ShellEnvironmentInspectionHandlerInput["context"]>;
  const practice = selectShellEnvironmentInspectionPractice({
    ...input,
    executor: request.executor,
  });

  return executeShellEnvironmentInspectionCore({
    ...input,
    provider: practice.provider,
    context: {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...auditMetadata(practice),
          ...recordValue(request.metadata),
        },
        recordValue(inputContext.auditMetadata),
        request,
      ),
    },
  });
});
