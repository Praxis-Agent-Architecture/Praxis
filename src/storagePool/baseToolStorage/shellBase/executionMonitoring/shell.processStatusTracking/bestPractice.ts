import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { buildShellPracticeAuditMetadata, createShellBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicShellProcessStatusTrackingPractice } from "./anthropic.js";
import { deepmindShellProcessStatusTrackingPractice } from "./deepmind.js";
import { openaiShellProcessStatusTrackingPractice } from "./openai.js";
import {
  trackShellProcessStatus as trackShellProcessStatusCore,
  type ShellProcessStatusTrackingOutput,
  type ShellProcessStatusTrackingProvider,
  type ShellProcessStatusTrackingRequest,
  type ShellProcessStatusTrackingResult,
} from "./core.js";
import {
  shellProcessStatusTrackingDependencyDeclarations,
  type ShellProcessStatusTrackingDependencies,
  type ShellProcessStatusTrackingPracticeProviderName,
  type ShellProcessStatusTrackingProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellProcessStatusTrackingBestPracticeRequest = ShellProcessStatusTrackingRequest & { executor?: BaseToolExecutorPort; preferredProvider?: ShellProcessStatusTrackingPracticeProviderName; provider?: ShellProcessStatusTrackingProvider };
export type ShellProcessStatusTrackingHandlerInput = Omit<ShellProcessStatusTrackingBestPracticeRequest, "executor">;
export type ShellProcessStatusTrackingPracticeSelection = { providerName: ShellProcessStatusTrackingPracticeProviderName; practice: ShellProcessStatusTrackingProviderPractice; provider?: ShellProcessStatusTrackingProvider };

export const shellProcessStatusTrackingProviderPractices = [anthropicShellProcessStatusTrackingPractice, openaiShellProcessStatusTrackingPractice, deepmindShellProcessStatusTrackingPractice] as const;
export const shellProcessStatusTrackingBestPracticeDescriptor = { toolId: "shell.processStatusTracking", bestPractice: "runtime-execEngine-shellExecution-monitorProcessStatus", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellProcessStatusTrackingDependencyDeclarations } as const;

function orderedPractices(preferredProvider: ShellProcessStatusTrackingPracticeProviderName | undefined): readonly ShellProcessStatusTrackingProviderPractice[] {
  if (preferredProvider === undefined) return shellProcessStatusTrackingProviderPractices;
  return [...shellProcessStatusTrackingProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellProcessStatusTrackingProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectShellProcessStatusTrackingPractice(dependencies: ShellProcessStatusTrackingDependencies & { preferredProvider?: ShellProcessStatusTrackingPracticeProviderName } = {}): ShellProcessStatusTrackingPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell process monitor provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: ShellProcessStatusTrackingPracticeSelection): Readonly<Record<string, unknown>> {
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

function runtimeFailure(code: "MISSING_EXECUTION_ID" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED", message: string, boundary: "input" | "permission" | "contract" | "runtime", request: ShellProcessStatusTrackingBestPracticeRequest): ShellProcessStatusTrackingResult {
  return { ok: false, toolId: "shell.processStatusTracking", error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [{ type: "agentCore.basicTool.shell.processStatusTracking.rejected", toolId: "shell.processStatusTracking", invocationId: stringValue(request.context?.invocationId) ?? "shell.processStatusTracking:runtime", dryRun: request.context?.dryRun !== false, executionId: stringValue(request.executionId), metadata: { ...(request.context?.auditMetadata ?? {}), code, boundary } }], events: ["basicTool.shell.processStatusTracking.rejected"] };
}

function hasCallerStatusMaterial(request: ShellProcessStatusTrackingBestPracticeRequest): boolean {
  return request.snapshot !== undefined || request.expectedStatuses !== undefined || request.staleAfterMs !== undefined;
}

function validateCallerProcessStatusMaterial(
  request: ShellProcessStatusTrackingBestPracticeRequest,
  executionId: string,
  auditMetadata: Readonly<Record<string, unknown>>,
): ShellProcessStatusTrackingResult | undefined {
  if (!hasCallerStatusMaterial(request)) return undefined;
  const validation = trackShellProcessStatusCore({
    ...request,
    executionId,
    snapshot: request.snapshot === undefined ? { status: "running" } : request.snapshot,
    context: { ...request.context, dryRun: true, auditMetadata },
  });
  return validation.ok ? undefined : validation;
}

export async function executeShellProcessStatusTracking(request: ShellProcessStatusTrackingBestPracticeRequest = {}): Promise<ShellProcessStatusTrackingResult> {
  const selection = selectShellProcessStatusTrackingPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  const auditMetadata = { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) };
  if (request.context?.dryRun !== false) return trackShellProcessStatusCore({ ...request, context: { ...request.context, auditMetadata } });

  const executionId = stringValue(request.executionId);
  if (executionId === undefined) return runtimeFailure("MISSING_EXECUTION_ID", "shell.processStatusTracking requires an executionId", "input", request);
  if (Array.isArray(request.context?.grantedPermissions) && !request.context.grantedPermissions.includes("shell:observe")) return runtimeFailure("PERMISSION_DENIED", "shell.processStatusTracking is missing permission: shell:observe", "permission", request);
  if (!hasAffirmativeGuard(request.context)) return runtimeFailure("GOVERNANCE_REJECTED", "shell.processStatusTracking requires an affirmative runtime guard before real provider dispatch", "runtime", request);
  const callerMaterialFailure = validateCallerProcessStatusMaterial(request, executionId, auditMetadata);
  if (callerMaterialFailure !== undefined) return callerMaterialFailure;
  if (selection.provider === undefined) return runtimeFailure("PROVIDER_UNAVAILABLE", "shell.processStatusTracking requires a runtime shell monitor provider for real dispatch", "runtime", request);

  try {
    const providerOutput = await selection.provider({ executionId, command: stringValue(request.command), snapshot: request.snapshot, expectedStatuses: request.expectedStatuses, staleAfterMs: request.staleAfterMs }, { ...request.context, auditMetadata });
    const result = trackShellProcessStatusCore({ ...request, ...providerOutput, executionId, context: { ...request.context, dryRun: true, auditMetadata } });
    if (!result.ok) return result;
    return { ...result, output: { ...result.output, dryRun: false, providerCalled: true }, events: [`basicTool.shell.processStatusTracking.${result.output.status}`] };
  } catch {
    return runtimeFailure("PROVIDER_REJECTED", "shell.processStatusTracking provider rejected the request", "runtime", request);
  }
}

export const shellProcessStatusTrackingBaseToolDefinition = createShellBaseToolDefinition<ShellProcessStatusTrackingHandlerInput, ShellProcessStatusTrackingOutput>({
  toolId: "shell.processStatusTracking", title: "Shell Process Status Tracking", description: "Normalize a runtime-owned shell process status snapshot.", summary: "Use shell.processStatusTracking to inspect runtime-supplied process status.", storageGroup: "executionMonitoring", riskLevel: "normal", permissionHints: ["shell:observe"], dependencies: shellProcessStatusTrackingDependencyDeclarations,
  inputSchema: jsonSchema("shell.processStatusTracking.input", { type: "object", additionalProperties: true, properties: { executionId: { type: "string" }, command: { type: "string" }, snapshot: { type: "object", additionalProperties: true }, expectedStatuses: { type: "array", items: { type: "string" } }, staleAfterMs: { type: "integer", minimum: 1 }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.processStatusTracking.output", { type: "object", additionalProperties: true }),
});

export const shellProcessStatusTrackingHandler: BaseToolHandler<ShellProcessStatusTrackingHandlerInput, ShellProcessStatusTrackingOutput> = {
  definition: shellProcessStatusTrackingBaseToolDefinition,
  async invoke(request) {
    const result = await executeShellProcessStatusTracking({ ...request.input, executor: request.executor, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(request.metadata, request.input.context?.auditMetadata, request) } });
    if (!result.ok) return { ok: false, toolId: result.toolId, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
    return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
  },
};
