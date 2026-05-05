/*
 * 文件定位：storagePool / baseToolStorage / shell.invocationExecution core。
 * 核心目的：把调用对象执行做成 runtime-governed shell 原语，兼容旧 dry-run 计划并支持真实 provider 调用。
 */

import {
  planShellCommandExecution,
  type ShellCommandExecutionErrorCode,
  type ShellCommandExecutionPlan,
  type ShellCommandExecutionProviderResult,
  type ShellExecutionBoundary,
  type ShellExecutionContext,
  type ShellToolAuditEvent,
  type ShellToolContext,
  type ShellToolResult,
} from "../shell.commandExecution/core.js";

export type ShellInvocationEnvironmentEntry = {
  name: string;
  value: string;
};

export type ShellInvocationObject = {
  invocationId?: string;
  executable?: string;
  args?: readonly string[];
  cwd?: string;
  shellType?: string;
  env?: readonly ShellInvocationEnvironmentEntry[];
  timeoutMs?: number;
  stdin?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellInvocationExecutionProviderRequest = {
  invocationId: string;
  executable: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  stdin?: string;
};

export type ShellInvocationExecutionProvider = (
  request: ShellInvocationExecutionProviderRequest,
  context: ShellToolContext,
) => ShellCommandExecutionProviderResult | Promise<ShellCommandExecutionProviderResult>;

export type ShellInvocationExecutionRequest = {
  context?: ShellExecutionContext;
  invocation?: ShellInvocationObject;
  provider?: ShellInvocationExecutionProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellInvocationExecutionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INVOCATION"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EXECUTABLE"
  | "INVALID_ENVIRONMENT"
  | "INVALID_STDIN"
  | "COMMAND_PLAN_REJECTED"
  | ShellCommandExecutionErrorCode;

export type ShellInvocationExecutionError = {
  code: ShellInvocationExecutionErrorCode;
  message: string;
  boundary: ShellExecutionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellInvocationExecutionPlan = {
  toolId: "shell.invocationExecution";
  capability: "execute-invocation-object";
  runtimeId: string;
  invocationId: string;
  executable: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  env: Readonly<Record<string, string>>;
  commandPlan: ShellCommandExecutionPlan;
  requiredPermissions: readonly ["shell:execute:dry-run"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldSpawnProcess: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    event: "basicTool.shell.invocationExecution.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ShellInvocationExecutionResult =
  | {
      ok: true;
      plan: ShellInvocationExecutionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShellInvocationExecutionError;
      events: readonly string[];
    };

type ShellInvocationExecutionFailure = Extract<ShellInvocationExecutionResult, { ok: false }>;

export type ShellInvocationExecutionOutput = {
  kind: "agentCore.basicTool.shell.invocationExecution";
  invocationId: string;
  executable: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  dryRun: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  permissionsRequired: readonly ["shell:execute"];
  unsafeSideEffects: false;
};

type NormalizedShellInvocationExecution = {
  runtimeId: string;
  invocationId: string;
  executable: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  stdin?: string;
  acceptedScopes: readonly string[];
};

export const shellInvocationExecutionDescriptor = {
  toolId: "shell.invocationExecution",
  capability: "execute-invocation-object",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  permissionsRequired: ["shell:execute"],
  unsafeSideEffects: false,
  requiresTapApproval: true,
  tapOwnsApproval: true,
} as const;

export class ShellInvocationExecutionProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE" as const;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean))];
}

function dryRunEnabled(context: ShellToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function guardRejected(context: ShellToolContext | undefined): boolean {
  return context?.guard?.accepted === false || context?.guard?.allowed === false;
}

function guardAllowsRealExecution(context: ShellToolContext | undefined): boolean {
  return context?.guard?.allowed === true || context?.guard?.accepted === true;
}

function auditEvent(
  type: string,
  context: ShellToolContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellToolAuditEvent {
  return {
    type,
    toolId: shellInvocationExecutionDescriptor.toolId,
    invocationId: stringValue(context?.invocationId)?.trim() || `${shellInvocationExecutionDescriptor.toolId}:dry-run`,
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellInvocationExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
): ShellInvocationExecutionFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.shell.invocationExecution.rejected"],
  };
}

function toolFailure(
  code: ShellInvocationExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
  context?: ShellToolContext,
): Extract<ShellToolResult<ShellInvocationExecutionOutput, ShellInvocationExecutionErrorCode>, { ok: false }> {
  return {
    ok: false,
    toolId: shellInvocationExecutionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.shell.invocationExecution.rejected", context, { code, boundary })],
    events: ["basicTool.shell.invocationExecution.rejected"],
  };
}

function normalizeEnvironment(
  entries: readonly ShellInvocationEnvironmentEntry[] | undefined,
): { ok: true; env: Readonly<Record<string, string>> } | ShellInvocationExecutionFailure {
  const normalized: Record<string, string> = {};

  for (const entry of entries ?? []) {
    if (!isRecord(entry)) {
      return failure(
        "INVALID_ENVIRONMENT",
        "shell.invocationExecution env entries must have safe variable names and string values",
        "input",
      );
    }

    const rawEntry = entry;
    if (typeof rawEntry.name !== "string" || typeof rawEntry.value !== "string") {
      return failure(
        "INVALID_ENVIRONMENT",
        "shell.invocationExecution env entries must have safe variable names and string values",
        "input",
      );
    }

    const name = rawEntry.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || rawEntry.value.includes("\0")) {
      return failure(
        "INVALID_ENVIRONMENT",
        "shell.invocationExecution env entries must have safe variable names and string values",
        "input",
      );
    }

    normalized[name] = rawEntry.value;
  }

  return { ok: true, env: normalized };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellInvocationExecutionFailure {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `shell.invocationExecution scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function normalizeTimeout(value: unknown): number | ShellInvocationExecutionFailure {
  if (value !== undefined && typeof value !== "number") {
    return failure("INVALID_TIMEOUT", "shell.invocationExecution timeoutMs must be between 1 and 600000", "resource");
  }

  const timeoutMs = value ?? shellInvocationExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellInvocationExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.invocationExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

function normalizeStdin(value: unknown): string | ShellInvocationExecutionFailure | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.includes("\0")) {
    return failure("INVALID_STDIN", "shell.invocationExecution stdin must be a safe string", "input");
  }

  return value;
}

function normalizeShellInvocationExecution(
  request: ShellInvocationExecutionRequest,
): NormalizedShellInvocationExecution | ShellInvocationExecutionFailure {
  const runtimeId = stringValue(request.context?.runtimeId)?.trim() ?? "";
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.invocationExecution requires context.runtimeId for audit", "input");
  }

  if (guardRejected(request.context)) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context?.guard?.reason ?? "shell.invocationExecution was rejected by runtime governance",
      "governance",
    );
  }

  if (!isRecord(request.invocation)) {
    return failure("MISSING_INVOCATION", "shell.invocationExecution requires an invocation object", "input");
  }

  const invocation = request.invocation;
  const invocationId = stringValue(invocation.invocationId)?.trim() || stringValue(request.context?.invocationId)?.trim();
  if (isBlank(invocationId)) {
    return failure("MISSING_INVOCATION_ID", "shell.invocationExecution requires invocation.invocationId", "input");
  }

  if (isBlank(invocation.executable)) {
    return failure("MISSING_EXECUTABLE", "shell.invocationExecution requires invocation.executable", "input");
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const env = normalizeEnvironment(Array.isArray(invocation.env) ? invocation.env : invocation.env === undefined ? undefined : [invocation.env as never]);
  if (!env.ok) {
    return env;
  }

  const timeoutMs = normalizeTimeout(invocation.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  const stdin = normalizeStdin(invocation.stdin);
  if (stdin !== undefined && typeof stdin !== "string") {
    return stdin;
  }

  const commandPlan = planShellCommandExecution({
    context: {
      ...request.context,
      dryRun: true,
      invocationId,
    },
    command: invocation.executable,
    args: invocation.args as readonly string[] | undefined,
    cwd: invocation.cwd as string | undefined,
    shellType: invocation.shellType as string | undefined,
    timeoutMs,
    metadata: {
      ...(request.metadata ?? {}),
      ...(isRecord(invocation.metadata) ? invocation.metadata : {}),
    },
  });

  if (!commandPlan.ok) {
    return failure("COMMAND_PLAN_REJECTED", commandPlan.error.message, commandPlan.error.boundary);
  }

  return {
    runtimeId,
    invocationId: invocationId ?? "",
    executable: commandPlan.plan.command,
    args: commandPlan.plan.args,
    cwd: commandPlan.plan.cwd,
    shellType: commandPlan.plan.shellType,
    env: env.env,
    timeoutMs,
    stdin,
    acceptedScopes,
  };
}

function isInvocationExecutionFailure(
  value: NormalizedShellInvocationExecution | ShellInvocationExecutionFailure,
): value is ShellInvocationExecutionFailure {
  return "ok" in value && !value.ok;
}

export function planShellInvocationExecution(
  request: ShellInvocationExecutionRequest = {},
): ShellInvocationExecutionResult {
  if (request.context?.dryRun === false) {
    return failure(
      "COMMAND_PLAN_REJECTED",
      "first-round shell.commandExecution only creates a dry-run command plan",
      "contract",
    );
  }

  const requestedScopes = cleanList(request.context?.requestedScopes);
  const allowedScopes = cleanList(request.context?.allowedScopes);
  const deniedScope = requestedScopes.find((scope) => !allowedScopes.includes(scope));
  if (deniedScope !== undefined) {
    return failure(
      "COMMAND_PLAN_REJECTED",
      `shell.commandExecution scope ${deniedScope} is outside runtime governance`,
      "scope",
    );
  }

  const normalized = normalizeShellInvocationExecution({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (isInvocationExecutionFailure(normalized)) {
    return normalized;
  }

  const commandResult = planShellCommandExecution({
    context: {
      ...request.context,
      dryRun: true,
      invocationId: normalized.invocationId,
    },
    command: normalized.executable,
    args: normalized.args,
    cwd: normalized.cwd,
    shellType: normalized.shellType,
    timeoutMs: normalized.timeoutMs,
    metadata: {
      ...(request.metadata ?? {}),
      ...(request.invocation?.metadata ?? {}),
    },
  });

  if (!commandResult.ok) {
    return failure("COMMAND_PLAN_REJECTED", commandResult.error.message, commandResult.error.boundary);
  }

  return {
    ok: true,
    plan: {
      toolId: "shell.invocationExecution",
      capability: "execute-invocation-object",
      runtimeId: normalized.runtimeId,
      invocationId: normalized.invocationId,
      executable: normalized.executable,
      args: normalized.args,
      cwd: normalized.cwd,
      shellType: normalized.shellType,
      env: normalized.env,
      commandPlan: commandResult.plan,
      requiredPermissions: ["shell:execute:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      unsafeSideEffects: false,
      acceptedScopes: normalized.acceptedScopes,
      audit: {
        event: "basicTool.shell.invocationExecution.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
          ...(request.invocation?.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.shell.invocationExecution.planned", ...commandResult.events],
  };
}

function dryRunOutput(normalized: NormalizedShellInvocationExecution): ShellInvocationExecutionOutput {
  return {
    kind: "agentCore.basicTool.shell.invocationExecution",
    invocationId: normalized.invocationId,
    executable: normalized.executable,
    args: normalized.args,
    cwd: normalized.cwd,
    shellType: normalized.shellType,
    env: normalized.env,
    timeoutMs: normalized.timeoutMs,
    dryRun: true,
    providerCalled: false,
    stdout: "",
    stderr: "",
    permissionsRequired: shellInvocationExecutionDescriptor.permissionsRequired,
    unsafeSideEffects: false,
  };
}

export async function executeShellInvocation(
  request: ShellInvocationExecutionRequest = {},
): Promise<ShellToolResult<ShellInvocationExecutionOutput, ShellInvocationExecutionErrorCode>> {
  const normalized = normalizeShellInvocationExecution(request);
  if (isInvocationExecutionFailure(normalized)) {
    return toolFailure(normalized.error.code, normalized.error.message, normalized.error.boundary, request.context);
  }

  if (dryRunEnabled(request.context)) {
    return {
      ok: true,
      toolId: shellInvocationExecutionDescriptor.toolId,
      output: dryRunOutput(normalized),
      audit: [
        auditEvent("agentCore.basicTool.shell.invocationExecution.dryRun", request.context, {
          executable: normalized.executable,
          timeoutMs: normalized.timeoutMs,
        }),
      ],
      events: ["basicTool.shell.invocationExecution.dryRun"],
    };
  }

  if (!guardAllowsRealExecution(request.context)) {
    return toolFailure(
      "GOVERNANCE_REJECTED",
      "shell.invocationExecution requires an allowed runtime governance guard when dryRun is false",
      "governance",
      request.context,
    );
  }

  if (request.provider === undefined) {
    return toolFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.invocationExecution requires a runtime-provided shell executor when dryRun is false",
      "provider",
      request.context,
    );
  }

  try {
    const providerResult = await request.provider(
      {
        invocationId: normalized.invocationId,
        executable: normalized.executable,
        args: normalized.args,
        cwd: normalized.cwd,
        shellType: normalized.shellType,
        env: normalized.env,
        timeoutMs: normalized.timeoutMs,
        stdin: normalized.stdin,
      },
      request.context ?? {},
    );

    return {
      ok: true,
      toolId: shellInvocationExecutionDescriptor.toolId,
      output: {
        kind: "agentCore.basicTool.shell.invocationExecution",
        invocationId: normalized.invocationId,
        executable: normalized.executable,
        args: normalized.args,
        cwd: normalized.cwd,
        shellType: normalized.shellType,
        env: normalized.env,
        timeoutMs: normalized.timeoutMs,
        dryRun: false,
        providerCalled: true,
        exitCode: providerResult.exitCode,
        stdout: providerResult.stdout,
        stderr: providerResult.stderr,
        permissionsRequired: shellInvocationExecutionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.shell.invocationExecution.provider", request.context, {
          executable: normalized.executable,
          exitCode: providerResult.exitCode,
        }),
      ],
      events: ["basicTool.shell.invocationExecution.providerCalled"],
    };
  } catch (error) {
    if (error instanceof ShellInvocationExecutionProviderUnavailableError) {
      return toolFailure("PROVIDER_UNAVAILABLE", error.message, "provider", request.context);
    }

    return toolFailure(
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "shell.invocationExecution provider rejected the invocation",
      "provider",
      request.context,
    );
  }
}
