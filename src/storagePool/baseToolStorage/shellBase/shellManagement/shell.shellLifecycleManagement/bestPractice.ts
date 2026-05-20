import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { ShellToolAuditEvent, ShellToolContext, ShellToolResult } from "../../shellExecution/shell.commandExecution/core.js";
import { anthropicShellLifecycleManagementPractice } from "./anthropic.js";
import { deepmindShellLifecycleManagementPractice } from "./deepmind.js";
import { openaiShellLifecycleManagementPractice } from "./openai.js";
import {
  planShellLifecycleManagement,
  type ShellLifecycleManagementOutput,
  type ShellLifecycleManagementRequest,
} from "./core.js";
import {
  shellLifecycleManagementDependencyDeclarations,
  type ShellLifecycleManagementDependencies,
  type ShellLifecycleManagementPracticeProviderName,
  type ShellLifecycleManagementProvider,
  type ShellLifecycleManagementProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellLifecycleManagementBestPracticeRequest = ShellLifecycleManagementRequest & {
  executor?: ShellLifecycleManagementDependencies["executor"];
  provider?: ShellLifecycleManagementProvider;
  preferredProvider?: ShellLifecycleManagementPracticeProviderName;
};

export type ShellLifecycleManagementHandlerInput = Omit<ShellLifecycleManagementBestPracticeRequest, "executor" | "provider">;

export type ShellLifecycleManagementPracticeSelection = {
  providerName: ShellLifecycleManagementPracticeProviderName;
  practice: ShellLifecycleManagementProviderPractice;
  provider?: ShellLifecycleManagementProvider;
};

export const shellLifecycleManagementProviderPractices = [
  anthropicShellLifecycleManagementPractice,
  openaiShellLifecycleManagementPractice,
  deepmindShellLifecycleManagementPractice,
] as const;

export const shellLifecycleManagementBestPracticeDescriptor = {
  toolId: "shell.shellLifecycleManagement",
  bestPractice: "runtime-governed-shell-lifecycle-management",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellLifecycleManagementDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellLifecycleManagementPracticeProviderName | undefined): readonly ShellLifecycleManagementProviderPractice[] {
  if (preferredProvider === undefined) return shellLifecycleManagementProviderPractices;
  return [
    ...shellLifecycleManagementProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellLifecycleManagementProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellLifecycleManagementPractice(
  dependencies: ShellLifecycleManagementDependencies & { preferredProvider?: ShellLifecycleManagementPracticeProviderName } = {},
): ShellLifecycleManagementPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or host shell lifecycle provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isPlainRequest(value: unknown): value is ShellLifecycleManagementBestPracticeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function runtimeContext(input: ShellLifecycleManagementRequest): ShellToolContext {
  return (input.context ?? {}) as ShellToolContext;
}

function guardAllows(context: ShellToolContext): boolean {
  return context.guard?.allowed === true || context.guard?.accepted === true;
}

function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return {
    type,
    toolId: "shell.shellLifecycleManagement",
    invocationId: stringValue(context.invocationId)?.trim() || "shell.shellLifecycleManagement:dry-run",
    dryRun: context.dryRun !== false,
    metadata: { ...(context.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(code: string, message: string, boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider", context?: ShellToolContext): ShellToolResult<ShellLifecycleManagementOutput, string> {
  return {
    ok: false,
    toolId: "shell.shellLifecycleManagement",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.shellLifecycleManagement.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.shellLifecycleManagement.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellLifecycleManagement>): ShellToolResult<ShellLifecycleManagementOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.shellLifecycleManagement",
      error: {
        code: result.error.code,
        message: result.error.message,
        boundary: result.error.boundary as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider",
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      },
      audit: result.audit as readonly ShellToolAuditEvent[],
      events: result.events,
    };
  }
  return { ok: true, toolId: "shell.shellLifecycleManagement", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

export async function executeShellLifecycleManagement(
  request: ShellLifecycleManagementBestPracticeRequest = {},
): Promise<ShellToolResult<ShellLifecycleManagementOutput, string>> {
  if (!isPlainRequest(request)) {
    return failure("INVALID_REQUEST", "shell.shellLifecycleManagement request must be a JSON object", "input");
  }

  if (request.context?.dryRun !== false) return convertPlanResult(planShellLifecycleManagement(request));

  const context = runtimeContext(request);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.shellLifecycleManagement requires context.runtimeId for real execution audit", "input", context);
  }
  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.shellLifecycleManagement requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellLifecycleManagement({ ...request, context: { ...(request.context ?? {}), dryRun: true } });
  if (!planned.ok) return convertPlanResult(planned);

  const selection = selectShellLifecycleManagementPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.shellLifecycleManagement requires a runtime-provided lifecycle provider when dryRun is false", "provider", context);
  }

  try {
    const providerRequest: ShellLifecycleManagementRequest = {
      ...request,
      target: {
        action: planned.output.action,
        sessionId:
          planned.output.action === "create" && request.target?.sessionId === undefined
            ? undefined
            : planned.output.sessionId,
        shellType: planned.output.shellType,
        workingDirectory: planned.output.workingDirectory,
        idleTimeoutMs: planned.output.idleTimeoutMs,
      },
    };
    const providerOutput = await selection.provider(providerRequest, context);
    return {
      ok: true,
      toolId: "shell.shellLifecycleManagement",
      output: { ...planned.output, ...providerOutput, dryRun: false, lifecycleChangeBlocked: false, providerCalled: true } as unknown as ShellLifecycleManagementOutput,
      audit: [auditEvent("agentCore.basicTool.shell.shellLifecycleManagement.provider", context, { providerName: selection.providerName })],
      events: ["basicTool.shell.shellLifecycleManagement.providerCalled"],
    };
  } catch {
    return failure("PROVIDER_REJECTED", "shell.shellLifecycleManagement provider rejected the invocation", "provider", context);
  }
}

export const shellLifecycleManagementBaseToolDefinition = createShellBaseToolDefinition<ShellLifecycleManagementHandlerInput, ShellLifecycleManagementOutput>({
  toolId: "shell.shellLifecycleManagement",
  title: "Shell Lifecycle Management",
  description: "Plan or execute shell lifecycle management through a governed runtime provider.",
  summary: "Use shell.shellLifecycleManagement when TAP/runtime owns create, attach, suspend, resume, or close policy.",
  storageGroup: "shellManagement",
  riskLevel: "risky",
  permissionHints: ["shell:lifecycle:manage"],
  dependencies: shellLifecycleManagementDependencyDeclarations,
  inputSchema: jsonSchema("shell.shellLifecycleManagement.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.shellLifecycleManagement.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.shellLifecycleManagement" },
      dryRun: { type: "boolean" },
    },
  }),
});

export const shellLifecycleManagementHandler: BaseToolHandler<ShellLifecycleManagementHandlerInput, ShellLifecycleManagementOutput> = createShellCoreHandler(
  shellLifecycleManagementBaseToolDefinition,
  async (request) => executeShellLifecycleManagement({
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
