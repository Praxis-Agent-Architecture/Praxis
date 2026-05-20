/*
 * 文件定位：storagePool / baseToolStorage / shell.commandExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的 Shell 命令执行调用面。
 */

import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellCommandExecutionPractice } from "./anthropic.js";
import { deepmindShellCommandExecutionPractice } from "./deepmind.js";
import { openaiShellCommandExecutionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellCommand as executeShellCommandCore,
  type ShellCommandExecutionOutput,
  type ShellCommandExecutionProvider,
  type ShellCommandExecutionRequest,
} from "./core.js";
import {
  shellCommandExecutionDependencyDeclarations,
  type ShellCommandExecutionDependencies,
  type ShellCommandExecutionPracticeProviderName,
  type ShellCommandExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellCommandExecutionBestPracticeRequest = ShellCommandExecutionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellCommandExecutionPracticeProviderName;
};

export type ShellCommandExecutionHandlerInput = Omit<ShellCommandExecutionBestPracticeRequest, "executor">;

export type ShellCommandExecutionPracticeSelection = {
  providerName: ShellCommandExecutionPracticeProviderName;
  practice: ShellCommandExecutionProviderPractice;
  provider?: ShellCommandExecutionProvider;
};

export const shellCommandExecutionProviderPractices = [
  anthropicShellCommandExecutionPractice,
  openaiShellCommandExecutionPractice,
  deepmindShellCommandExecutionPractice,
] as const;

export const shellCommandExecutionBestPracticeDescriptor = {
  toolId: "shell.commandExecution",
  bestPractice: "runtime-execEngine-shellExecutor",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellCommandExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellCommandExecutionPracticeProviderName | undefined,
): readonly ShellCommandExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellCommandExecutionProviderPractices;
  }

  return [
    ...shellCommandExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellCommandExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellCommandExecutionPractice(
  dependencies: ShellCommandExecutionDependencies & {
    preferredProvider?: ShellCommandExecutionPracticeProviderName;
  } = {},
): ShellCommandExecutionPracticeSelection {
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

function buildShellCommandExecutionPracticeAuditMetadata(
  selection: ShellCommandExecutionPracticeSelection,
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

export async function executeShellCommand(
  request: ShellCommandExecutionBestPracticeRequest = {},
): ReturnType<typeof executeShellCommandCore> {
  const selection = selectShellCommandExecutionPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeShellCommandCore({
    ...request,
    provider: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...buildShellCommandExecutionPracticeAuditMetadata(selection),
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

export const shellCommandExecutionBaseToolDefinition = createShellBaseToolDefinition<
  ShellCommandExecutionHandlerInput,
  ShellCommandExecutionOutput
>({
  toolId: "shell.commandExecution",
  title: "Shell Command Execution",
  description: "Execute a short-lived shell command through the governed runtime shell executor. Do not use this for long-lived GUI/browser launches or dev servers such as Chrome, Firefox, Edge, xdg-open, node server.js, npm run dev, or npm start; use shell.serviceStartAndVerify when the service URL must be verified, or shell.backgroundExecution/shell.detachedExecution for launch-only process control. When verifying local web apps, read the actual port from stdout or scan localhost ports 3000-3020 instead of assuming 3000. Never create or edit workspace files with shell redirection, heredocs, cat, tee, or ad-hoc scripts; use code.overwrite, code.modify, or code.replaceFile for workspace file changes.",
  summary: "Use shell.commandExecution only for one-shot commands that exit promptly; use background/detached tools for services and Code tools for workspace file edits.",
  storageGroup: "shellExecution",
  riskLevel: "risky",
  permissionHints: ["shell:execute"],
  dependencies: shellCommandExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.commandExecution.input", {
    type: "object",
    additionalProperties: true,
    required: ["command"],
    properties: {
      command: { type: "string", minLength: 1 },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      shellType: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
      stdin: { type: "string" },
      context: shellInvocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.commandExecution.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "command", "args", "timeoutMs", "dryRun", "providerCalled", "stdout", "stderr"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.commandExecution" },
      command: { type: "string" },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      shellType: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
    },
  }),
});

export const shellCommandExecutionHandler: BaseToolHandler<
  ShellCommandExecutionHandlerInput,
  ShellCommandExecutionOutput
> = createShellCoreHandler(shellCommandExecutionBaseToolDefinition, async (request) => {
  const practice = selectShellCommandExecutionPractice({
    ...request.input,
    executor: request.executor,
  });

  return executeShellCommandCore({
    ...request.input,
    provider: practice.provider,
    context: {
      ...request.input.context,
      runtimeId: request.input.context?.runtimeId ?? request.runtimeId,
      sessionId: request.input.context?.sessionId ?? request.sessionId,
      invocationId: request.input.context?.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...buildShellCommandExecutionPracticeAuditMetadata(practice),
          ...(request.metadata ?? {}),
        },
        request.input.context?.auditMetadata,
        request,
      ),
    },
  });
});
