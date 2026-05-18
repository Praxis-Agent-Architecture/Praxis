import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { buildShellPracticeAuditMetadata, createShellBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicShellExitCodeCheckingPractice } from "./anthropic.js";
import { deepmindShellExitCodeCheckingPractice } from "./deepmind.js";
import { openaiShellExitCodeCheckingPractice } from "./openai.js";
import {
  checkShellExitCode as checkShellExitCodeCore,
  type ShellExitCodeCheckingOutput,
  type ShellExitCodeCheckingProvider,
  type ShellExitCodeCheckingRequest,
  type ShellExitCodeCheckingResult,
} from "./core.js";
import {
  shellExitCodeCheckingDependencyDeclarations,
  type ShellExitCodeCheckingDependencies,
  type ShellExitCodeCheckingPracticeProviderName,
  type ShellExitCodeCheckingProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellExitCodeCheckingBestPracticeRequest = ShellExitCodeCheckingRequest & { executor?: BaseToolExecutorPort; preferredProvider?: ShellExitCodeCheckingPracticeProviderName; provider?: ShellExitCodeCheckingProvider };
export type ShellExitCodeCheckingHandlerInput = Omit<ShellExitCodeCheckingBestPracticeRequest, "executor">;
export type ShellExitCodeCheckingPracticeSelection = { providerName: ShellExitCodeCheckingPracticeProviderName; practice: ShellExitCodeCheckingProviderPractice; provider?: ShellExitCodeCheckingProvider };

export const shellExitCodeCheckingProviderPractices = [anthropicShellExitCodeCheckingPractice, openaiShellExitCodeCheckingPractice, deepmindShellExitCodeCheckingPractice] as const;
export const shellExitCodeCheckingBestPracticeDescriptor = { toolId: "shell.exitCodeChecking", bestPractice: "runtime-execEngine-shellExecution-monitorExitCode", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellExitCodeCheckingDependencyDeclarations } as const;

function orderedPractices(preferredProvider: ShellExitCodeCheckingPracticeProviderName | undefined): readonly ShellExitCodeCheckingProviderPractice[] {
  if (preferredProvider === undefined) return shellExitCodeCheckingProviderPractices;
  return [...shellExitCodeCheckingProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellExitCodeCheckingProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectShellExitCodeCheckingPractice(dependencies: ShellExitCodeCheckingDependencies & { preferredProvider?: ShellExitCodeCheckingPracticeProviderName } = {}): ShellExitCodeCheckingPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell monitoring provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: ShellExitCodeCheckingPracticeSelection): Readonly<Record<string, unknown>> {
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

function runtimeFailure(code: "MISSING_EXECUTION_ID" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED", message: string, boundary: "input" | "permission" | "contract" | "runtime", request: ShellExitCodeCheckingBestPracticeRequest): ShellExitCodeCheckingResult {
  return { ok: false, toolId: "shell.exitCodeChecking", error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [{ type: "agentCore.basicTool.shell.exitCodeChecking.rejected", toolId: "shell.exitCodeChecking", invocationId: stringValue(request.context?.invocationId) ?? "shell.exitCodeChecking:runtime", dryRun: request.context?.dryRun !== false, executionId: stringValue(request.executionId), metadata: { ...(request.context?.auditMetadata ?? {}), code, boundary } }], events: ["basicTool.shell.exitCodeChecking.rejected"] };
}

function hasRuntimeExitMaterial(request: ShellExitCodeCheckingBestPracticeRequest): boolean {
  return typeof request.exitCode === "number" || typeof request.signal === "string" || request.timedOut === true;
}

function hasInvalidRuntimeExitMaterial(request: ShellExitCodeCheckingBestPracticeRequest): boolean {
  return (
    (request.exitCode !== undefined && request.exitCode !== null && typeof request.exitCode !== "number") ||
    (request.signal !== undefined && request.signal !== null && typeof request.signal !== "string") ||
    (request.timedOut !== undefined && typeof request.timedOut !== "boolean")
  );
}

function validateCallerExitMaterial(
  request: ShellExitCodeCheckingBestPracticeRequest,
  executionId: string,
  auditMetadata: Readonly<Record<string, unknown>>,
): ShellExitCodeCheckingResult | undefined {
  const validationRequest: ShellExitCodeCheckingRequest = {
    ...request,
    executionId,
    ...(hasRuntimeExitMaterial(request) || hasInvalidRuntimeExitMaterial(request) ? {} : { exitCode: 0 }),
    context: { ...request.context, dryRun: true, auditMetadata },
  };
  const validation = checkShellExitCodeCore(validationRequest);
  return validation.ok ? undefined : validation;
}

export async function executeShellExitCodeChecking(request: ShellExitCodeCheckingBestPracticeRequest = {}): Promise<ShellExitCodeCheckingResult> {
  const selection = selectShellExitCodeCheckingPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  const auditMetadata = { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) };
  if (request.context?.dryRun !== false) return checkShellExitCodeCore({ ...request, context: { ...request.context, auditMetadata } });

  const executionId = stringValue(request.executionId);
  if (executionId === undefined) return runtimeFailure("MISSING_EXECUTION_ID", "shell.exitCodeChecking requires an executionId", "input", request);
  if (Array.isArray(request.context?.grantedPermissions) && !request.context.grantedPermissions.includes("shell:observe")) return runtimeFailure("PERMISSION_DENIED", "shell.exitCodeChecking is missing permission: shell:observe", "permission", request);
  if (!hasAffirmativeGuard(request.context)) return runtimeFailure("GOVERNANCE_REJECTED", "shell.exitCodeChecking requires an affirmative runtime guard before real provider dispatch", "runtime", request);
  const callerMaterialFailure = validateCallerExitMaterial(request, executionId, auditMetadata);
  if (callerMaterialFailure !== undefined) return callerMaterialFailure;
  if (selection.provider === undefined) return runtimeFailure("PROVIDER_UNAVAILABLE", "shell.exitCodeChecking requires a runtime shell monitor provider for real dispatch", "runtime", request);

  try {
    const providerOutput = await selection.provider({ executionId, command: stringValue(request.command), exitCode: request.exitCode, signal: request.signal, timedOut: request.timedOut, policy: request.policy }, { ...request.context, auditMetadata });
    const result = checkShellExitCodeCore({ ...request, ...providerOutput, executionId, context: { ...request.context, dryRun: true, auditMetadata } });
    if (!result.ok) return result;
    return { ...result, output: { ...result.output, dryRun: false, providerCalled: true }, events: [`basicTool.shell.exitCodeChecking.${result.output.status}`] };
  } catch {
    return runtimeFailure("PROVIDER_REJECTED", "shell.exitCodeChecking provider rejected the request", "runtime", request);
  }
}

export const shellExitCodeCheckingBaseToolDefinition = createShellBaseToolDefinition<ShellExitCodeCheckingHandlerInput, ShellExitCodeCheckingOutput>({
  toolId: "shell.exitCodeChecking", title: "Shell Exit Code Checking", description: "Classify a runtime-owned shell execution exit observation.", summary: "Use shell.exitCodeChecking to classify exit code, signal, and timeout observations.", storageGroup: "executionMonitoring", riskLevel: "normal", permissionHints: ["shell:observe"], dependencies: shellExitCodeCheckingDependencyDeclarations,
  inputSchema: jsonSchema("shell.exitCodeChecking.input", { type: "object", additionalProperties: true, properties: { executionId: { type: "string" }, command: { type: "string" }, exitCode: { type: ["integer", "null"], minimum: 0, maximum: 255 }, signal: { type: ["string", "null"] }, timedOut: { type: "boolean" }, policy: { type: "object", additionalProperties: true }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.exitCodeChecking.output", { type: "object", additionalProperties: true }),
});

export const shellExitCodeCheckingHandler: BaseToolHandler<ShellExitCodeCheckingHandlerInput, ShellExitCodeCheckingOutput> = {
  definition: shellExitCodeCheckingBaseToolDefinition,
  async invoke(request) {
    const result = await executeShellExitCodeChecking({ ...request.input, executor: request.executor, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(request.metadata, request.input.context?.auditMetadata, request) } });
    if (!result.ok) return { ok: false, toolId: result.toolId, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
    return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
  },
};
