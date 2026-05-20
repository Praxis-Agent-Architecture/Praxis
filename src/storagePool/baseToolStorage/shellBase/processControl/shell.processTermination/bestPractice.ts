/*
 * 文件定位：storagePool / baseToolStorage / shell.processTermination bestPractice。
 * 核心目的：比较三家来源实践，并给 baseTools 入口提供稳定的进程控制调用面。
 */

import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { anthropicShellProcessTerminationPractice } from "./anthropic.js";
import { deepmindShellProcessTerminationPractice } from "./deepmind.js";
import { openaiShellProcessTerminationPractice } from "./openai.js";
import {
  planShellProcessTermination,
  shellProcessTerminationDescriptor,
  type ShellProcessTerminationOutput,
  type ShellProcessTerminationRequest,
} from "./core.js";
import type { ShellToolResult, ShellToolAuditEvent, ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellProcessTerminationDependencyDeclarations,
  type ShellProcessTerminationDependencies,
  type ShellProcessTerminationPracticeProviderName,
  type ShellProcessTerminationProvider,
  type ShellProcessTerminationProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellProcessTerminationBestPracticeRequest = ShellProcessTerminationRequest & {
  executor?: ShellProcessTerminationDependencies["executor"];
  provider?: ShellProcessTerminationProvider;
  preferredProvider?: ShellProcessTerminationPracticeProviderName;
};

export type ShellProcessTerminationHandlerInput = Omit<ShellProcessTerminationBestPracticeRequest, "executor" | "provider">;

export type ShellProcessTerminationPracticeSelection = {
  providerName: ShellProcessTerminationPracticeProviderName;
  practice: ShellProcessTerminationProviderPractice;
  provider?: ShellProcessTerminationProvider;
};

export const shellProcessTerminationProviderPractices = [
  anthropicShellProcessTerminationPractice,
  openaiShellProcessTerminationPractice,
  deepmindShellProcessTerminationPractice,
] as const;

export const shellProcessTerminationBestPracticeDescriptor = {
  toolId: "shell.processTermination",
  bestPractice: "runtime-governed-process-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellProcessTerminationDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellProcessTerminationPracticeProviderName | undefined,
): readonly ShellProcessTerminationProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellProcessTerminationProviderPractices;
  }

  return [
    ...shellProcessTerminationProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellProcessTerminationProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellProcessTerminationPractice(
  dependencies: ShellProcessTerminationDependencies & { preferredProvider?: ShellProcessTerminationPracticeProviderName } = {},
): ShellProcessTerminationPracticeSelection {
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

function bestPracticeRequest(input: unknown): ShellProcessTerminationBestPracticeRequest {
  return requestRecord(input) as ShellProcessTerminationBestPracticeRequest;
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
    toolId: "shell.processTermination",
    invocationId: trimmedString(context.invocationId) || "shell.processTermination:dry-run",
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
): ShellToolResult<ShellProcessTerminationOutput, string> {
  return {
    ok: false,
    toolId: "shell.processTermination",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.processTermination.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.processTermination.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellProcessTermination>): ShellToolResult<ShellProcessTerminationOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.processTermination",
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

  return { ok: true, toolId: "shell.processTermination", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellProcessTerminationOutput,
): ShellProcessTerminationRequest {
  const requestInput = requestRecord(request);
  return {
    target: plannedOutput.target,
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
}

function normalizeProviderResult(
  providerResult: unknown,
): { terminationEnvelope: Readonly<Record<string, unknown>>; metadata: Readonly<Record<string, unknown>> } | undefined {
  const resultRecord = readRecord(providerResult);
  if (resultRecord === undefined) {
    return undefined;
  }

  const terminationEnvelope = plainJsonRecord(resultRecord.resultEnvelope);
  if (terminationEnvelope === undefined || terminationEnvelope.planned === true) {
    return undefined;
  }

  return { terminationEnvelope, metadata: safeMetadata(resultRecord.metadata) };
}

export async function executeShellProcessTermination(
  request: unknown = {},
): Promise<ShellToolResult<ShellProcessTerminationOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellProcessTermination(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.processTermination requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.processTermination requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellProcessTermination({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) {
    return convertPlanResult(planned);
  }

  const selection = selectShellProcessTerminationPractice({ executor: normalizedRequest.executor, provider: normalizedRequest.provider, preferredProvider: normalizedRequest.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.processTermination requires a runtime-provided process-control provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.processTermination provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.processTermination",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        terminationEnvelope: providerResult.terminationEnvelope as ShellProcessTerminationOutput["terminationEnvelope"],
      } as unknown as ShellProcessTerminationOutput,
      audit: [auditEvent("agentCore.basicTool.shell.processTermination.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.processTermination.providerCalled"],
    };
  } catch (error) {
    return failure("PROVIDER_REJECTED", "shell.processTermination provider rejected the invocation", "provider", context);
  }
}

export const shellProcessTerminationBaseToolDefinition = createShellBaseToolDefinition<ShellProcessTerminationHandlerInput, ShellProcessTerminationOutput>({
  toolId: "shell.processTermination",
  title: "Process Termination",
  description: "Plan or execute shell process termination through a governed runtime provider.",
  summary: "Use shell.processTermination when TAP/runtime has approved this process-control primitive.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:process:terminate"],
  dependencies: shellProcessTerminationDependencyDeclarations,
  inputSchema: jsonSchema("shell.processTermination.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.processTermination.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.processTermination" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellProcessTerminationHandler: BaseToolHandler<ShellProcessTerminationHandlerInput, ShellProcessTerminationOutput> = createShellCoreHandler(
  shellProcessTerminationBaseToolDefinition,
  async (request) => executeShellProcessTermination({
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
