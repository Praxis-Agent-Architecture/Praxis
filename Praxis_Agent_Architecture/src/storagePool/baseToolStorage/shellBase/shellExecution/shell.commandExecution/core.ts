/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 执行。
 * 核心目的：提供 Shell 基础工具 / Shell 执行 中的“执行命令”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellExecutionBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "resource"
  | "permission"
  | "provider";

export type ShellExecutionGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type ShellToolContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ShellExecutionGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellExecutionContext = ShellToolContext;

export type ShellCommandExecutionProviderRequest = {
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  stdin?: string;
};

export type ShellCommandExecutionProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ShellCommandExecutionProvider = (
  request: ShellCommandExecutionProviderRequest,
  context: ShellToolContext,
) => ShellCommandExecutionProviderResult | Promise<ShellCommandExecutionProviderResult>;

export type ShellCommandExecutionRequest = {
  context?: ShellExecutionContext;
  command?: string;
  args?: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs?: number;
  stdin?: string;
  provider?: ShellCommandExecutionProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellCommandExecutionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_COMMAND"
  | "INVALID_COMMAND"
  | "INVALID_ARGUMENT"
  | "INVALID_CWD"
  | "INVALID_TIMEOUT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_COMMAND_EXECUTION_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellCommandExecutionError = {
  code: ShellCommandExecutionErrorCode;
  message: string;
  boundary: ShellExecutionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellToolSuccessEnvelope<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly ShellToolAuditEvent[];
  events: readonly string[];
};

export type ShellToolFailureEnvelope = {
  ok: false;
  toolId: string;
  error: ShellCommandExecutionError;
  audit: readonly ShellToolAuditEvent[];
  events: readonly string[];
};

export type ShellToolResult<Output> = ShellToolSuccessEnvelope<Output> | ShellToolFailureEnvelope;

