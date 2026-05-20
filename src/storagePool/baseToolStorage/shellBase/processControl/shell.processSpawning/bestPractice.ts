/*
 * 文件定位：storagePool / baseToolStorage / shell.processSpawning bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的进程控制调用面。
 */

import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { withUnverifiedServiceLifecycle } from "../_shared/serviceLifecycle.js";
import { anthropicShellProcessSpawningPractice } from "./anthropic.js";
import { deepmindShellProcessSpawningPractice } from "./deepmind.js";
import { openaiShellProcessSpawningPractice } from "./openai.js";
import {
  planShellProcessSpawn,
  shellProcessSpawningDescriptor,
  type ShellProcessSpawningOutput,
  type ShellProcessSpawningRequest,
} from "./core.js";
import type { ShellToolResult, ShellToolAuditEvent, ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellProcessSpawningDependencyDeclarations,
  type ShellProcessSpawningDependencies,
  type ShellProcessSpawningPracticeProviderName,
  type ShellProcessSpawningProvider,
  type ShellProcessSpawningProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellProcessSpawningBestPracticeRequest = ShellProcessSpawningRequest & {
  executor?: ShellProcessSpawningDependencies["executor"];
  provider?: ShellProcessSpawningProvider;
  preferredProvider?: ShellProcessSpawningPracticeProviderName;
};

export type ShellProcessSpawningHandlerInput = Omit<ShellProcessSpawningBestPracticeRequest, "executor" | "provider">;

export type ShellProcessSpawningPracticeSelection = {
  providerName: ShellProcessSpawningPracticeProviderName;
  practice: ShellProcessSpawningProviderPractice;
  provider?: ShellProcessSpawningProvider;
};

export const shellProcessSpawningProviderPractices = [
  anthropicShellProcessSpawningPractice,
  openaiShellProcessSpawningPractice,
  deepmindShellProcessSpawningPractice,
] as const;

export const shellProcessSpawningBestPracticeDescriptor = {
  toolId: "shell.processSpawning",
  bestPractice: "runtime-governed-process-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellProcessSpawningDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellProcessSpawningPracticeProviderName | undefined,
): readonly ShellProcessSpawningProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellProcessSpawningProviderPractices;
  }

  return [
    ...shellProcessSpawningProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellProcessSpawningProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellProcessSpawningPractice(
  dependencies: ShellProcessSpawningDependencies & { preferredProvider?: ShellProcessSpawningPracticeProviderName } = {},
): ShellProcessSpawningPracticeSelection {
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

function bestPracticeRequest(input: unknown): ShellProcessSpawningBestPracticeRequest {
  return requestRecord(input) as ShellProcessSpawningBestPracticeRequest;
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
    toolId: "shell.processSpawning",
    invocationId: trimmedString(context.invocationId) || "shell.processSpawning:dry-run",
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
): ShellToolResult<ShellProcessSpawningOutput, string> {
  return {
    ok: false,
    toolId: "shell.processSpawning",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.processSpawning.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.processSpawning.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellProcessSpawn>): ShellToolResult<ShellProcessSpawningOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.processSpawning",
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

  return { ok: true, toolId: "shell.processSpawning", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function normalizedEnv(value: unknown): Readonly<Record<string, string>> | undefined {
  const env = readRecord(value);
  if (env === undefined || Object.values(env).some((item) => typeof item !== "string")) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(env).map(([name, item]) => [name, item as string]));
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellProcessSpawningOutput,
): ShellProcessSpawningRequest {
  const requestInput = requestRecord(request);
  const originalTarget = readRecord(requestInput.target);
  const providerRequest: ShellProcessSpawningRequest = {
    target: {
      executable: plannedOutput.target.executable,
      command: plannedOutput.target.command,
      args: plannedOutput.target.args,
      workingDirectory: plannedOutput.target.workingDirectory,
      shell: plannedOutput.target.shell,
      env: normalizedEnv(originalTarget?.env),
      stdio: plannedOutput.target.stdio,
    },
    launchMode: plannedOutput.launchMode,
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
  if (requestInput.riskLevel === "low" || requestInput.riskLevel === "medium" || requestInput.riskLevel === "high") {
    providerRequest.riskLevel = requestInput.riskLevel;
  }

  return providerRequest;
}

function normalizeProviderResult(
  providerResult: unknown,
  plannedOutput: ShellProcessSpawningOutput,
): { resultEnvelope: Readonly<Record<string, unknown>>; metadata: Readonly<Record<string, unknown>> } | undefined {
  const resultRecord = readRecord(providerResult);
  if (resultRecord === undefined) {
    return undefined;
  }

  const resultEnvelope = plainJsonRecord(resultRecord.resultEnvelope);
  if (resultEnvelope === undefined || resultEnvelope.planned === true) {
    return undefined;
  }

  const serviceEnvelope = plannedOutput.launchMode === "foreground"
    ? resultEnvelope
    : withUnverifiedServiceLifecycle(resultEnvelope, {
      command: plannedOutput.target.command ?? plannedOutput.target.executable,
      handle: trimmedString(resultEnvelope.spawnHandle) ?? `${plannedOutput.launchMode}:${plannedOutput.target.executable ?? plannedOutput.target.command ?? "process"}`,
      launchMode: plannedOutput.launchMode,
      statusSource: "shell.processSpawning.provider",
    });

  return { resultEnvelope: serviceEnvelope, metadata: safeMetadata(resultRecord.metadata) };
}

export async function executeShellProcessSpawning(
  request: unknown = {},
): Promise<ShellToolResult<ShellProcessSpawningOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellProcessSpawn(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.processSpawning requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.processSpawning requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellProcessSpawn({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) {
    return convertPlanResult(planned);
  }

  const selection = selectShellProcessSpawningPractice({ executor: normalizedRequest.executor, provider: normalizedRequest.provider, preferredProvider: normalizedRequest.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.processSpawning requires a runtime-provided process-control provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
      planned.output,
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.processSpawning provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.processSpawning",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        resultEnvelope: providerResult.resultEnvelope as ShellProcessSpawningOutput["resultEnvelope"],
      } as unknown as ShellProcessSpawningOutput,
      audit: [auditEvent("agentCore.basicTool.shell.processSpawning.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.processSpawning.providerCalled"],
    };
  } catch (error) {
    return failure("PROVIDER_REJECTED", "shell.processSpawning provider rejected the invocation", "provider", context);
  }
}

export const shellProcessSpawningBaseToolDefinition = createShellBaseToolDefinition<ShellProcessSpawningHandlerInput, ShellProcessSpawningOutput>({
  toolId: "shell.processSpawning",
  title: "Process Spawning",
  description: "Plan or execute shell process spawning through a governed runtime provider.",
  summary: "Use shell.processSpawning when TAP/runtime has approved this process-control primitive.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:execute"],
  dependencies: shellProcessSpawningDependencyDeclarations,
  inputSchema: jsonSchema("shell.processSpawning.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          executable: { type: "string", minLength: 1 },
          command: { type: "string", minLength: 1 },
          args: { type: "array", items: { type: "string" } },
          workingDirectory: { type: "string" },
          shell: { type: "string", enum: ["sh", "bash", "zsh"] },
          env: { type: "object", additionalProperties: { type: "string" } },
          stdio: { type: "string", enum: ["pipe", "inherit", "ignore"] },
        },
      },
      launchMode: { type: "string", enum: ["foreground", "background", "detached"] },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.processSpawning.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.processSpawning" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellProcessSpawningHandler: BaseToolHandler<ShellProcessSpawningHandlerInput, ShellProcessSpawningOutput> = createShellCoreHandler(
  shellProcessSpawningBaseToolDefinition,
  async (request) => executeShellProcessSpawning({
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
