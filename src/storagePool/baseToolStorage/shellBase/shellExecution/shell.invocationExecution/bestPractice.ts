/*
 * 文件定位：storagePool / baseToolStorage / shell.invocationExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的 Shell 调用对象执行调用面。
 */

import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellInvocationExecutionPractice } from "./anthropic.js";
import { deepmindShellInvocationExecutionPractice } from "./deepmind.js";
import { openaiShellInvocationExecutionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellInvocation as executeShellInvocationCore,
  type ShellInvocationExecutionOutput,
  type ShellInvocationExecutionProvider,
  type ShellInvocationExecutionRequest,
} from "./core.js";
import {
  shellInvocationExecutionDependencyDeclarations,
  type ShellInvocationExecutionDependencies,
  type ShellInvocationExecutionPracticeProviderName,
  type ShellInvocationExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellInvocationExecutionBestPracticeRequest = ShellInvocationExecutionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellInvocationExecutionPracticeProviderName;
};

export type ShellInvocationExecutionHandlerInput = Omit<ShellInvocationExecutionBestPracticeRequest, "executor">;

export type ShellInvocationExecutionPracticeSelection = {
  providerName: ShellInvocationExecutionPracticeProviderName;
  practice: ShellInvocationExecutionProviderPractice;
  provider?: ShellInvocationExecutionProvider;
};

export const shellInvocationExecutionProviderPractices = [
  anthropicShellInvocationExecutionPractice,
  openaiShellInvocationExecutionPractice,
  deepmindShellInvocationExecutionPractice,
] as const;

export const shellInvocationExecutionBestPracticeDescriptor = {
  toolId: "shell.invocationExecution",
  bestPractice: "runtime-execEngine-shellExecutor",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellInvocationExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellInvocationExecutionPracticeProviderName | undefined,
): readonly ShellInvocationExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellInvocationExecutionProviderPractices;
  }

  return [
    ...shellInvocationExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellInvocationExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellInvocationExecutionPractice(
  dependencies: ShellInvocationExecutionDependencies & {
    preferredProvider?: ShellInvocationExecutionPracticeProviderName;
  } = {},
): ShellInvocationExecutionPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return {
        providerName: practice.providerName,
        practice,
        provider,
      };
    }
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: {
        kind: "praxis-native",
        label: "Praxis dry-run fallback",
      },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or host shell provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function buildShellInvocationExecutionPracticeAuditMetadata(
  selection: ShellInvocationExecutionPracticeSelection,
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

export async function executeShellInvocation(
  request: ShellInvocationExecutionBestPracticeRequest = {},
): ReturnType<typeof executeShellInvocationCore> {
  const selection = selectShellInvocationExecutionPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeShellInvocationCore({
    ...request,
    provider: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...buildShellInvocationExecutionPracticeAuditMetadata(selection),
      },
    },
  });
}

const shellInvocationContextSchema = {
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

export const shellInvocationExecutionBaseToolDefinition = createShellBaseToolDefinition<
  ShellInvocationExecutionHandlerInput,
  ShellInvocationExecutionOutput
>({
  toolId: "shell.invocationExecution",
  title: "Shell Invocation Execution",
  description: "Execute a normalized shell invocation object through the governed runtime shell executor.",
  summary: "Use shell.invocationExecution when the runtime has approved a structured shell invocation object.",
  storageGroup: "shellExecution",
  riskLevel: "risky",
  permissionHints: ["shell:execute"],
  dependencies: shellInvocationExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.invocationExecution.input", {
    type: "object",
    additionalProperties: true,
    required: ["invocation"],
    properties: {
      invocation: {
        type: "object",
        additionalProperties: true,
        required: ["executable"],
        properties: {
          invocationId: { type: "string" },
          executable: { type: "string", minLength: 1 },
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          shellType: { type: "string" },
          env: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "value"],
              properties: {
                name: { type: "string" },
                value: { type: "string" },
              },
            },
          },
          timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
          stdin: { type: "string" },
        },
      },
      context: shellInvocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.invocationExecution.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "invocationId", "executable", "args", "timeoutMs", "dryRun", "providerCalled", "stdout", "stderr"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.invocationExecution" },
      invocationId: { type: "string" },
      executable: { type: "string" },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      shellType: { type: "string" },
      env: { type: "object", additionalProperties: { type: "string" } },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
    },
  }),
});

export const shellInvocationExecutionHandler: BaseToolHandler<
  ShellInvocationExecutionHandlerInput,
  ShellInvocationExecutionOutput
> = createShellCoreHandler(shellInvocationExecutionBaseToolDefinition, async (request) => {
  const practice = selectShellInvocationExecutionPractice({
    ...request.input,
    executor: request.executor,
  });

  return executeShellInvocationCore({
    ...request.input,
    provider: practice.provider,
    context: {
      ...request.input.context,
      runtimeId: request.input.context?.runtimeId ?? request.runtimeId,
      sessionId: request.input.context?.sessionId ?? request.sessionId,
      invocationId:
        request.input.context?.invocationId ?? request.input.invocation?.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...buildShellInvocationExecutionPracticeAuditMetadata(practice),
          ...(request.metadata ?? {}),
        },
        request.input.context?.auditMetadata,
        request,
      ),
    },
  });
});
