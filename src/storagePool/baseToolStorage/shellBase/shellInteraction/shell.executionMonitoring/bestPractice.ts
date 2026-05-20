import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellExecutionMonitoringPractice } from "./anthropic.js";
import { deepmindShellExecutionMonitoringPractice } from "./deepmind.js";
import { openaiShellExecutionMonitoringPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  monitorShellExecution as monitorShellExecutionCore,
  type ShellExecutionHealth,
  type ShellExecutionMonitoringOutput,
  type ShellExecutionMonitoringRequest,
  type ShellExecutionMonitoringResult,
  type ShellExecutionMonitoringTarget,
  type ShellExecutionObservation,
  type ShellExecutionState,
} from "./core.js";
import {
  executionMonitoringDependencyDeclarations,
  type ShellExecutionMonitoringDependencies,
  type ShellExecutionMonitoringPracticeProviderName,
  type ShellExecutionMonitoringProvider,
  type ShellExecutionMonitoringProviderPractice,
} from "./dependencies.js";
import {
  contextAuditMetadata,
  hasAffirmativeGuard,
  jsonRecord,
  runtimeIdIsMalformed,
  trimmedString,
} from "../_shared/jsonBoundary.js";
import {
  booleanField,
  finiteNumberField,
  nonNegativeIntegerField,
  providerContractMessage,
  providerRecord,
  providerRejectedMessage,
  stringField,
} from "../_shared/providerBoundary.js";

export type ShellExecutionMonitoringBestPracticeRequest = ShellExecutionMonitoringRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellExecutionMonitoringPracticeProviderName;
  provider?: ShellExecutionMonitoringProvider;
};
export type ShellExecutionMonitoringHandlerInput = Omit<ShellExecutionMonitoringBestPracticeRequest, "executor">;
export type ShellExecutionMonitoringPracticeSelection = {
  providerName: ShellExecutionMonitoringPracticeProviderName;
  practice: ShellExecutionMonitoringProviderPractice;
  provider?: ShellExecutionMonitoringProvider;
};

