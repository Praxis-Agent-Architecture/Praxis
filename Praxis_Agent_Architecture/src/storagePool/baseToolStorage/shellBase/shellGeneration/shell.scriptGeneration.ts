/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 生成。
 * 核心目的：提供 Shell 基础工具 / Shell 生成 中的“生成脚本”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellScriptGenerationPermission = "shell:script:generate";

export type ShellScriptGenerationBoundary = "input" | "permission" | "scope" | "governance" | "contract";

export type ShellScriptGenerationShell = "sh" | "bash" | "zsh";

export type ShellScriptGenerationGate = {
  accepted: boolean;
  reason?: string;
};

export type ShellScriptGenerationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellScriptGenerationPermission[];
  allowedWorkingDirectories?: readonly string[];
  guard?: ShellScriptGenerationGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellScriptGenerationTarget = {
  scriptName?: string;
  shell: ShellScriptGenerationShell;
  workingDirectory?: string;
  commands: readonly string[];
  environment?: Readonly<Record<string, string>>;
  notes?: readonly string[];
};

export type ShellScriptGenerationRequest = {
  target?: Partial<ShellScriptGenerationTarget>;
  context?: ShellScriptGenerationContext;
};

export type ShellScriptGenerationErrorCode =
  | "MISSING_COMMANDS"
  | "INVALID_COMMAND"
  | "INVALID_SHELL"
  | "INVALID_SCRIPT_NAME"
  | "INVALID_ENVIRONMENT"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellScriptGenerationError = {
  code: ShellScriptGenerationErrorCode;
  message: string;
  boundary: ShellScriptGenerationBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellScriptGenerationAuditEvent = {
  type: string;
  toolId: "shell.scriptGeneration";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellScriptGenerationOutput = {
  kind: "agentCore.basicTool.shell.scriptGeneration";
  target: ShellScriptGenerationTarget;
  script: string;
  commandPreview: readonly string[];
  lineCount: number;
  requiredPermission: ShellScriptGenerationPermission;
  requiresTapApproval: boolean;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellScriptGenerationResult =
  | {
      ok: true;
      toolId: "shell.scriptGeneration";
      output: ShellScriptGenerationOutput;
      audit: readonly ShellScriptGenerationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.scriptGeneration";
      error: ShellScriptGenerationError;
      audit: readonly ShellScriptGenerationAuditEvent[];
      events: readonly string[];
    };

export const shellScriptGenerationDescriptor = {
  toolId: "shell.scriptGeneration",
  capability: "shell-script-generation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellGeneration",
  defaultDryRun: true,
  requiredPermission: "shell:script:generate",
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

const scriptNamePattern = /^[a-zA-Z0-9._-]+$/;
const shellOperatorPattern = /(?:&&|\|\||;|\|(?!=)|>|<|`|\$\()/;

function cleanStringList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: ShellScriptGenerationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellScriptGenerationContext | undefined): string {
  return context?.invocationId?.trim() || "shell.scriptGeneration:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellScriptGenerationContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellScriptGenerationAuditEvent {
  return {
    type,
    toolId: shellScriptGenerationDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellScriptGenerationErrorCode,
  message: string,
  boundary: ShellScriptGenerationBoundary,
  context: ShellScriptGenerationContext | undefined,
): ShellScriptGenerationResult {
  return {
    ok: false,
    toolId: shellScriptGenerationDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.scriptGeneration.rejected", context, { code })],
    events: ["basicTool.shell.scriptGeneration.rejected"],
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellScriptGenerationContext | undefined,
): ShellScriptGenerationResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanStringList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const normalizedDirectory = normalizeDirectory(workingDirectory);
  const allowed = allowedDirectories.some((directory) => normalizedDirectory === directory || normalizedDirectory.startsWith(`${directory}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.scriptGeneration workingDirectory is outside allowed shell generation scope",
    "scope",
    context,
  );
}

function ensurePermission(context: ShellScriptGenerationContext | undefined): ShellScriptGenerationResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellScriptGenerationDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.scriptGeneration is missing permission: shell:script:generate",
    "permission",
    context,
  );
}

function ensureDryRunOnly(context: ShellScriptGenerationContext | undefined): ShellScriptGenerationResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.scriptGeneration only creates a guarded dry-run script envelope in the first implementation",
    "contract",
    context,
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeEnvironment(
  environment: Readonly<Record<string, string>> | undefined,
  context: ShellScriptGenerationContext | undefined,
): Readonly<Record<string, string>> | ShellScriptGenerationResult | undefined {
  if (environment === undefined) {
    return undefined;
  }

  const entries = Object.entries(environment);
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0")) {
      return failure(
        "INVALID_ENVIRONMENT",
        "shell.scriptGeneration environment must use safe shell variable names and string values",
        "input",
        context,
      );
    }
  }

  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function isShellScriptGenerationResult(value: unknown): value is ShellScriptGenerationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { toolId?: unknown }).toolId === shellScriptGenerationDescriptor.toolId &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

