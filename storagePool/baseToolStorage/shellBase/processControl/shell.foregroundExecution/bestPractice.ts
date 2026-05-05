/*
 * 文件定位：storagePool / baseToolStorage / shell.foregroundExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的进程控制调用面。
 */

import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { anthropicShellForegroundExecutionPractice } from "./anthropic.js";
import { deepmindShellForegroundExecutionPractice } from "./deepmind.js";
import { openaiShellForegroundExecutionPractice } from "./openai.js";
import {
  planShellForegroundExecution,
  shellForegroundExecutionDescriptor,
  type ShellForegroundExecutionOutput,
  type ShellForegroundExecutionRequest,
} from "./core.js";
import type { ShellToolResult, ShellToolAuditEvent, ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellForegroundExecutionDependencyDeclarations,
  type ShellForegroundExecutionDependencies,
  type ShellForegroundExecutionPracticeProviderName,
  type ShellForegroundExecutionProvider,
  type ShellForegroundExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellForegroundExecutionBestPracticeRequest = ShellForegroundExecutionRequest & {
  executor?: ShellForegroundExecutionDependencies["executor"];
  provider?: ShellForegroundExecutionProvider;
  preferredProvider?: ShellForegroundExecutionPracticeProviderName;
};

export type ShellForegroundExecutionHandlerInput = Omit<ShellForegroundExecutionBestPracticeRequest, "executor" | "provider">;

export type ShellForegroundExecutionPracticeSelection = {
  providerName: ShellForegroundExecutionPracticeProviderName;
  practice: ShellForegroundExecutionProviderPractice;
  provider?: ShellForegroundExecutionProvider;
};

export const shellForegroundExecutionProviderPractices = [
  anthropicShellForegroundExecutionPractice,
  openaiShellForegroundExecutionPractice,
  deepmindShellForegroundExecutionPractice,
] as const;

export const shellForegroundExecutionBestPracticeDescriptor = {
  toolId: "shell.foregroundExecution",
  bestPractice: "runtime-governed-process-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellForegroundExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellForegroundExecutionPracticeProviderName | undefined,
): readonly ShellForegroundExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellForegroundExecutionProviderPractices;
  }

  return [
    ...shellForegroundExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellForegroundExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellForegroundExecutionPractice(
  dependencies: ShellForegroundExecutionDependencies & { preferredProvider?: ShellForegroundExecutionPracticeProviderName } = {},
): ShellForegroundExecutionPracticeSelection {
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
      notes: ["No injected or host process-control provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requestRecord(input: unknown): Readonly<Record<string, unknown>> {
  return readRecord(input) ?? {};
}

function bestPracticeRequest(input: unknown): ShellForegroundExecutionBestPracticeRequest {
  return requestRecord(input) as ShellForegroundExecutionBestPracticeRequest;
}

function runtimeContext(input: unknown): ShellToolContext {
  return (readRecord(requestRecord(input).context) ?? {}) as ShellToolContext;
}

function realExecutionRequested(input: unknown): boolean {
  return readRecord(requestRecord(input).context)?.dryRun === false;
}

function guardAllows(context: ShellToolContext): boolean {
  return context.guard?.allowed === true || context.guard?.accepted === true;
}

function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return {
    type,
    toolId: "shell.foregroundExecution",
    invocationId: trimmedString(context.invocationId) || "shell.foregroundExecution:dry-run",
    dryRun: context.dryRun !== false,
    metadata: {
      ...safeMetadata(context.auditMetadata),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: string,
  message: string,
  boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider",
  context?: ShellToolContext,
): ShellToolResult<ShellForegroundExecutionOutput, string> {
  return {
    ok: false,
    toolId: "shell.foregroundExecution",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.foregroundExecution.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.foregroundExecution.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellForegroundExecution>): ShellToolResult<ShellForegroundExecutionOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.foregroundExecution",
      error: {
        code: result.error.code,
        message: result.error.message,
        boundary: ((result.error.boundary as string) === "approval" ? "governance" : result.error.boundary) as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider",
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      },
      audit: result.audit as readonly ShellToolAuditEvent[],
      events: result.events,
    };
  }

  return { ok: true, toolId: "shell.foregroundExecution", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellForegroundExecutionOutput,
): ShellForegroundExecutionRequest {
  const requestInput = requestRecord(request);
  const originalTarget = readRecord(requestInput.target);
  return {
    target: {
      command: plannedOutput.target.command,
      workingDirectory: plannedOutput.target.workingDirectory,
      shell: plannedOutput.target.shell,
      timeoutMs: plannedOutput.target.timeoutMs,
      stdin: stringValue(originalTarget?.stdin),
      captureStdout: plannedOutput.target.captureStdout,
      captureStderr: plannedOutput.target.captureStderr,
    },
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
}

function normalizeProviderResult(
  providerResult: unknown,
): { resultEnvelope: Readonly<Record<string, unknown>>; metadata: Readonly<Record<string, unknown>> } | undefined {
  const resultRecord = readRecord(providerResult);
  if (resultRecord === undefined) {
    return undefined;
  }

  const resultEnvelope = plainJsonRecord(resultRecord.resultEnvelope);
  if (resultEnvelope === undefined || resultEnvelope.planned === true) {
    return undefined;
  }

  return { resultEnvelope, metadata: safeMetadata(resultRecord.metadata) };
}

export async function executeShellForegroundExecution(
  request: unknown = {},
): Promise<ShellToolResult<ShellForegroundExecutionOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellForegroundExecution(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.foregroundExecution requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.foregroundExecution requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellForegroundExecution({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) {
    return convertPlanResult(planned);
  }

  const selection = selectShellForegroundExecutionPractice({ executor: normalizedRequest.executor, provider: normalizedRequest.provider, preferredProvider: normalizedRequest.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.foregroundExecution requires a runtime-provided process-control provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.foregroundExecution provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.foregroundExecution",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        resultEnvelope: providerResult.resultEnvelope as ShellForegroundExecutionOutput["resultEnvelope"],
      } as unknown as ShellForegroundExecutionOutput,
      audit: [auditEvent("agentCore.basicTool.shell.foregroundExecution.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.foregroundExecution.providerCalled"],
    };
  } catch (error) {
    return failure("PROVIDER_REJECTED", "shell.foregroundExecution provider rejected the invocation", "provider", context);
  }
}

export const shellForegroundExecutionBaseToolDefinition = createShellBaseToolDefinition<ShellForegroundExecutionHandlerInput, ShellForegroundExecutionOutput>({
  toolId: "shell.foregroundExecution",
  title: "Foreground Execution",
  description: "Plan or execute foreground shell execution through a governed runtime provider.",
  summary: "Use shell.foregroundExecution when TAP/runtime has approved this process-control primitive.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:execute"],
  dependencies: shellForegroundExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.foregroundExecution.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.foregroundExecution.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.foregroundExecution" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellForegroundExecutionHandler: BaseToolHandler<ShellForegroundExecutionHandlerInput, ShellForegroundExecutionOutput> = createShellCoreHandler(
  shellForegroundExecutionBaseToolDefinition,
  async (request) => executeShellForegroundExecution({
    ...request.input,
    executor: request.executor,
    context: {
      ...(readRecord(request.input.context) ?? {}),
      runtimeId: trimmedString(readRecord(request.input.context)?.runtimeId) ?? request.runtimeId,
      ...({ sessionId: trimmedString(readRecord(request.input.context)?.sessionId) ?? request.sessionId }),
      invocationId: trimmedString(readRecord(request.input.context)?.invocationId) ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(request.metadata, safeMetadata(readRecord(request.input.context)?.auditMetadata), request),
    },
  }),
);
