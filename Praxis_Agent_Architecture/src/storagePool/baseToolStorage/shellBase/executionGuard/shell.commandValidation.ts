/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行守卫。
 * 核心目的：提供 Shell 基础工具 / 执行守卫 中的“校验命令安全性”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellCommandValidationPermission = "shell:validate";

export type ShellCommandValidationBoundary = "input" | "permission" | "contract" | "governance";

export type ShellCommandValidationVerdict = "allowed" | "requires-approval" | "blocked";

export type ShellCommandValidationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellCommandValidationPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellCommandValidationPolicy = {
  allowedCommands?: readonly string[];
  deniedCommands?: readonly string[];
  deniedPatterns?: readonly string[];
  allowShellOperators?: boolean;
  requireApprovalForSudo?: boolean;
};

export type ShellCommandValidationRequest = {
  command?: string;
  workingDirectory?: string;
  shell?: "sh" | "bash" | "zsh";
  policy?: ShellCommandValidationPolicy;
  context?: ShellCommandValidationContext;
};

export type ShellCommandValidationErrorCode =
  | "MISSING_COMMAND"
  | "INVALID_SHELL"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellCommandValidationError = {
  code: ShellCommandValidationErrorCode;
  message: string;
  boundary: ShellCommandValidationBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellCommandValidationAuditEvent = {
  type: string;
  toolId: "shell.commandValidation";
  invocationId: string;
  dryRun: boolean;
  commandPreview?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellCommandValidationOutput = {
  kind: "agentCore.basicTool.shell.commandValidation";
  command: string;
  workingDirectory?: string;
  shell: "sh" | "bash" | "zsh";
  verdict: ShellCommandValidationVerdict;
  reasons: readonly string[];
  requiredPermission: ShellCommandValidationPermission;
  requiresTapApproval: boolean;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellCommandValidationResult =
  | {
      ok: true;
      toolId: "shell.commandValidation";
      output: ShellCommandValidationOutput;
      audit: readonly ShellCommandValidationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.commandValidation";
      error: ShellCommandValidationError;
      audit: readonly ShellCommandValidationAuditEvent[];
      events: readonly string[];
    };

export const shellCommandValidationDescriptor = {
  toolId: "shell.commandValidation",
  capability: "shell-command-safety-validation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionGuard",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermission: "shell:validate",
  unsafeSideEffects: false,
} as const;

const defaultDeniedCommands = ["rm", "mkfs", "dd", "shutdown", "reboot", "poweroff", "init"] as const;
const defaultDeniedPatterns = [/rm\s+.*-rf\s+\/(?:\s|$)/, /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*;\s*\}/, /chmod\s+-R\s+777\b/];
const shellOperatorPattern = /(?:&&|\|\||;|\|(?!=)|>|<|`|\$\()/;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellCommandValidationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellCommandValidationContext | undefined): string {
  return context?.invocationId?.trim() || "shell.commandValidation:dry-run";
}

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

function auditEvent(
  type: string,
  context: ShellCommandValidationContext | undefined,
  commandPreview?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellCommandValidationAuditEvent {
  return {
    type,
    toolId: shellCommandValidationDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    commandPreview,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellCommandValidationErrorCode,
  message: string,
  boundary: ShellCommandValidationBoundary,
  context: ShellCommandValidationContext | undefined,
  commandPreview?: string,
): ShellCommandValidationResult {
  return {
    ok: false,
    toolId: shellCommandValidationDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.commandValidation.rejected", context, commandPreview, { code })],
    events: ["basicTool.shell.commandValidation.rejected"],
  };
}

function ensurePermissions(
  context: ShellCommandValidationContext | undefined,
  command: string,
): ShellCommandValidationResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context?.grantedPermissions);
  if (granted.includes(shellCommandValidationDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.commandValidation is missing permission: shell:validate",
    "permission",
    context,
    command,
  );
}

function ensureDryRunOnly(
  context: ShellCommandValidationContext | undefined,
  command: string,
): ShellCommandValidationResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.commandValidation only returns a guarded validation envelope in the first implementation",
    "contract",
    context,
    command,
  );
}

function evaluateCommand(command: string, policy: ShellCommandValidationPolicy | undefined): Pick<ShellCommandValidationOutput, "verdict" | "reasons" | "requiresTapApproval"> {
  const reasons: string[] = [];
  const commandName = firstToken(command);
  const allowedCommands = cleanList(policy?.allowedCommands);
  const deniedCommands = cleanList(policy?.deniedCommands ?? defaultDeniedCommands);
  const deniedPatterns = [...defaultDeniedPatterns, ...cleanList(policy?.deniedPatterns).map((pattern) => new RegExp(pattern))];

  if (allowedCommands.length > 0 && !allowedCommands.includes(commandName)) {
    reasons.push(`command ${commandName} is outside the allowed command list`);
    return { verdict: "blocked", reasons, requiresTapApproval: true };
  }

  if (deniedCommands.includes(commandName)) {
    reasons.push(`command ${commandName} is blocked by the execution guard`);
    return { verdict: "blocked", reasons, requiresTapApproval: true };
  }

  for (const pattern of deniedPatterns) {
    if (pattern.test(command)) {
      reasons.push("command matches a denied safety pattern");
      return { verdict: "blocked", reasons, requiresTapApproval: true };
    }
  }

  if (commandName === "sudo" && policy?.requireApprovalForSudo !== false) {
    reasons.push("sudo requires TAP approval before shell execution");
    return { verdict: "requires-approval", reasons, requiresTapApproval: true };
  }

  if (policy?.allowShellOperators !== true && shellOperatorPattern.test(command)) {
    reasons.push("shell operators require TAP approval before shell execution");
    return { verdict: "requires-approval", reasons, requiresTapApproval: true };
  }

  reasons.push("command passed the first-round shell validation guard");
  return { verdict: "allowed", reasons, requiresTapApproval: false };
}

export function validateShellCommandSafety(
  request: ShellCommandValidationRequest = {},
): ShellCommandValidationResult {
  const command = request.command?.trim() ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.commandValidation requires a non-empty command", "input", request.context);
  }

  const shell = request.shell ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.commandValidation shell must be sh, bash, or zsh", "input", request.context, command);
  }

  const permissionFailure = ensurePermissions(request.context, command);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context, command);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const decision = evaluateCommand(command, request.policy);

  return {
    ok: true,
    toolId: shellCommandValidationDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.commandValidation",
      command,
      workingDirectory: request.workingDirectory?.trim() || undefined,
      shell,
      verdict: decision.verdict,
      reasons: decision.reasons,
      requiredPermission: shellCommandValidationDescriptor.requiredPermission,
      requiresTapApproval: decision.requiresTapApproval,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.commandValidation.dryRun", request.context, command, {
        shell,
        verdict: decision.verdict,
      }),
    ],
    events: [`basicTool.shell.commandValidation.${decision.verdict}`],
  };
}