export type ShellCommandExecutionPlan = {
  toolId: "shell.commandExecution";
  capability: "execute-command";
  runtimeId: string;
  invocationId: string;
  command: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs: number;
  requiredPermissions: readonly ["shell:execute:dry-run"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldSpawnProcess: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  outputEnvelope: {
    exitCode?: number;
    stdoutPreview: "";
    stderrPreview: "";
    started: false;
  };
  audit: {
    guard: "shell-command-dry-run-approval";
    event: "basicTool.shell.commandExecution.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ShellCommandExecutionResult =
  | {
      ok: true;
      plan: ShellCommandExecutionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShellCommandExecutionError;
      events: readonly string[];
    };

type ShellCommandExecutionFailure = Extract<ShellCommandExecutionResult, { ok: false }>;

export type ShellCommandExecutionOutput = {
  kind: "agentCore.basicTool.shell.commandExecution";
  command: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs: number;
  dryRun: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  permissionsRequired: readonly ["shell:execute"];
  unsafeSideEffects: false;
};

type NormalizedShellCommandExecution = {
  runtimeId: string;
  invocationId: string;
  command: string;
  args: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs: number;
  acceptedScopes: readonly string[];
};

export const shellCommandExecutionDescriptor = {
  toolId: "shell.commandExecution",
  capability: "execute-command",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  permissionsRequired: ["shell:execute"],
  unsafeSideEffects: false,
  requiresTapApproval: true,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: ShellToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellToolContext | undefined, runtimeId: string, command: string): string {
  return context?.invocationId?.trim() || `${runtimeId}:shell.commandExecution:${command}`;
}

function guardRejected(guard: ShellExecutionGate | undefined): boolean {
  return guard?.accepted === false || guard?.allowed === false;
}

function auditEvent(
  type: string,
  context: ShellToolContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellToolAuditEvent {
  return {
    type,
    toolId: shellCommandExecutionDescriptor.toolId,
    invocationId: context?.invocationId?.trim() || `${shellCommandExecutionDescriptor.toolId}:dry-run`,
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellCommandExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
  context?: ShellToolContext,
): ShellCommandExecutionFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.shell.commandExecution.rejected"],
  };
}

function toolFailure(
  code: ShellCommandExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
  context?: ShellToolContext,
): ShellToolFailureEnvelope {
  return {
    ok: false,
    toolId: shellCommandExecutionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.shell.commandExecution.rejected", context, { code, boundary })],
    events: ["basicTool.shell.commandExecution.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellCommandExecutionFailure {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `shell.commandExecution scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function normalizeCommand(value: string | undefined): string | ShellCommandExecutionFailure {
  if (isBlank(value)) {
    return failure("MISSING_COMMAND", "shell.commandExecution requires command", "input");
  }

  const command = value?.trim() ?? "";
  if (command.includes("\0") || /[\r\n]/u.test(command)) {
    return failure("INVALID_COMMAND", "shell.commandExecution command must be a single safe command token", "input");
  }

  return command;
}

function normalizeArgs(values: readonly string[] | undefined): string[] | ShellCommandExecutionFailure {
  const args = values ?? [];
  const normalized: string[] = [];

  for (const arg of args) {
    if (typeof arg !== "string" || arg.includes("\0")) {
      return failure("INVALID_ARGUMENT", "shell.commandExecution args must be safe strings", "input");
    }

    if (arg.length > 8192) {
      return failure("INVALID_ARGUMENT", "shell.commandExecution args must stay within resource limits", "resource");
    }

    normalized.push(arg);
  }

  return normalized;
}

function normalizeCwd(value: string | undefined): string | ShellCommandExecutionFailure | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "shell.commandExecution cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizeTimeout(value: number | undefined): number | ShellCommandExecutionFailure {
  const timeoutMs = value ?? shellCommandExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellCommandExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.commandExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

function normalizeShellCommandExecution(
  request: ShellCommandExecutionRequest,
  options: { allowRealExecution: boolean },
): NormalizedShellCommandExecution | ShellCommandExecutionFailure {
  const runtimeId = request.context?.runtimeId?.trim() ?? "";
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.commandExecution requires context.runtimeId for audit", "input");
  }

  if (!options.allowRealExecution && request.context?.dryRun === false) {
    return failure(
      "REAL_COMMAND_EXECUTION_NOT_ALLOWED",
      "first-round shell.commandExecution only creates a dry-run command plan",
      "contract",
    );
  }

  if (guardRejected(request.context?.guard)) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context?.guard?.reason ?? "shell.commandExecution was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const command = normalizeCommand(request.command);
  if (typeof command !== "string") {
    return command;
  }

  const args = normalizeArgs(request.args);
  if (!Array.isArray(args)) {
    return args;
  }

  const cwd = normalizeCwd(request.cwd);
  if (cwd !== undefined && typeof cwd !== "string") {
    return cwd;
  }

  const timeoutMs = normalizeTimeout(request.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  return {
    runtimeId,
    invocationId: invocationId(request.context, runtimeId, command),
    command,
    args,
    cwd,
    shellType: request.shellType?.trim() || undefined,
    timeoutMs,
    acceptedScopes,
  };
}

function isCommandExecutionResult(value: NormalizedShellCommandExecution | ShellCommandExecutionResult): value is ShellCommandExecutionResult {
  return "ok" in value;
}

function isCommandExecutionFailure(
  value: NormalizedShellCommandExecution | ShellCommandExecutionResult,
): value is ShellCommandExecutionFailure {
  return "ok" in value && !value.ok;
}

export function planShellCommandExecution(request: ShellCommandExecutionRequest = {}): ShellCommandExecutionResult {
  const normalized = normalizeShellCommandExecution(request, { allowRealExecution: false });
  if (isCommandExecutionResult(normalized)) {
    return normalized;
  }

  return {
    ok: true,
    plan: {
      toolId: "shell.commandExecution",
      capability: "execute-command",
      runtimeId: normalized.runtimeId,
      invocationId: normalized.invocationId,
      command: normalized.command,
      args: normalized.args,
      cwd: normalized.cwd,
      shellType: normalized.shellType,
      timeoutMs: normalized.timeoutMs,
      requiredPermissions: ["shell:execute:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      unsafeSideEffects: false,
      acceptedScopes: normalized.acceptedScopes,
      outputEnvelope: {
        stdoutPreview: "",
        stderrPreview: "",
        started: false,
      },
      audit: {
        guard: "shell-command-dry-run-approval",
        event: "basicTool.shell.commandExecution.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.shell.commandExecution.planned"],
  };
}

function dryRunOutput(normalized: NormalizedShellCommandExecution): ShellCommandExecutionOutput {
  return {
    kind: "agentCore.basicTool.shell.commandExecution",
    command: normalized.command,
    args: normalized.args,
    cwd: normalized.cwd,
    shellType: normalized.shellType,
    timeoutMs: normalized.timeoutMs,
    dryRun: true,
    providerCalled: false,
    stdout: "",
    stderr: "",
    permissionsRequired: shellCommandExecutionDescriptor.permissionsRequired,
    unsafeSideEffects: false,
  };
}

export async function executeShellCommand(
  request: ShellCommandExecutionRequest = {},
): Promise<ShellToolResult<ShellCommandExecutionOutput>> {
  const normalized = normalizeShellCommandExecution(request, { allowRealExecution: true });
  if (isCommandExecutionFailure(normalized)) {
    return toolFailure(
      normalized.error.code,
      normalized.error.message,
      normalized.error.boundary,
      request.context,
    );
  }

  if (dryRunEnabled(request.context)) {
    return {
      ok: true,
      toolId: shellCommandExecutionDescriptor.toolId,
      output: dryRunOutput(normalized),
      audit: [
        auditEvent("agentCore.basicTool.shell.commandExecution.dryRun", request.context, {
          command: normalized.command,
          timeoutMs: normalized.timeoutMs,
        }),
      ],
      events: ["basicTool.shell.commandExecution.dryRun"],
    };
  }

  if (request.provider === undefined) {
    return toolFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.commandExecution requires a runtime-provided shell executor when dryRun is false",
      "provider",
      request.context,
    );
  }

  try {
    const providerResult = await request.provider(
      {
        command: normalized.command,
        args: normalized.args,
        cwd: normalized.cwd,
        timeoutMs: normalized.timeoutMs,
        stdin: request.stdin,
      },
      request.context ?? {},
    );

    return {
      ok: true,
      toolId: shellCommandExecutionDescriptor.toolId,
      output: {
        kind: "agentCore.basicTool.shell.commandExecution",
        command: normalized.command,
        args: normalized.args,
        cwd: normalized.cwd,
        shellType: normalized.shellType,
        timeoutMs: normalized.timeoutMs,
        dryRun: false,
        providerCalled: true,
        exitCode: providerResult.exitCode,
        stdout: providerResult.stdout,
        stderr: providerResult.stderr,
        permissionsRequired: shellCommandExecutionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.shell.commandExecution.provider", request.context, {
          command: normalized.command,
          exitCode: providerResult.exitCode,
        }),
      ],
      events: ["basicTool.shell.commandExecution.providerCalled"],
    };
  } catch (error) {
    return toolFailure(
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "shell.commandExecution provider rejected the invocation",
      "provider",
      request.context,
    );
  }
}
