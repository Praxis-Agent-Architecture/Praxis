/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 进程控制。
 * 核心目的：提供 Shell 基础工具 / 进程控制 中的“创建进程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellProcessSpawningPermission = "shell:execute";

export type ShellProcessSpawningBoundary = "input" | "scope" | "permission" | "approval" | "contract" | "resource";

export type ShellProcessLaunchMode = "foreground" | "background" | "detached";

export type ShellProcessStdioMode = "pipe" | "inherit" | "ignore";

export type ShellProcessSpawningContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellProcessSpawningPermission[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellProcessSpawnTarget = {
  executable?: string;
  command?: string;
  args?: readonly string[];
  workingDirectory?: string;
  shell?: "sh" | "bash" | "zsh";
  env?: Readonly<Record<string, string>>;
  stdio?: ShellProcessStdioMode;
};

export type ShellProcessSpawningRequest = {
  target?: Partial<ShellProcessSpawnTarget>;
  launchMode?: ShellProcessLaunchMode;
  riskLevel?: "low" | "medium" | "high";
  context?: ShellProcessSpawningContext;
};

export type ShellProcessSpawningErrorCode =
  | "MISSING_TARGET"
  | "AMBIGUOUS_TARGET"
  | "INVALID_SHELL"
  | "INVALID_STDIO"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellProcessSpawningError = {
  code: ShellProcessSpawningErrorCode;
  message: string;
  boundary: ShellProcessSpawningBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellProcessSpawningAuditEvent = {
  type: string;
  toolId: "shell.processSpawning";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellProcessSpawningOutput = {
  kind: "agentCore.basicTool.shell.processSpawning";
  launchMode: ShellProcessLaunchMode;
  target: {
    executable?: string;
    command?: string;
    args: readonly string[];
    workingDirectory?: string;
    shell?: "sh" | "bash" | "zsh";
    envKeys: readonly string[];
    stdio: ShellProcessStdioMode;
  };
  commandPreview: readonly string[];
  permissionsRequired: readonly ShellProcessSpawningPermission[];
  approvalId?: string;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  resultEnvelope: {
    planned: true;
    pid?: never;
    spawnHandle?: string;
  };
};

export type ShellProcessSpawningResult =
  | {
      ok: true;
      toolId: "shell.processSpawning";
      output: ShellProcessSpawningOutput;
      audit: readonly ShellProcessSpawningAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.processSpawning";
      error: ShellProcessSpawningError;
      audit: readonly ShellProcessSpawningAuditEvent[];
      events: readonly string[];
    };

export const shellProcessSpawningDescriptor = {
  toolId: "shell.processSpawning",
  capability: "shell-process-spawning",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:execute"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellProcessSpawningContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellProcessSpawningContext | undefined): string {
  return context?.invocationId?.trim() || "shell.processSpawning:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellProcessSpawningContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellProcessSpawningAuditEvent {
  return {
    type,
    toolId: shellProcessSpawningDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    workingDirectory,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellProcessSpawningErrorCode,
  message: string,
  boundary: ShellProcessSpawningBoundary,
  context: ShellProcessSpawningContext | undefined,
  workingDirectory?: string,
): ShellProcessSpawningResult {
  return {
    ok: false,
    toolId: shellProcessSpawningDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.processSpawning.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.processSpawning.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellProcessSpawnTarget> | undefined,
  context: ShellProcessSpawningContext | undefined,
): ShellProcessSpawningOutput["target"] | ShellProcessSpawningResult {
  const executable = target?.executable?.trim() || undefined;
  const command = target?.command?.trim() || undefined;

  if (executable === undefined && command === undefined) {
    return failure("MISSING_TARGET", "shell.processSpawning requires target.executable or target.command", "input", context, target?.workingDirectory);
  }

  if (executable !== undefined && command !== undefined) {
    return failure("AMBIGUOUS_TARGET", "shell.processSpawning accepts either executable or command, not both", "input", context, target?.workingDirectory);
  }

  const shell = target?.shell ?? (command !== undefined ? "sh" : undefined);
  if (shell !== undefined && shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.processSpawning shell must be sh, bash, or zsh", "input", context, target?.workingDirectory);
  }

  const stdio = target?.stdio ?? "pipe";
  if (stdio !== "pipe" && stdio !== "inherit" && stdio !== "ignore") {
    return failure("INVALID_STDIO", "shell.processSpawning stdio must be pipe, inherit, or ignore", "input", context, target?.workingDirectory);
  }

  const workingDirectory = target?.workingDirectory?.trim() || undefined;
  return {
    executable,
    command,
    args: cleanList(target?.args),
    workingDirectory: workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory),
    shell,
    envKeys: cleanList(Object.keys(target?.env ?? {})),
    stdio,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellProcessSpawningContext | undefined,
): ShellProcessSpawningResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const allowed = allowedDirectories.some(
    (directory) => directory === "/" || workingDirectory === directory || workingDirectory.startsWith(`${directory}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.processSpawning workingDirectory is outside allowed execution scope",
    "scope",
    context,
    workingDirectory,
  );
}

function ensurePermissions(
  workingDirectory: string | undefined,
  context: ShellProcessSpawningContext | undefined,
): ShellProcessSpawningResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context.grantedPermissions);
  const missing = shellProcessSpawningDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.processSpawning is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workingDirectory,
  );
}

function ensureDryRunOnly(
  workingDirectory: string | undefined,
  context: ShellProcessSpawningContext | undefined,
): ShellProcessSpawningResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.processSpawning only returns a guarded dry-run process spawn plan in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

function resolveApproval(
  riskLevel: ShellProcessSpawningRequest["riskLevel"],
  context: ShellProcessSpawningContext | undefined,
  workingDirectory: string | undefined,
): ShellProcessSpawningResult | undefined {
  if (riskLevel !== "high") {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.processSpawning approval was rejected by TAP governance",
      "approval",
      context,
      workingDirectory,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.processSpawning high-risk process launch requires TAP approval",
    "approval",
    context,
    workingDirectory,
  );
}

function commandPreview(target: ShellProcessSpawningOutput["target"]): readonly string[] {
  if (target.command !== undefined) {
    return [target.shell ?? "sh", "-lc", target.command];
  }

  return [target.executable ?? "", ...target.args].filter(Boolean);
}

export function planShellProcessSpawn(request: ShellProcessSpawningRequest = {}): ShellProcessSpawningResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.workingDirectory, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.workingDirectory, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.workingDirectory, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const approvalFailure = resolveApproval(request.riskLevel, request.context, target.workingDirectory);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  const launchMode = request.launchMode ?? "foreground";

  return {
    ok: true,
    toolId: shellProcessSpawningDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.processSpawning",
      launchMode,
      target,
      commandPreview: commandPreview(target),
      permissionsRequired: shellProcessSpawningDescriptor.permissionsRequired,
      approvalId: request.context?.approval?.approvalId?.trim() || undefined,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      resultEnvelope: {
        planned: true,
        spawnHandle: `${invocationId(request.context)}:${launchMode}`,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.processSpawning.dryRun", request.context, target.workingDirectory, {
        launchMode,
        stdio: target.stdio,
        envKeys: target.envKeys,
      }),
    ],
    events: ["basicTool.shell.processSpawning.dryRun"],
  };
}
