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

import {
  describeShellWorkspaceWrite,
  shellWorkspaceWriteGuardMessage,
} from "../../_shared/workspaceWriteGuard.js";

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
} & Readonly<Record<string, unknown>>;

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
  | "WORKSPACE_WRITE_REQUIRES_CODE_TOOL"
  | "LONG_RUNNING_FOREGROUND_COMMAND"
  | "CWD_REJECTED"
  | "OUTSIDE_ALLOWED_ROOTS"
  | "SANDBOX_PROVIDER_UNSUPPORTED"
  | "SANDBOX_UNAVAILABLE"
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

export type ShellToolError<Code extends string = ShellCommandExecutionErrorCode> = {
  code: Code;
  message: string;
  boundary: ShellExecutionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellToolFailureEnvelope<Code extends string = ShellCommandExecutionErrorCode> = {
  ok: false;
  toolId: string;
  error: ShellToolError<Code>;
  audit: readonly ShellToolAuditEvent[];
  events: readonly string[];
};

export type ShellToolResult<Output, Code extends string = ShellCommandExecutionErrorCode> =
  | ShellToolSuccessEnvelope<Output>
  | ShellToolFailureEnvelope<Code>;

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
  workspacePathNormalization?: Readonly<Record<string, unknown>>;
  requestedCwd?: string;
  normalizedCwd?: string;
  workspaceRoot?: string;
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function invocationId(context: ShellToolContext | undefined, runtimeId: string, command: string): string {
  return stringValue(context?.invocationId)?.trim() || `${runtimeId}:shell.commandExecution:${command}`;
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
    invocationId: stringValue(context?.invocationId)?.trim() || `${shellCommandExecutionDescriptor.toolId}:dry-run`,
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
  const errorMetadata = objectValue(context?.auditMetadata);
  return {
    ok: false,
    toolId: shellCommandExecutionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
      ...(errorMetadata ?? {}),
    },
    audit: [auditEvent("agentCore.basicTool.shell.commandExecution.rejected", context, { code, boundary })],
    events: ["basicTool.shell.commandExecution.rejected"],
  };
}