export const executionMonitoringProviderPractices = [anthropicShellExecutionMonitoringPractice, openaiShellExecutionMonitoringPractice, deepmindShellExecutionMonitoringPractice] as const;
export const executionMonitoringBestPracticeDescriptor = {
  toolId: "shell.executionMonitoring",
  bestPractice: "runtime-execEngine-shellInteraction-monitorExecution",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: executionMonitoringDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellExecutionMonitoringPracticeProviderName | undefined): readonly ShellExecutionMonitoringProviderPractice[] {
  if (preferredProvider === undefined) {
    return executionMonitoringProviderPractices;
  }

  return [
    ...executionMonitoringProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...executionMonitoringProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellExecutionMonitoringPractice(dependencies: ShellExecutionMonitoringDependencies & { preferredProvider?: ShellExecutionMonitoringPracticeProviderName } = {}): ShellExecutionMonitoringPracticeSelection {
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
      notes: ["No injected or host shell interaction provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: ShellExecutionMonitoringPracticeSelection): Readonly<Record<string, unknown>> {
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

function runtimeFailure(
  code: string,
  message: string,
  boundary: string,
  request: Partial<ShellExecutionMonitoringBestPracticeRequest>,
): ShellExecutionMonitoringResult {
  const context = jsonRecord(request.context);
  const target = jsonRecord(request.target);
  return {
    ok: false,
    toolId: "shell.executionMonitoring",
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [
      {
        type: "agentCore.basicTool.shell.executionMonitoring.rejected",
        toolId: "shell.executionMonitoring",
        invocationId: trimmedString(context?.invocationId) ?? "shell.executionMonitoring:runtime",
        dryRun: context?.dryRun !== false,
        sessionId: trimmedString(target?.sessionId),
        metadata: { ...contextAuditMetadata(context), code, boundary },
      },
    ],
    events: ["basicTool.shell.executionMonitoring.rejected"],
  } as unknown as ShellExecutionMonitoringResult;
}

const executionStates = new Set<ShellExecutionState>(["queued", "running", "exited", "failed", "unknown"]);
const executionHealth = new Set<ShellExecutionHealth>(["pending", "healthy", "stalled", "completed", "failed", "unknown"]);

function normalizeProviderTarget(
  target: unknown,
  planned: ShellExecutionMonitoringTarget,
): ShellExecutionMonitoringTarget | undefined {
  if (target === undefined) {
    return planned;
  }

  const targetRecord = providerRecord(target);
  if (!targetRecord.ok) {
    return undefined;
  }

  const sessionId = stringField(targetRecord.output, "sessionId") ?? planned.sessionId;
  const processId = targetRecord.output.processId ?? planned.processId;
  if (processId !== undefined && (typeof processId !== "number" || !Number.isInteger(processId) || processId <= 0)) {
    return undefined;
  }

  if (sessionId === undefined && processId === undefined) {
    return undefined;
  }

  return { sessionId, processId };
}

function normalizeProviderObservation(observation: unknown): ShellExecutionObservation | undefined {
  const observationRecord = providerRecord(observation);
  if (!observationRecord.ok) {
    return undefined;
  }

  const state = stringField(observationRecord.output, "state") as ShellExecutionState | undefined;
  if (state === undefined || !executionStates.has(state)) {
    return undefined;
  }

  const numericFields = ["startedAtMs", "observedAtMs", "lastActivityAtMs", "exitCode", "stdoutBytes", "stderrBytes"] as const;
  if (numericFields.some((field) => observationRecord.output[field] !== undefined && nonNegativeIntegerField(observationRecord.output, field) === undefined)) {
    return undefined;
  }

  const startedAtMs = nonNegativeIntegerField(observationRecord.output, "startedAtMs");
  const observedAtMs = nonNegativeIntegerField(observationRecord.output, "observedAtMs");
  const lastActivityAtMs = nonNegativeIntegerField(observationRecord.output, "lastActivityAtMs");
  const exitCode = nonNegativeIntegerField(observationRecord.output, "exitCode");
  const stdoutBytes = nonNegativeIntegerField(observationRecord.output, "stdoutBytes");
  const stderrBytes = nonNegativeIntegerField(observationRecord.output, "stderrBytes");
  const signal = stringField(observationRecord.output, "signal");

  return { state, startedAtMs, observedAtMs, lastActivityAtMs, exitCode, signal, stdoutBytes, stderrBytes };
}

function normalizeProviderOutput(
  providerOutput: unknown,
  planned: ShellExecutionMonitoringOutput,
): ShellExecutionMonitoringOutput | undefined {
  const providerRecordResult = providerRecord(providerOutput);
  if (!providerRecordResult.ok) {
    return undefined;
  }

  const outputRecord = providerRecordResult.output;
  if (booleanField(outputRecord, "realProcessReadBlocked") !== false) {
    return undefined;
  }

  const target = normalizeProviderTarget(outputRecord.target, planned.target);
  const observation = normalizeProviderObservation(outputRecord.observation);
  const health = stringField(outputRecord, "health") as ShellExecutionHealth | undefined;
  if (target === undefined || observation === undefined || health === undefined || !executionHealth.has(health)) {
    return undefined;
  }

  const idleMs = finiteNumberField(outputRecord, "idleMs");
  if (
    (outputRecord.idleMs !== undefined && idleMs === undefined) ||
    (idleMs !== undefined && (!Number.isInteger(idleMs) || idleMs < 0))
  ) {
    return undefined;
  }

  return {
    ...planned,
    target,
    observation,
    health,
    idleMs,
    dryRun: false,
    realProcessReadBlocked: false,
  };
}

export async function executeShellExecutionMonitoring(request: ShellExecutionMonitoringBestPracticeRequest = {}): Promise<ShellExecutionMonitoringResult> {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context);
  if (runtimeIdIsMalformed(context)) {
    return runtimeFailure("INVALID_RUNTIME_ID", "shell.executionMonitoring context.runtimeId must be a string when provided", "input", requestRecord);
  }

  const executor = jsonRecord(requestRecord.executor) as BaseToolExecutorPort | undefined;
  const provider = typeof requestRecord.provider === "function" ? requestRecord.provider as ShellExecutionMonitoringProvider : undefined;
  const preferredProvider = typeof requestRecord.preferredProvider === "string"
    ? requestRecord.preferredProvider as ShellExecutionMonitoringPracticeProviderName
    : undefined;
  const selection = selectShellExecutionMonitoringPractice({
    executor,
    provider,
    preferredProvider,
  });
  const auditMetadata = { ...contextAuditMetadata(context), ...practiceAuditMetadata(selection) };
  const planned = monitorShellExecutionCore({
    ...requestRecord,
    context: { ...context, dryRun: true, auditMetadata },
  } as ShellExecutionMonitoringRequest);
  if (!planned.ok || context?.dryRun !== false) {
    return planned as ShellExecutionMonitoringResult;
  }

  if (!hasAffirmativeGuard(context)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.executionMonitoring requires an affirmative runtime guard before real provider dispatch",
      "governance",
      requestRecord,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.executionMonitoring requires a runtime shell interaction provider for real dispatch",
      "provider",
      requestRecord,
    );
  }

  try {
    const providerOutput = await selection.provider(
      { ...requestRecord, context: { ...context, auditMetadata } } as ShellExecutionMonitoringRequest,
      { ...context, auditMetadata } as NonNullable<ShellExecutionMonitoringRequest["context"]>,
    );
    const output = normalizeProviderOutput(providerOutput, planned.output);
    if (output === undefined) {
      return runtimeFailure("PROVIDER_REJECTED", providerContractMessage("shell.executionMonitoring"), "provider", requestRecord);
    }

    return {
      ok: true,
      toolId: "shell.executionMonitoring",
      output,
      audit: planned.audit,
      events: ["basicTool.shell.executionMonitoring.monitored"],
    } as unknown as ShellExecutionMonitoringResult;
  } catch {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage("shell.executionMonitoring"),
      "provider",
      requestRecord,
    );
  }
}

export const executionMonitoringBaseToolDefinition = createShellBaseToolDefinition<ShellExecutionMonitoringHandlerInput, ShellExecutionMonitoringOutput>({
  toolId: "shell.executionMonitoring",
  title: "Shell Execution Monitoring",
  description: "Monitor shell execution state supplied or read by the runtime shell interaction port.",
  summary: "Use shell.executionMonitoring to observe runtime-owned shell execution state.",
  storageGroup: "shellInteraction",
  riskLevel: "risky",
  permissionHints: ["shell:execution:monitor"],
  dependencies: executionMonitoringDependencyDeclarations,
  inputSchema: jsonSchema("shell.executionMonitoring.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.executionMonitoring.output", { type: "object", additionalProperties: true }),
});

export const executionMonitoringHandler: BaseToolHandler<ShellExecutionMonitoringHandlerInput, ShellExecutionMonitoringOutput> = {
  definition: executionMonitoringBaseToolDefinition,
  async invoke(request) {
    const input = jsonRecord(request.input) ?? {};
    const inputContext = jsonRecord(input.context);
    const result = await executeShellExecutionMonitoring({
      ...input,
      executor: request.executor,
      context: {
        ...inputContext,
        runtimeId: inputContext?.runtimeId === undefined ? request.runtimeId : inputContext.runtimeId,
        sessionId: inputContext?.sessionId === undefined ? request.sessionId : inputContext.sessionId,
        invocationId: inputContext?.invocationId === undefined ? request.toolCallId : inputContext.invocationId,
        auditMetadata: injectRuntimeInvocationMetadata(request.metadata, contextAuditMetadata(inputContext), request),
      },
    } as unknown as ShellExecutionMonitoringBestPracticeRequest);

    if (!result.ok) {
      return {
        ok: false,
        toolId: result.toolId,
        error: { code: result.error.code, message: result.error.message, publicSafe: true },
        events: result.events,
      };
    }

    return {
      ok: true,
      toolId: result.toolId,
      output: result.output,
      events: result.events,
      metadata: { audit: result.audit },
    };
  },
};
