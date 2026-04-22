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

export type ShellExecutionBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "permission";

export type ShellExecutionGate = {
  accepted: boolean;
  reason?: string;
};

export type ShellExecutionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ShellExecutionGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellCommandExecutionRequest = {
  context?: ShellExecutionContext;
  command?: string;
  args?: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs?: number;
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
  | "REAL_COMMAND_EXECUTION_NOT_ALLOWED";

export type ShellCommandExecutionError = {
  code: ShellCommandExecutionErrorCode;
  message: string;
  boundary: ShellExecutionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

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

export const shellCommandExecutionDescriptor = {
  toolId: "shell.commandExecution",
  capability: "execute-command",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ShellCommandExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
): ShellCommandExecutionResult {
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

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellCommandExecutionResult {
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

function normalizeCommand(value: string | undefined): string | ShellCommandExecutionResult {
  if (isBlank(value)) {
    return failure("MISSING_COMMAND", "shell.commandExecution requires command", "input");
  }

  const command = value?.trim() ?? "";
  if (command.includes("\0") || /[\r\n]/u.test(command)) {
    return failure("INVALID_COMMAND", "shell.commandExecution command must be a single safe command token", "input");
  }

  return command;
}

function normalizeArgs(values: readonly string[] | undefined): string[] | ShellCommandExecutionResult {
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

function normalizeCwd(value: string | undefined): string | ShellCommandExecutionResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "shell.commandExecution cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizeTimeout(value: number | undefined): number | ShellCommandExecutionResult {
  const timeoutMs = value ?? shellCommandExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellCommandExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.commandExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

export function planShellCommandExecution(request: ShellCommandExecutionRequest = {}): ShellCommandExecutionResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.commandExecution requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_COMMAND_EXECUTION_NOT_ALLOWED",
      "first-round shell.commandExecution only creates a dry-run command plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "shell.commandExecution was rejected by runtime governance",
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

  const invocationId = request.context?.invocationId?.trim() || `${runtimeId}:shell.commandExecution:${command}`;

  return {
    ok: true,
    plan: {
      toolId: "shell.commandExecution",
      capability: "execute-command",
      runtimeId: runtimeId ?? "",
      invocationId,
      command,
      args,
      cwd,
      shellType: request.shellType?.trim() || undefined,
      timeoutMs,
      requiredPermissions: ["shell:execute:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      unsafeSideEffects: false,
      acceptedScopes,
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
