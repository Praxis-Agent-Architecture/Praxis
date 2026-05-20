import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { buildShellPracticeAuditMetadata, createShellBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicShellRuntimeObservationPractice } from "./anthropic.js";
import { deepmindShellRuntimeObservationPractice } from "./deepmind.js";
import { openaiShellRuntimeObservationPractice } from "./openai.js";
import {
  observeShellRuntime as observeShellRuntimeCore,
  type ShellRuntimeObservationOutput,
  type ShellRuntimeObservationProvider,
  type ShellRuntimeObservationRequest,
  type ShellRuntimeObservationResult,
} from "./core.js";
import {
  shellRuntimeObservationDependencyDeclarations,
  type ShellRuntimeObservationDependencies,
  type ShellRuntimeObservationPracticeProviderName,
  type ShellRuntimeObservationProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellRuntimeObservationBestPracticeRequest = ShellRuntimeObservationRequest & { executor?: BaseToolExecutorPort; preferredProvider?: ShellRuntimeObservationPracticeProviderName; provider?: ShellRuntimeObservationProvider };
export type ShellRuntimeObservationHandlerInput = Omit<ShellRuntimeObservationBestPracticeRequest, "executor">;
export type ShellRuntimeObservationPracticeSelection = { providerName: ShellRuntimeObservationPracticeProviderName; practice: ShellRuntimeObservationProviderPractice; provider?: ShellRuntimeObservationProvider };

export const shellRuntimeObservationProviderPractices = [anthropicShellRuntimeObservationPractice, openaiShellRuntimeObservationPractice, deepmindShellRuntimeObservationPractice] as const;
export const shellRuntimeObservationBestPracticeDescriptor = { toolId: "shell.runtimeObservation", bestPractice: "runtime-execEngine-shellExecution-observeRuntimeEvents", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellRuntimeObservationDependencyDeclarations } as const;

function orderedPractices(preferredProvider: ShellRuntimeObservationPracticeProviderName | undefined): readonly ShellRuntimeObservationProviderPractice[] {
  if (preferredProvider === undefined) return shellRuntimeObservationProviderPractices;
  return [...shellRuntimeObservationProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellRuntimeObservationProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectShellRuntimeObservationPractice(dependencies: ShellRuntimeObservationDependencies & { preferredProvider?: ShellRuntimeObservationPracticeProviderName } = {}): ShellRuntimeObservationPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell runtime event provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: ShellRuntimeObservationPracticeSelection): Readonly<Record<string, unknown>> {
  return buildShellPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function hasAffirmativeGuard(context: unknown): boolean {
  if (typeof context !== "object" || context === null) return false;
  const guard = (context as { guard?: { allowed?: unknown; accepted?: unknown } }).guard;
  return guard?.allowed === true || guard?.accepted === true;
}

function runtimeFailure(code: "MISSING_EXECUTION_ID" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED", message: string, boundary: "input" | "permission" | "contract" | "runtime", request: ShellRuntimeObservationBestPracticeRequest): ShellRuntimeObservationResult {
  return { ok: false, toolId: "shell.runtimeObservation", error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [{ type: "agentCore.basicTool.shell.runtimeObservation.rejected", toolId: "shell.runtimeObservation", invocationId: stringValue(request.context?.invocationId) ?? "shell.runtimeObservation:runtime", dryRun: request.context?.dryRun !== false, executionId: stringValue(request.executionId), metadata: { ...(request.context?.auditMetadata ?? {}), code, boundary } }], events: ["basicTool.shell.runtimeObservation.rejected"] };
}

function hasCallerRuntimeObservationMaterial(request: ShellRuntimeObservationBestPracticeRequest): boolean {
  return request.events !== undefined || request.maxEvents !== undefined || request.runtimeObservationError !== undefined;
}

function validateCallerRuntimeObservationMaterial(
  request: ShellRuntimeObservationBestPracticeRequest,
  executionId: string,
  auditMetadata: Readonly<Record<string, unknown>>,
): ShellRuntimeObservationResult | undefined {
  if (!hasCallerRuntimeObservationMaterial(request)) return undefined;
  const validation = observeShellRuntimeCore({
    ...request,
    executionId,
    events: request.events === undefined ? [{ type: "runtime.validation" }] : request.events,
    context: { ...request.context, dryRun: true, auditMetadata },
  });
  return validation.ok ? undefined : validation;
}

export async function executeShellRuntimeObservation(request: ShellRuntimeObservationBestPracticeRequest = {}): Promise<ShellRuntimeObservationResult> {
  const selection = selectShellRuntimeObservationPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  const auditMetadata = { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) };
  if (request.context?.dryRun !== false) return observeShellRuntimeCore({ ...request, context: { ...request.context, auditMetadata } });

  const executionId = stringValue(request.executionId);
  if (executionId === undefined) return runtimeFailure("MISSING_EXECUTION_ID", "shell.runtimeObservation requires an executionId", "input", request);
  if (Array.isArray(request.context?.grantedPermissions) && !request.context.grantedPermissions.includes("shell:observe")) return runtimeFailure("PERMISSION_DENIED", "shell.runtimeObservation is missing permission: shell:observe", "permission", request);
  if (!hasAffirmativeGuard(request.context)) return runtimeFailure("GOVERNANCE_REJECTED", "shell.runtimeObservation requires an affirmative runtime guard before real provider dispatch", "runtime", request);
  const callerMaterialFailure = validateCallerRuntimeObservationMaterial(request, executionId, auditMetadata);
  if (callerMaterialFailure !== undefined) return callerMaterialFailure;
  if (selection.provider === undefined) return runtimeFailure("PROVIDER_UNAVAILABLE", "shell.runtimeObservation requires a runtime shell monitor provider for real dispatch", "runtime", request);

  try {
    const providerOutput = await selection.provider({ executionId, command: stringValue(request.command), events: request.events, maxEvents: request.maxEvents }, { ...request.context, auditMetadata });
    const result = observeShellRuntimeCore({ ...request, ...providerOutput, executionId, context: { ...request.context, dryRun: true, auditMetadata } });
    if (!result.ok) return result;
    return { ...result, output: { ...result.output, dryRun: false, providerCalled: true }, events: [`basicTool.shell.runtimeObservation.${result.output.status}`] };
  } catch {
    return runtimeFailure("PROVIDER_REJECTED", "shell.runtimeObservation provider rejected the request", "runtime", request);
  }
}

export const shellRuntimeObservationBaseToolDefinition = createShellBaseToolDefinition<ShellRuntimeObservationHandlerInput, ShellRuntimeObservationOutput>({
  toolId: "shell.runtimeObservation", title: "Shell Runtime Observation", description: "Summarize runtime-owned shell execution events.", summary: "Use shell.runtimeObservation to summarize shell lifecycle/output events supplied by runtime.", storageGroup: "executionMonitoring", riskLevel: "normal", permissionHints: ["shell:observe"], dependencies: shellRuntimeObservationDependencyDeclarations,
  inputSchema: jsonSchema("shell.runtimeObservation.input", { type: "object", additionalProperties: true, properties: { executionId: { type: "string" }, command: { type: "string" }, events: { type: "array", items: { type: "object", additionalProperties: true } }, maxEvents: { type: "integer", minimum: 1 }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.runtimeObservation.output", { type: "object", additionalProperties: true }),
});

export const shellRuntimeObservationHandler: BaseToolHandler<ShellRuntimeObservationHandlerInput, ShellRuntimeObservationOutput> = {
  definition: shellRuntimeObservationBaseToolDefinition,
  async invoke(request) {
    const result = await executeShellRuntimeObservation({ ...request.input, executor: request.executor, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(request.metadata, request.input.context?.auditMetadata, request) } });
    if (!result.ok) return { ok: false, toolId: result.toolId, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
    return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
  },
};
