import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { ShellToolAuditEvent, ShellToolContext, ShellToolResult } from "../../shellExecution/shell.commandExecution/core.js";
import { anthropicShellSessionManagementPractice } from "./anthropic.js";
import { deepmindShellSessionManagementPractice } from "./deepmind.js";
import { openaiShellSessionManagementPractice } from "./openai.js";
import { planShellSessionManagement, type ShellSessionManagementOutput, type ShellSessionManagementRequest } from "./core.js";
import { shellSessionManagementDependencyDeclarations, type ShellSessionManagementDependencies, type ShellSessionManagementPracticeProviderName, type ShellSessionManagementProvider, type ShellSessionManagementProviderPractice } from "./dependencies.js";

export * from "./core.js";

export type ShellSessionManagementBestPracticeRequest = ShellSessionManagementRequest & { executor?: ShellSessionManagementDependencies["executor"]; provider?: ShellSessionManagementProvider; preferredProvider?: ShellSessionManagementPracticeProviderName };
export type ShellSessionManagementHandlerInput = Omit<ShellSessionManagementBestPracticeRequest, "executor" | "provider">;
export type ShellSessionManagementPracticeSelection = { providerName: ShellSessionManagementPracticeProviderName; practice: ShellSessionManagementProviderPractice; provider?: ShellSessionManagementProvider };
export const shellSessionManagementProviderPractices = [anthropicShellSessionManagementPractice, openaiShellSessionManagementPractice, deepmindShellSessionManagementPractice] as const;
export const shellSessionManagementBestPracticeDescriptor = { toolId: "shell.shellSessionManagement", bestPractice: "runtime-governed-shell-session-management", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellSessionManagementDependencyDeclarations } as const;
function orderedPractices(preferredProvider: ShellSessionManagementPracticeProviderName | undefined): readonly ShellSessionManagementProviderPractice[] {
  if (preferredProvider === undefined) return shellSessionManagementProviderPractices;
  return [...shellSessionManagementProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellSessionManagementProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectShellSessionManagementPractice(dependencies: ShellSessionManagementDependencies & { preferredProvider?: ShellSessionManagementPracticeProviderName } = {}): ShellSessionManagementPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell session management provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function isPlainRequest(value: unknown): value is ShellSessionManagementBestPracticeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function runtimeContext(input: ShellSessionManagementRequest): ShellToolContext { return (input.context ?? {}) as ShellToolContext; }
function guardAllows(context: ShellToolContext): boolean { return context.guard?.allowed === true || context.guard?.accepted === true; }
function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return { type, toolId: "shell.shellSessionManagement", invocationId: stringValue(context.invocationId)?.trim() || "shell.shellSessionManagement:dry-run", dryRun: context.dryRun !== false, metadata: { ...(context.auditMetadata ?? {}), ...(metadata ?? {}) } };
}
function failure(code: string, message: string, boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", context?: ShellToolContext): ShellToolResult<ShellSessionManagementOutput, string> {
  return { ok: false, toolId: "shell.shellSessionManagement", error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("agentCore.basicTool.shell.shellSessionManagement.rejected", context ?? {}, { code, boundary })], events: ["basicTool.shell.shellSessionManagement.rejected"] };
}
function convertPlanResult(result: ReturnType<typeof planShellSessionManagement>): ShellToolResult<ShellSessionManagementOutput, string> {
  if (!result.ok) return { ok: false, toolId: "shell.shellSessionManagement", error: { code: result.error.code, message: result.error.message, boundary: result.error.boundary as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", safeForRuntimeInspection: true, internalDetailExposed: false }, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
  return { ok: true, toolId: "shell.shellSessionManagement", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}
export async function executeShellSessionManagement(request: ShellSessionManagementBestPracticeRequest = {}): Promise<ShellToolResult<ShellSessionManagementOutput, string>> {
  if (!isPlainRequest(request)) return failure("INVALID_REQUEST", "shell.shellSessionManagement request must be a JSON object", "input");
  if (request.context?.dryRun !== false) return convertPlanResult(planShellSessionManagement(request));
  const context = runtimeContext(request);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) return failure("MISSING_RUNTIME_ID", "shell.shellSessionManagement requires context.runtimeId for real execution audit", "input", context);
  if (!guardAllows(context)) return failure("GOVERNANCE_REJECTED", "shell.shellSessionManagement requires an allowed runtime governance guard when dryRun is false", "governance", context);
  const planned = planShellSessionManagement({ ...request, context: { ...(request.context ?? {}), dryRun: true } });
  if (!planned.ok) return convertPlanResult(planned);
  const selection = selectShellSessionManagementPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  if (selection.provider === undefined) return failure("PROVIDER_UNAVAILABLE", "shell.shellSessionManagement requires a runtime-provided session provider when dryRun is false", "provider", context);
  try {
    const providerRequest: ShellSessionManagementRequest = { ...request, target: planned.output.target };
    const providerOutput = await selection.provider(providerRequest, context);
    return { ok: true, toolId: "shell.shellSessionManagement", output: { ...planned.output, ...providerOutput, dryRun: false, executionBlocked: false, providerCalled: true } as unknown as ShellSessionManagementOutput, audit: [auditEvent("agentCore.basicTool.shell.shellSessionManagement.provider", context, { providerName: selection.providerName })], events: ["basicTool.shell.shellSessionManagement.providerCalled"] };
  } catch {
    return failure("PROVIDER_REJECTED", "shell.shellSessionManagement provider rejected the invocation", "provider", context);
  }
}
export const shellSessionManagementBaseToolDefinition = createShellBaseToolDefinition<ShellSessionManagementHandlerInput, ShellSessionManagementOutput>({
  toolId: "shell.shellSessionManagement",
  title: "Shell Session Management",
  description: "Plan or execute shell session management through a governed runtime provider.",
  summary: "Use shell.shellSessionManagement when TAP/runtime owns session create, attach, detach, close, and inspect policy.",
  storageGroup: "shellManagement",
  riskLevel: "risky",
  permissionHints: ["shell:session:inspect", "shell:session:create", "shell:session:attach", "shell:session:close"],
  dependencies: shellSessionManagementDependencyDeclarations,
  inputSchema: jsonSchema("shell.shellSessionManagement.input", { type: "object", additionalProperties: true, properties: { target: { type: "object", additionalProperties: true }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.shellSessionManagement.output", { type: "object", additionalProperties: true, required: ["kind", "dryRun"], properties: { kind: { const: "agentCore.basicTool.shell.shellSessionManagement" }, dryRun: { type: "boolean" } } }),
});
export const shellSessionManagementHandler: BaseToolHandler<ShellSessionManagementHandlerInput, ShellSessionManagementOutput> = createShellCoreHandler(
  shellSessionManagementBaseToolDefinition,
  async (request) => executeShellSessionManagement({
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
