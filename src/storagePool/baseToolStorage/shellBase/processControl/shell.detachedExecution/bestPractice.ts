/*
 * 文件定位：storagePool / baseToolStorage / shell.detachedExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的进程控制调用面。
 */

import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { withUnverifiedServiceLifecycle } from "../_shared/serviceLifecycle.js";
import { anthropicShellDetachedExecutionPractice } from "./anthropic.js";
import { deepmindShellDetachedExecutionPractice } from "./deepmind.js";
import { openaiShellDetachedExecutionPractice } from "./openai.js";
import {
  planShellDetachedExecution,
  shellDetachedExecutionDescriptor,
  type ShellDetachedExecutionOutput,
  type ShellDetachedExecutionRequest,
} from "./core.js";
import type { ShellToolResult, ShellToolAuditEvent, ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellDetachedExecutionDependencyDeclarations,
  type ShellDetachedExecutionDependencies,
  type ShellDetachedExecutionPracticeProviderName,
  type ShellDetachedExecutionProvider,
  type ShellDetachedExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellDetachedExecutionBestPracticeRequest = ShellDetachedExecutionRequest & {
  executor?: ShellDetachedExecutionDependencies["executor"];
  provider?: ShellDetachedExecutionProvider;
  preferredProvider?: ShellDetachedExecutionPracticeProviderName;
};

export type ShellDetachedExecutionHandlerInput = Omit<ShellDetachedExecutionBestPracticeRequest, "executor" | "provider">;

export type ShellDetachedExecutionPracticeSelection = {
  providerName: ShellDetachedExecutionPracticeProviderName;
  practice: ShellDetachedExecutionProviderPractice;
  provider?: ShellDetachedExecutionProvider;
};

export const shellDetachedExecutionProviderPractices = [
  anthropicShellDetachedExecutionPractice,
  openaiShellDetachedExecutionPractice,
  deepmindShellDetachedExecutionPractice,
] as const;

export const shellDetachedExecutionBestPracticeDescriptor = {
  toolId: "shell.detachedExecution",
  bestPractice: "runtime-governed-process-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellDetachedExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellDetachedExecutionPracticeProviderName | undefined,
): readonly ShellDetachedExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellDetachedExecutionProviderPractices;
  }

  return [
    ...shellDetachedExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellDetachedExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellDetachedExecutionPractice(
  dependencies: ShellDetachedExecutionDependencies & { preferredProvider?: ShellDetachedExecutionPracticeProviderName } = {},
): ShellDetachedExecutionPracticeSelection {
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

function bestPracticeRequest(input: unknown): ShellDetachedExecutionBestPracticeRequest {
  return requestRecord(input) as ShellDetachedExecutionBestPracticeRequest;
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
    toolId: "shell.detachedExecution",
    invocationId: trimmedString(context.invocationId) || "shell.detachedExecution:dry-run",
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
): ShellToolResult<ShellDetachedExecutionOutput, string> {
  return {
    ok: false,
    toolId: "shell.detachedExecution",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.detachedExecution.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.detachedExecution.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellDetachedExecution>): ShellToolResult<ShellDetachedExecutionOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.detachedExecution",
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

  return { ok: true, toolId: "shell.detachedExecution", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellDetachedExecutionOutput,
): ShellDetachedExecutionRequest {
  const requestInput = requestRecord(request);
  return {
    target: plannedOutput.target,
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
}

function normalizeProviderResult(
  providerResult: unknown,
  plannedOutput: ShellDetachedExecutionOutput,
): { resultEnvelope: Readonly<Record<string, unknown>>; metadata: Readonly<Record<string, unknown>> } | undefined {
  const resultRecord = readRecord(providerResult);
  if (resultRecord === undefined) {
    return undefined;
  }

  const resultEnvelope = plainJsonRecord(resultRecord.resultEnvelope);
  if (resultEnvelope === undefined || resultEnvelope.planned === true) {
    return undefined;
  }

  return {
    resultEnvelope: withUnverifiedServiceLifecycle(resultEnvelope, {
      command: plannedOutput.target.command,
      handle: plannedOutput.target.launchId,
      cwd: plannedOutput.target.workingDirectory,
      lifecycleKind: "detached",
      launchMode: "detached",
      statusSource: "shell.detachedExecution.provider",
    }),
    metadata: safeMetadata(resultRecord.metadata),
  };
}

export async function executeShellDetachedExecution(
  request: unknown = {},
): Promise<ShellToolResult<ShellDetachedExecutionOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellDetachedExecution(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.detachedExecution requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.detachedExecution requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellDetachedExecution({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) {
    return convertPlanResult(planned);
  }

  const selection = selectShellDetachedExecutionPractice({ executor: normalizedRequest.executor, provider: normalizedRequest.provider, preferredProvider: normalizedRequest.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.detachedExecution requires a runtime-provided process-control provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
      planned.output,
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.detachedExecution provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.detachedExecution",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        resultEnvelope: providerResult.resultEnvelope as ShellDetachedExecutionOutput["resultEnvelope"],
      } as unknown as ShellDetachedExecutionOutput,
      audit: [auditEvent("agentCore.basicTool.shell.detachedExecution.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.detachedExecution.providerCalled"],
    };
  } catch (error) {
    return failure("PROVIDER_REJECTED", "shell.detachedExecution provider rejected the invocation", "provider", context);
  }
}

export const shellDetachedExecutionBaseToolDefinition = createShellBaseToolDefinition<ShellDetachedExecutionHandlerInput, ShellDetachedExecutionOutput>({
  toolId: "shell.detachedExecution",
  title: "Detached Execution",
  description: "Plan or execute a detached shell launch through a governed runtime provider. Use this for long-lived GUI/browser launches such as Chrome, Firefox, Edge, or xdg-open when the process may outlive the agent session.",
  summary: "Use shell.detachedExecution when TAP/runtime has approved this process-control primitive.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:execute","shell:process:detached"],
  dependencies: shellDetachedExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.detachedExecution.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["command"],
        properties: {
          command: { type: "string", minLength: 1 },
          workingDirectory: { type: "string" },
          shell: { type: "string", enum: ["sh", "bash", "zsh"] },
          launchId: { type: "string" },
          pidFilePath: { type: "string" },
          stdoutLogPath: { type: "string" },
          stderrLogPath: { type: "string" },
          restartPolicy: { type: "string", enum: ["none", "on-failure"] },
        },
      },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.detachedExecution.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.detachedExecution" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellDetachedExecutionHandler: BaseToolHandler<ShellDetachedExecutionHandlerInput, ShellDetachedExecutionOutput> = createShellCoreHandler(
  shellDetachedExecutionBaseToolDefinition,
  async (request) => executeShellDetachedExecution({
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