function normalizeTarget(
  target: Partial<ShellScriptGenerationTarget> | undefined,
  context: ShellScriptGenerationContext | undefined,
): ShellScriptGenerationTarget | ShellScriptGenerationResult {
  const shell = target?.shell ?? "bash";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.scriptGeneration shell must be sh, bash, or zsh", "input", context);
  }

  const scriptName = target?.scriptName?.trim() || undefined;
  if (scriptName !== undefined && !scriptNamePattern.test(scriptName)) {
    return failure("INVALID_SCRIPT_NAME", "shell.scriptGeneration scriptName must be a safe file-like label", "input", context);
  }

  const commands = cleanStringList(target?.commands);
  if (commands.length === 0) {
    return failure("MISSING_COMMANDS", "shell.scriptGeneration requires at least one command", "input", context);
  }

  if (commands.some((command) => command.includes("\0"))) {
    return failure("INVALID_COMMAND", "shell.scriptGeneration commands must be safe strings", "input", context);
  }

  const environment = normalizeEnvironment(target?.environment, context);
  if (isShellScriptGenerationResult(environment)) {
    return environment;
  }

  const workingDirectory = target?.workingDirectory?.trim() || undefined;
  return {
    scriptName,
    shell,
    workingDirectory,
    commands,
    environment,
    notes: cleanStringList(target?.notes),
  };
}

function buildScript(target: ShellScriptGenerationTarget): string {
  const lines = [`#!/usr/bin/env ${target.shell}`, target.shell === "sh" ? "set -eu" : "set -euo pipefail"];

  if (target.workingDirectory !== undefined) {
    lines.push(`cd ${shellQuote(target.workingDirectory)}`);
  }

  for (const [key, value] of Object.entries(target.environment ?? {})) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }

  for (const note of target.notes ?? []) {
    lines.push(`# ${note}`);
  }

  lines.push(...target.commands);
  return `${lines.join("\n")}\n`;
}

function needsTapApproval(commands: readonly string[]): boolean {
  return commands.some((command) => command.trim().startsWith("sudo ") || shellOperatorPattern.test(command));
}

export function generateShellScriptPlan(
  request: ShellScriptGenerationRequest = {},
): ShellScriptGenerationResult {
  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "shell.scriptGeneration was rejected by runtime governance",
      "governance",
      request.context,
    );
  }

  const dryRunFailure = ensureDryRunOnly(request.context);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.workingDirectory, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const script = buildScript(target);
  const requiresTapApproval = needsTapApproval(target.commands);

  return {
    ok: true,
    toolId: shellScriptGenerationDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.scriptGeneration",
      target,
      script,
      commandPreview: target.commands,
      lineCount: script.trimEnd().split("\n").length,
      requiredPermission: shellScriptGenerationDescriptor.requiredPermission,
      requiresTapApproval,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.scriptGeneration.dryRun", request.context, {
        commandCount: target.commands.length,
        shell: target.shell,
        requiresTapApproval,
      }),
    ],
    events: ["basicTool.shell.scriptGeneration.dryRun"],
  };
}
