import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { ShellToolAuditEvent, ShellToolContext, ShellToolResult } from "../../shellExecution/shell.commandExecution/core.js";
import { anthropicShellResourceManagementPractice } from "./anthropic.js";
import { deepmindShellResourceManagementPractice } from "./deepmind.js";
import { openaiShellResourceManagementPractice } from "./openai.js";
import { planShellResourceManagement, type ShellResourceManagementOutput, type ShellResourceManagementRequest } from "./core.js";
import { shellResourceManagementDependencyDeclarations, type ShellResourceManagementDependencies, type ShellResourceManagementPracticeProviderName, type ShellResourceManagementProvider, type ShellResourceManagementProviderPractice } from "./dependencies.js";

export * from "./core.js";

export type ShellResourceManagementBestPracticeRequest = ShellResourceManagementRequest & { executor?: ShellResourceManagementDependencies["executor"]; provider?: ShellResourceManagementProvider; preferredProvider?: ShellResourceManagementPracticeProviderName };
export type ShellResourceManagementHandlerInput = Omit<ShellResourceManagementBestPracticeRequest, "executor" | "provider">;
export type ShellResourceManagementPracticeSelection = { providerName: ShellResourceManagementPracticeProviderName; practice: ShellResourceManagementProviderPractice; provider?: ShellResourceManagementProvider };

export const shellResourceManagementProviderPractices = [anthropicShellResourceManagementPractice, openaiShellResourceManagementPractice, deepmindShellResourceManagementPractice] as const;
export const shellResourceManagementBestPracticeDescriptor = { toolId: "shell.shellResourceManagement", bestPractice: "runtime-governed-shell-resource-management", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: shellResourceManagementDependencyDeclarations } as const;

function orderedPractices(preferredProvider: ShellResourceManagementPracticeProviderName | undefined): readonly ShellResourceManagementProviderPractice[] {
  if (preferredProvider === undefined) return shellResourceManagementProviderPractices;
  return [...shellResourceManagementProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...shellResourceManagementProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectShellResourceManagementPractice(dependencies: ShellResourceManagementDependencies & { preferredProvider?: ShellResourceManagementPracticeProviderName } = {}): ShellResourceManagementPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host shell resource management provider is currently available; dry-run remains available."], createProvider: () => undefined } };
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function isPlainRequest(value: unknown): value is ShellResourceManagementBestPracticeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function runtimeContext(input: ShellResourceManagementRequest): ShellToolContext { return (input.context ?? {}) as ShellToolContext; }
function guardAllows(context: ShellToolContext): boolean { return context.guard?.allowed === true || context.guard?.accepted === true; }
function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return { type, toolId: "shell.shellResourceManagement", invocationId: stringValue(context.invocationId)?.trim() || "shell.shellResourceManagement:dry-run", dryRun: context.dryRun !== false, metadata: { ...(context.auditMetadata ?? {}), ...(metadata ?? {}) } };
}
function failure(code: string, message: string, boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", context?: ShellToolContext): ShellToolResult<ShellResourceManagementOutput, string> {
  return { ok: false, toolId: "shell.shellResourceManagement", error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("agentCore.basicTool.shell.shellResourceManagement.rejected", context ?? {}, { code, boundary })], events: ["basicTool.shell.shellResourceManagement.rejected"] };
}
function convertPlanResult(result: ReturnType<typeof planShellResourceManagement>): ShellToolResult<ShellResourceManagementOutput, string> {
  if (!result.ok) return { ok: false, toolId: "shell.shellResourceManagement", error: { code: result.error.code, message: result.error.message, boundary: result.error.boundary as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", safeForRuntimeInspection: true, internalDetailExposed: false }, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
  return { ok: true, toolId: "shell.shellResourceManagement", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}
export async function executeShellResourceManagement(request: ShellResourceManagementBestPracticeRequest = {}): Promise<ShellToolResult<ShellResourceManagementOutput, string>> {
  if (!isPlainRequest(request)) return failure("INVALID_REQUEST", "shell.shellResourceManagement request must be a JSON object", "input");
  if (request.context?.dryRun !== false) return convertPlanResult(planShellResourceManagement(request));
  const context = runtimeContext(request);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) return failure("MISSING_RUNTIME_ID", "shell.shellResourceManagement requires context.runtimeId for real execution audit", "input", context);
  if (!guardAllows(context)) return failure("GOVERNANCE_REJECTED", "shell.shellResourceManagement requires an allowed runtime governance guard when dryRun is false", "governance", context);
  const planned = planShellResourceManagement({ ...request, context: { ...(request.context ?? {}), dryRun: true } });
  if (!planned.ok) return convertPlanResult(planned);
  const selection = selectShellResourceManagementPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  if (selection.provider === undefined) return failure("PROVIDER_UNAVAILABLE", "shell.shellResourceManagement requires a runtime-provided resource provider when dryRun is false", "provider", context);
  try {
    const providerRequest: ShellResourceManagementRequest = { ...request, target: planned.output.target };
    const providerOutput = await selection.provider(providerRequest, context);
    return { ok: true, toolId: "shell.shellResourceManagement", output: { ...planned.output, ...providerOutput, dryRun: false, executionBlocked: false, providerCalled: true } as unknown as ShellResourceManagementOutput, audit: [auditEvent("agentCore.basicTool.shell.shellResourceManagement.provider", context, { providerName: selection.providerName })], events: ["basicTool.shell.shellResourceManagement.providerCalled"] };
  } catch {
    return failure("PROVIDER_REJECTED", "shell.shellResourceManagement provider rejected the invocation", "provider", context);
  }
}
export const shellResourceManagementBaseToolDefinition = createShellBaseToolDefinition<ShellResourceManagementHandlerInput, ShellResourceManagementOutput>({
  toolId: "shell.shellResourceManagement",
  title: "Shell Resource Management",
  description: "Plan or execute shell resource management through a governed runtime provider.",
  summary: "Use shell.shellResourceManagement when TAP/runtime owns shell resource accounting and limit policy.",
  storageGroup: "shellManagement",
  riskLevel: "risky",
  permissionHints: ["shell:resource:inspect", "shell:resource:reserve", "shell:resource:release", "shell:resource:limit"],
  dependencies: shellResourceManagementDependencyDeclarations,
  inputSchema: jsonSchema("shell.shellResourceManagement.input", { type: "object", additionalProperties: true, properties: { target: { type: "object", additionalProperties: true }, context: { type: "object", additionalProperties: true }, preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] } } }),
  outputSchema: jsonSchema("shell.shellResourceManagement.output", { type: "object", additionalProperties: true, required: ["kind", "dryRun"], properties: { kind: { const: "agentCore.basicTool.shell.shellResourceManagement" }, dryRun: { type: "boolean" } } }),
});
export const shellResourceManagementHandler: BaseToolHandler<ShellResourceManagementHandlerInput, ShellResourceManagementOutput> = createShellCoreHandler(
  shellResourceManagementBaseToolDefinition,
  async (request) => executeShellResourceManagement({
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