function publicSafeProviderErrorCode(error: unknown): ShellCommandExecutionErrorCode {
  if (error instanceof Error && (error.name === "SANDBOX_UNAVAILABLE" || error.name === "SANDBOX_PROVIDER_UNSUPPORTED")) {
    return error.name;
  }
  if (error instanceof Error && (error.name === "CWD_REJECTED" || error.name === "OUTSIDE_ALLOWED_ROOTS")) {
    return error.name;
  }
  return "PROVIDER_REJECTED";
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
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

function normalizeCommand(value: unknown): string | ShellCommandExecutionFailure {
  if (isBlank(value)) {
    return failure("MISSING_COMMAND", "shell.commandExecution requires command", "input");
  }

  const command = stringValue(value)?.trim() ?? "";
  if (command.includes("\0") || /[\r\n]/u.test(command)) {
    return failure("INVALID_COMMAND", "shell.commandExecution command must be a single safe command token", "input");
  }

  return command;
}

function normalizeArgs(values: unknown): string[] | ShellCommandExecutionFailure {
  if (values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    return failure("INVALID_ARGUMENT", "shell.commandExecution args must be safe strings", "input");
  }

  const normalized: string[] = [];

  for (const arg of values) {
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

function normalizeCwd(value: unknown): string | ShellCommandExecutionFailure | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return failure("INVALID_CWD", "shell.commandExecution cwd must be a safe path string", "input");
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "shell.commandExecution cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizeTimeout(value: unknown): number | ShellCommandExecutionFailure {
  if (value !== undefined && typeof value !== "number") {
    return failure("INVALID_TIMEOUT", "shell.commandExecution timeoutMs must be between 1 and 600000", "resource");
  }

  const timeoutMs = value ?? shellCommandExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellCommandExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.commandExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

function quoteShellCommandPart(part: string): string {
  return /\s/u.test(part) ? JSON.stringify(part) : part;
}

function compactShellCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(quoteShellCommandPart).join(" ");
}

function hasBoundedLifetime(commandLine: string): boolean {
  return /\btimeout\s+(?:--foreground\s+)?\d+(?:\.\d+)?[smhd]?\b/u.test(commandLine)
    || /\b(--help|-h|--version|-v)\b/u.test(commandLine);
}

function longRunningForegroundReason(command: string, args: readonly string[]): string | undefined {
  const commandLine = compactShellCommand(command, args);
  if (hasBoundedLifetime(commandLine)) {
    return undefined;
  }
  const normalized = commandLine.replace(/\s+/gu, " ").trim();
  if (/\bnode\s+(?:\.\/)?(?:server|app|index)\.[cm]?js\b/u.test(normalized)) {
    return "node server-style commands normally keep a web service running";
  }
  if (/\bnpm\s+(?:run\s+)?(?:dev|start|serve)\b/u.test(normalized)) {
    return "npm dev/start/serve scripts normally keep a web service running";
  }
  if (/\b(?:vite|next\s+dev|webpack-dev-server|python3?\s+-m\s+http\.server)\b/u.test(normalized)) {
    return "development server commands normally keep a web service running";
  }
  return undefined;
}

function normalizeShellCommandExecution(
  request: ShellCommandExecutionRequest,
  options: { allowRealExecution: boolean },
): NormalizedShellCommandExecution | ShellCommandExecutionFailure {
  const runtimeId = stringValue(request.context?.runtimeId)?.trim() ?? "";
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

  const target = objectValue((request as { target?: unknown }).target);
  const command = normalizeCommand(request.command ?? target?.command);
  if (typeof command !== "string") {
    return command;
  }

  const args = normalizeArgs(request.args);
  if (!Array.isArray(args)) {
    return args;
  }

  const workspaceWriteReason = describeShellWorkspaceWrite([command, ...args].join(" "));
  if (workspaceWriteReason !== undefined) {
    return failure(
      "WORKSPACE_WRITE_REQUIRES_CODE_TOOL",
      shellWorkspaceWriteGuardMessage(workspaceWriteReason),
      "governance",
    );
  }

  const foregroundLongRunningReason = longRunningForegroundReason(command, args);
  if (foregroundLongRunningReason !== undefined) {
    return failure(
      "LONG_RUNNING_FOREGROUND_COMMAND",
      [
        `shell.commandExecution refused foreground launch because ${foregroundLongRunningReason}.`,
        "Use shell.serviceStartAndVerify when the service URL must be verified, or shell.backgroundExecution/shell.detachedExecution for launch-only process control.",
        "When verifying a web app, read the actual listening port from stdout or scan localhost ports 3000-3020 instead of assuming 3000.",
      ].join(" "),
      "governance",
    );
  }

  const cwd = normalizeCwd(request.cwd ?? target?.workingDirectory ?? target?.cwd);
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
    shellType: stringValue(request.shellType ?? target?.shell ?? target?.shellType)?.trim() || undefined,
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
        workspacePathNormalization: objectValue(providerResult.workspacePathNormalization),
        requestedCwd: stringValue(providerResult.requestedCwd),
        normalizedCwd: stringValue(providerResult.normalizedCwd),
        workspaceRoot: stringValue(providerResult.workspaceRoot),
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
    const code = publicSafeProviderErrorCode(error);
    const metadata = objectValue(error instanceof Error ? error.cause : undefined);
    return toolFailure(
      code,
      error instanceof Error ? error.message : "shell.commandExecution provider rejected the invocation",
      code === "SANDBOX_UNAVAILABLE" || code === "SANDBOX_PROVIDER_UNSUPPORTED" ? "governance" : "provider",
      { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...(metadata ?? {}) } },
    );
  }
}
