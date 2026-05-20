import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { ShellToolAuditEvent, ShellToolContext, ShellToolResult } from "../../shellExecution/shell.commandExecution/core.js";
import { anthropicShellProcessManagementPractice } from "./anthropic.js";
import { deepmindShellProcessManagementPractice } from "./deepmind.js";
import { openaiShellProcessManagementPractice } from "./openai.js";
import { planShellProcessManagement, type ShellProcessManagementOutput, type ShellProcessManagementRequest } from "./core.js";
import { shellProcessManagementDependencyDeclarations, type ShellProcessManagementDependencies, type ShellProcessManagementPracticeProviderName, type ShellProcessManagementProvider, type ShellProcessManagementProviderPractice } from "./dependencies.js";

export * from "./core.js";

export type ShellProcessManagementBestPracticeRequest = ShellProcessManagementRequest & { executor?: ShellProcessManagementDependencies["executor"]; provider?: ShellProcessManagementProvider; preferredProvider?: ShellProcessManagementPracticeProviderName };
export type ShellProcessManagementHandlerInput = Omit<ShellProcessManagementBestPracticeRequest, "executor" | "provider">;
export type ShellProcessManagementPracticeSelection = { providerName: ShellProcessManagementPracticeProviderName; practice: ShellProcessManagementProviderPractice; provider?: ShellProcessManagementProvider };

export const shellProcessManagementProviderPractices = [anthropicShellProcessManagementPractice, openaiShellProcessManagementPractice, deepmindShellProcessManagementPractice] as const;
export const shellProcessManagementBestPracticeDescriptor = { toolId: "shell.shellProcessManagement", bestPractice: "runtime-governed-shell-process-management", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellProcessManagementDependencyDeclarations } as const;

function orderedPractices(preferredProvider: ShellProcessManagementPracticeProviderName | undefined): readonly ShellProcessManagementProviderPractice[] {
  if (preferredProvider === undefined) return shellProcessManagementProviderPractices;
  return [...shellProcessManagementProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellProcessManagementProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectShellProcessManagementPractice(dependencies: ShellProcessManagementDependencies & { preferredProvider?: ShellProcessManagementPracticeProviderName } = {}): ShellProcessManagementPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell process management provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}

function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function isPlainRequest(value: unknown): value is ShellProcessManagementBestPracticeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function runtimeContext(input: ShellProcessManagementRequest): ShellToolContext { return (input.context ?? {}) as ShellToolContext; }
function guardAllows(context: ShellToolContext): boolean { return context.guard?.allowed === true || context.guard?.accepted === true; }
function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return { type, toolId: "shell.shellProcessManagement", invocationId: stringValue(context.invocationId)?.trim() || "shell.shellProcessManagement:dry-run", dryRun: context.dryRun !== false, metadata: { ...(context.auditMetadata ?? {}), ...(metadata ?? {}) } };
}
function failure(code: string, message: string, boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", context?: ShellToolContext): ShellToolResult<ShellProcessManagementOutput, string> {
  return { ok: false, toolId: "shell.shellProcessManagement", error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("agentCore.basicTool.shell.shellProcessManagement.rejected", context ?? {}, { code, boundary })], events: ["basicTool.shell.shellProcessManagement.rejected"] };
}
function convertPlanResult(result: ReturnType<typeof planShellProcessManagement>): ShellToolResult<ShellProcessManagementOutput, string> {
  if (!result.ok) return { ok: false, toolId: "shell.shellProcessManagement", error: { code: result.error.code, message: result.error.message, boundary: result.error.boundary as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", safeForRuntimeInspection: true, internalDetailExposed: false }, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
  return { ok: true, toolId: "shell.shellProcessManagement", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

export async function executeShellProcessManagement(request: ShellProcessManagementBestPracticeRequest = {}): Promise<ShellToolResult<ShellProcessManagementOutput, string>> {
  if (!isPlainRequest(request)) return failure("INVALID_REQUEST", "shell.shellProcessManagement request must be a JSON object", "input");
  if (request.context?.dryRun !== false) return convertPlanResult(planShellProcessManagement(request));
  const context = runtimeContext(request);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) return failure("MISSING_RUNTIME_ID", "shell.shellProcessManagement requires context.runtimeId for real execution audit", "input", context);
  if (!guardAllows(context)) return failure("GOVERNANCE_REJECTED", "shell.shellProcessManagement requires an allowed runtime governance guard when dryRun is false", "governance", context);
  const planned = planShellProcessManagement({ ...request, context: { ...(request.context ?? {}), dryRun: true } });
  if (!planned.ok) return convertPlanResult(planned);
  const selection = selectShellProcessManagementPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  if (selection.provider === undefined) return failure("PROVIDER_UNAVAILABLE", "shell.shellProcessManagement requires a runtime-provided process provider when dryRun is false", "provider", context);
  try {
    const providerRequest: ShellProcessManagementRequest = { ...request, target: { action: planned.output.action, sessionId: planned.output.sessionId, processId: planned.output.processId, signal: planned.output.signal, priority: planned.output.priority, reason: planned.output.reason } };
    const providerOutput = await selection.provider(providerRequest, context);
    return { ok: true, toolId: "shell.shellProcessManagement", output: { ...planned.output, ...providerOutput, dryRun: false, processChangeBlocked: false, providerCalled: true } as unknown as ShellProcessManagementOutput, audit: [auditEvent("agentCore.basicTool.shell.shellProcessManagement.provider", context, { providerName: selection.providerName })], events: ["basicTool.shell.shellProcessManagement.providerCalled"] };
  } catch {
    return failure("PROVIDER_REJECTED", "shell.shellProcessManagement provider rejected the invocation", "provider", context);
  }
}

export const shellProcessManagementBaseToolDefinition = createShellBaseToolDefinition<ShellProcessManagementHandlerInput, ShellProcessManagementOutput>({
  toolId: "shell.shellProcessManagement",
  title: "Shell Process Management",
  description: "Plan or execute shell process management through a governed runtime provider.",
  summary: "Use shell.shellProcessManagement when TAP/runtime owns process inspection, signaling, reaping, or priority policy.",
  storageGroup: "shellManagement",
  riskLevel: "risky",
  permissionHints: ["shell:process:manage"],
  dependencies: shellProcessManagementDependencyDeclarations,
  inputSchema: jsonSchema("shell.shellProcessManagement.input", { type: "object", additionalProperties: true, properties: { target: { type: "object", additionalProperties: true }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.shellProcessManagement.output", { type: "object", additionalProperties: true, required: ["kind", "dryRun"], properties: { kind: { const: "agentCore.basicTool.shell.shellProcessManagement" }, dryRun: { type: "boolean" } } }),
});

export const shellProcessManagementHandler: BaseToolHandler<ShellProcessManagementHandlerInput, ShellProcessManagementOutput> = createShellCoreHandler(
  shellProcessManagementBaseToolDefinition,
  async (request) => executeShellProcessManagement({
    ...request.input,
    executor: request.executor,
    context: {
      ...(request.input.context ?? {}),
      runtimeId: request.input.context?.runtimeId ?? request.runtimeId,
      invocationId: request.input.context?.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(request.metadata, (request.input.context as { auditMetadata?: Readonly<Record<string, unknown>> } | undefined)?.auditMetadata, request),
    },
  }),
);
