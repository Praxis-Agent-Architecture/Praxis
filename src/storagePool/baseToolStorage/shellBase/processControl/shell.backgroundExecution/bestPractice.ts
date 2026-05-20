/*
 * 文件定位：storagePool / baseToolStorage / shell.backgroundExecution bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的进程控制调用面。
 */

import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { withUnverifiedServiceLifecycle } from "../_shared/serviceLifecycle.js";
import { anthropicShellBackgroundExecutionPractice } from "./anthropic.js";
import { deepmindShellBackgroundExecutionPractice } from "./deepmind.js";
import { openaiShellBackgroundExecutionPractice } from "./openai.js";
import {
  planShellBackgroundExecution,
  shellBackgroundExecutionDescriptor,
  type ShellBackgroundExecutionOutput,
  type ShellBackgroundExecutionRequest,
} from "./core.js";
import type { ShellToolResult, ShellToolAuditEvent, ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellBackgroundExecutionDependencyDeclarations,
  type ShellBackgroundExecutionDependencies,
  type ShellBackgroundExecutionPracticeProviderName,
  type ShellBackgroundExecutionProvider,
  type ShellBackgroundExecutionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellBackgroundExecutionBestPracticeRequest = ShellBackgroundExecutionRequest & {
  executor?: ShellBackgroundExecutionDependencies["executor"];
  provider?: ShellBackgroundExecutionProvider;
  preferredProvider?: ShellBackgroundExecutionPracticeProviderName;
};

export type ShellBackgroundExecutionHandlerInput = Omit<ShellBackgroundExecutionBestPracticeRequest, "executor" | "provider">;

export type ShellBackgroundExecutionPracticeSelection = {
  providerName: ShellBackgroundExecutionPracticeProviderName;
  practice: ShellBackgroundExecutionProviderPractice;
  provider?: ShellBackgroundExecutionProvider;
};

export const shellBackgroundExecutionProviderPractices = [
  anthropicShellBackgroundExecutionPractice,
  openaiShellBackgroundExecutionPractice,
  deepmindShellBackgroundExecutionPractice,
] as const;

export const shellBackgroundExecutionBestPracticeDescriptor = {
  toolId: "shell.backgroundExecution",
  bestPractice: "runtime-governed-process-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellBackgroundExecutionDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellBackgroundExecutionPracticeProviderName | undefined,
): readonly ShellBackgroundExecutionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellBackgroundExecutionProviderPractices;
  }

  return [
    ...shellBackgroundExecutionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellBackgroundExecutionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellBackgroundExecutionPractice(
  dependencies: ShellBackgroundExecutionDependencies & { preferredProvider?: ShellBackgroundExecutionPracticeProviderName } = {},
): ShellBackgroundExecutionPracticeSelection {
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

function bestPracticeRequest(input: unknown): ShellBackgroundExecutionBestPracticeRequest {
  return requestRecord(input) as ShellBackgroundExecutionBestPracticeRequest;
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
    toolId: "shell.backgroundExecution",
    invocationId: trimmedString(context.invocationId) || "shell.backgroundExecution:dry-run",
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
): ShellToolResult<ShellBackgroundExecutionOutput, string> {
  return {
    ok: false,
    toolId: "shell.backgroundExecution",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.backgroundExecution.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.backgroundExecution.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellBackgroundExecution>): ShellToolResult<ShellBackgroundExecutionOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.backgroundExecution",
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

  return { ok: true, toolId: "shell.backgroundExecution", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellBackgroundExecutionOutput,
): ShellBackgroundExecutionRequest {
  const requestInput = requestRecord(request);
  const providerRequest: ShellBackgroundExecutionRequest = {
    target: plannedOutput.target,
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
  if (requestInput.riskLevel === "low" || requestInput.riskLevel === "medium" || requestInput.riskLevel === "high") {
    providerRequest.riskLevel = requestInput.riskLevel;
  }

  return providerRequest;
}

function normalizeProviderResult(
  providerResult: unknown,
  plannedOutput: ShellBackgroundExecutionOutput,
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
      handle: plannedOutput.target.jobId,
      cwd: plannedOutput.target.workingDirectory,
      lifecycleKind: "background",
      launchMode: "background",
      statusSource: "shell.backgroundExecution.provider",
    }),
    metadata: safeMetadata(resultRecord.metadata),
  };
}

export async function executeShellBackgroundExecution(
  request: unknown = {},
): Promise<ShellToolResult<ShellBackgroundExecutionOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellBackgroundExecution(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.backgroundExecution requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.backgroundExecution requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellBackgroundExecution({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) {
    return convertPlanResult(planned);
  }

  const selection = selectShellBackgroundExecutionPractice({ executor: normalizedRequest.executor, provider: normalizedRequest.provider, preferredProvider: normalizedRequest.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.backgroundExecution requires a runtime-provided process-control provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
      planned.output,
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.backgroundExecution provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.backgroundExecution",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        resultEnvelope: providerResult.resultEnvelope as ShellBackgroundExecutionOutput["resultEnvelope"],
      } as unknown as ShellBackgroundExecutionOutput,
      audit: [auditEvent("agentCore.basicTool.shell.backgroundExecution.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.backgroundExecution.providerCalled"],
    };
  } catch (error) {
    return failure("PROVIDER_REJECTED", "shell.backgroundExecution provider rejected the invocation", "provider", context);
  }
}

export const shellBackgroundExecutionBaseToolDefinition = createShellBaseToolDefinition<ShellBackgroundExecutionHandlerInput, ShellBackgroundExecutionOutput>({
  toolId: "shell.backgroundExecution",
  title: "Background Execution",
  description: "Plan or execute background shell execution job through a governed runtime provider.",
  summary: "Use shell.backgroundExecution when TAP/runtime has approved this process-control primitive.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:execute","shell:process:background"],
  dependencies: shellBackgroundExecutionDependencyDeclarations,
  inputSchema: jsonSchema("shell.backgroundExecution.input", {
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
          jobId: { type: "string" },
          monitorIntervalMs: { type: "integer", minimum: 100, maximum: 60_000 },
          outputBufferLimitBytes: { type: "integer", minimum: 0, maximum: 10 * 1024 * 1024 },
          captureOutput: { type: "boolean" },
        },
      },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.backgroundExecution.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.backgroundExecution" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellBackgroundExecutionHandler: BaseToolHandler<ShellBackgroundExecutionHandlerInput, ShellBackgroundExecutionOutput> = createShellCoreHandler(
  shellBackgroundExecutionBaseToolDefinition,
  async (request) => executeShellBackgroundExecution({
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
