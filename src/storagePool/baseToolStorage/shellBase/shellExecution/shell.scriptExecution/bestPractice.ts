/*
 * 文件定位：storagePool / baseToolStorage / shell.scriptExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的 Shell 脚本执行调用面。
 */

import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellScriptExecutionPractice } from "./anthropic.js";
import { deepmindShellScriptExecutionPractice } from "./deepmind.js";
import { openaiShellScriptExecutionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellScript as executeShellScriptCore,
  type ShellScriptExecutionOutput,
  type ShellScriptExecutionProvider,
  type ShellScriptExecutionRequest,
} from "./core.js";
import {
  shellScriptExecutionDependencyDeclarations,
  type ShellScriptExecutionDependencies,
  type ShellScriptExecutionPracticeProviderName,
  type ShellScriptExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellScriptExecutionBestPracticeRequest = ShellScriptExecutionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellScriptExecutionPracticeProviderName;
};

export type ShellScriptExecutionHandlerInput = Omit<ShellScriptExecutionBestPracticeRequest, "executor">;

export type ShellScriptExecutionPracticeSelection = {
  providerName: ShellScriptExecutionPracticeProviderName;
  practice: ShellScriptExecutionProviderPractice;
  provider?: ShellScriptExecutionProvider;
};

export const shellScriptExecutionProviderPractices = [
  anthropicShellScriptExecutionPractice,
  openaiShellScriptExecutionPractice,
  deepmindShellScriptExecutionPractice,
] as const;

export const shellScriptExecutionBestPracticeDescriptor = {
  toolId: "shell.scriptExecution",
  bestPractice: "runtime-execEngine-shellExecutor",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellScriptExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellScriptExecutionPracticeProviderName | undefined,
): readonly ShellScriptExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellScriptExecutionProviderPractices;
  }

  return [
    ...shellScriptExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellScriptExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellScriptExecutionPractice(
  dependencies: ShellScriptExecutionDependencies & {
    preferredProvider?: ShellScriptExecutionPracticeProviderName;
  } = {},
): ShellScriptExecutionPracticeSelection {
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

function buildShellScriptExecutionPracticeAuditMetadata(
  selection: ShellScriptExecutionPracticeSelection,
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

export async function executeShellScript(
  request: ShellScriptExecutionBestPracticeRequest = {},
): ReturnType<typeof executeShellScriptCore> {
  const selection = selectShellScriptExecutionPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeShellScriptCore({
    ...request,
    provider: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...buildShellScriptExecutionPracticeAuditMetadata(selection),
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

export const shellScriptExecutionBaseToolDefinition = createShellBaseToolDefinition<
  ShellScriptExecutionHandlerInput,
  ShellScriptExecutionOutput
>({
  toolId: "shell.scriptExecution",
  title: "Shell Script Execution",
  description: "Execute a shell script through the governed runtime shell executor.",
  summary: "Use shell.scriptExecution when the runtime has approved a script-shaped shell primitive.",
  storageGroup: "shellExecution",
  riskLevel: "risky",
  permissionHints: ["shell:execute"],
  dependencies: shellScriptExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.scriptExecution.input", {
    type: "object",
    additionalProperties: true,
    required: ["script"],
    properties: {
      script: { type: "string", minLength: 1 },
      language: { type: "string", enum: ["sh", "bash", "zsh", "fish", "powershell", "unknown"] },
      cwd: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
      stdin: { type: "string" },
      context: shellInvocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.scriptExecution.output", {
    type: "object",
    additionalProperties: true,
    required: [
      "kind",
      "invocationId",
      "scriptPreview",
      "scriptLineCount",
      "scriptBytes",
      "language",
      "command",
      "args",
      "timeoutMs",
      "dryRun",
      "providerCalled",
      "stdout",
      "stderr",
    ],
    properties: {
      kind: { const: "agentCore.basicTool.shell.scriptExecution" },
      invocationId: { type: "string" },
      scriptPreview: { type: "string" },
      scriptLineCount: { type: "integer", minimum: 1 },
      scriptBytes: { type: "integer", minimum: 1 },
      language: { type: "string" },
      command: { type: "string" },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
    },
  }),
});

export const shellScriptExecutionHandler: BaseToolHandler<
  ShellScriptExecutionHandlerInput,
  ShellScriptExecutionOutput
> = createShellCoreHandler(shellScriptExecutionBaseToolDefinition, async (request) => {
  const practice = selectShellScriptExecutionPractice({
    ...request.input,
    executor: request.executor,
  });

  return executeShellScriptCore({
    ...request.input,
    provider: practice.provider,
    context: {
      ...request.input.context,
      runtimeId: request.input.context?.runtimeId ?? request.runtimeId,
      sessionId: request.input.context?.sessionId ?? request.sessionId,
      invocationId: request.input.context?.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...buildShellScriptExecutionPracticeAuditMetadata(practice),
          ...(request.metadata ?? {}),
        },
        request.input.context?.auditMetadata,
        request,
      ),
    },
  });
});
