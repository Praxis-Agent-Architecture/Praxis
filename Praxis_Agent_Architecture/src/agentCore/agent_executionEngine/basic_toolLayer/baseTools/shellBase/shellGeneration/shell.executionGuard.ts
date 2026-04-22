/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 生成。
 * 核心目的：提供 Shell 基础工具 / Shell 生成 中的“生成执行守卫”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellCommandGenerationOutput } from "./shell.commandGeneration.js";

export type ShellExecutionGuardPermission = "shell:generate" | "shell:approve";

export type ShellExecutionGuardBoundary = "input" | "permission" | "contract" | "governance" | "scope";

export type ShellExecutionGuardVerdict = "allowed" | "requires-approval" | "blocked";

export type ShellExecutionGuardContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellExecutionGuardPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellExecutionGuardPolicy = {
  allowedWorkingDirectories?: readonly string[];
  deniedExecutables?: readonly string[];
  requireApprovalForShellOperators?: boolean;
  requireApprovalForSudo?: boolean;
  approvalGranted?: boolean;
};

export type ShellExecutionGuardRequest = {
  command?: string;
  argv?: readonly string[];
  generatedCommand?: ShellCommandGenerationOutput;
  workingDirectory?: string;
  policy?: ShellExecutionGuardPolicy;
  context?: ShellExecutionGuardContext;
};

export type ShellExecutionGuardErrorCode =
  | "MISSING_COMMAND"
  | "PERMISSION_DENIED"
  | "WORKING_DIRECTORY_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellExecutionGuardError = {
  code: ShellExecutionGuardErrorCode;
  message: string;
  boundary: ShellExecutionGuardBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellExecutionGuardAuditEvent = {
  type: string;
  toolId: "shell.executionGuard";
  invocationId: string;
  dryRun: boolean;
  commandPreview?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellExecutionGuardOutput = {
  kind: "agentCore.basicTool.shell.executionGuard";
  command: string;
  argv: readonly string[];
  workingDirectory?: string;
  verdict: ShellExecutionGuardVerdict;
  reasons: readonly string[];
  requiredPermissions: readonly ShellExecutionGuardPermission[];
  requiresTapApproval: boolean;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellExecutionGuardResult =
  | {
      ok: true;
      toolId: "shell.executionGuard";
      output: ShellExecutionGuardOutput;
      audit: readonly ShellExecutionGuardAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.executionGuard";
      error: ShellExecutionGuardError;
      audit: readonly ShellExecutionGuardAuditEvent[];
      events: readonly string[];
    };

export const shellExecutionGuardDescriptor = {
  toolId: "shell.executionGuard",
  capability: "shell-execution-guard-generation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellGeneration",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermissions: ["shell:generate"] as const,
  unsafeSideEffects: false,
} as const;

const shellOperatorPattern = /(?:&&|\|\||;|\|(?!=)|>|<|`|\$\()/;

function dryRunEnabled(context: ShellExecutionGuardContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellExecutionGuardContext | undefined): string {
  return context?.invocationId?.trim() || "shell.executionGuard:dry-run";
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function commandFromRequest(request: ShellExecutionGuardRequest): string {
  return request.generatedCommand?.commandLine ?? request.command?.trim() ?? "";
}

function argvFromRequest(request: ShellExecutionGuardRequest): readonly string[] {
  const argv = request.generatedCommand?.argv ?? request.argv ?? [];
  return argv.map((value) => value.trim()).filter(Boolean);
}

function workingDirectoryFromRequest(request: ShellExecutionGuardRequest): string | undefined {
  return (request.generatedCommand?.workingDirectory ?? request.workingDirectory?.trim()) || undefined;
}

function auditEvent(
  type: string,
  context: ShellExecutionGuardContext | undefined,
  commandPreview?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellExecutionGuardAuditEvent {
  return {
    type,
    toolId: shellExecutionGuardDescriptor.toolId,
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
  code: ShellExecutionGuardErrorCode,
  message: string,
  boundary: ShellExecutionGuardBoundary,
  context: ShellExecutionGuardContext | undefined,
  commandPreview?: string,
): ShellExecutionGuardResult {
  return {
    ok: false,
    toolId: shellExecutionGuardDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.executionGuard.rejected", context, commandPreview, { code })],
    events: ["basicTool.shell.executionGuard.rejected"],
  };
}

function ensurePermissions(
  context: ShellExecutionGuardContext | undefined,
): ShellExecutionGuardResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context.grantedPermissions);
  const missing = shellExecutionGuardDescriptor.requiredPermissions.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.executionGuard is missing permission: ${missing.join(", ")}`,
    "permission",
    context,
  );
}

function ensureDryRunOnly(
  context: ShellExecutionGuardContext | undefined,
): ShellExecutionGuardResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.executionGuard only creates a dry-run guard envelope in the first implementation",
    "contract",
    context,
  );
}

function ensureWorkingDirectory(
  workingDirectory: string | undefined,
  policy: ShellExecutionGuardPolicy | undefined,
  context: ShellExecutionGuardContext | undefined,
  command: string,
): ShellExecutionGuardResult | undefined {
  const allowedDirectories = cleanList(policy?.allowedWorkingDirectories);
  if (allowedDirectories.length === 0 || workingDirectory === undefined) {
    return undefined;
  }

  const insideAllowedDirectory = allowedDirectories.some(
    (directory) => workingDirectory === directory || workingDirectory.startsWith(directory.replace(/\/+$/, "") + "/"),
  );
  if (insideAllowedDirectory) {
    return undefined;
  }

  return failure(
    "WORKING_DIRECTORY_DENIED",
    "shell.executionGuard rejected a working directory outside the allowed scope",
    "scope",
    context,
    command,
  );
}

function evaluateGuard(
  command: string,
  argv: readonly string[],
  policy: ShellExecutionGuardPolicy | undefined,
): Pick<ShellExecutionGuardOutput, "verdict" | "reasons" | "requiresTapApproval"> {
  const reasons: string[] = [];
  const executable = argv[0] ?? command.split(/\s+/)[0] ?? "";
  const deniedExecutables = cleanList(policy?.deniedExecutables);

  if (deniedExecutables.includes(executable)) {
    return {
      verdict: "blocked",
      reasons: [`executable ${executable} is blocked by the generated execution guard`],
      requiresTapApproval: true,
    };
  }

  const sudoNeedsApproval = executable === "sudo" && policy?.requireApprovalForSudo !== false;
  const operatorsNeedApproval =
    policy?.requireApprovalForShellOperators !== false && shellOperatorPattern.test(command);

  if ((sudoNeedsApproval || operatorsNeedApproval) && policy?.approvalGranted !== true) {
    if (sudoNeedsApproval) {
      reasons.push("sudo requires TAP approval before shell execution");
    }
    if (operatorsNeedApproval) {
      reasons.push("shell operators require TAP approval before shell execution");
    }
    return { verdict: "requires-approval", reasons, requiresTapApproval: true };
  }

  reasons.push("generated shell command passed the dry-run execution guard");
  return { verdict: "allowed", reasons, requiresTapApproval: false };
}

export function buildShellExecutionGuard(request: ShellExecutionGuardRequest = {}): ShellExecutionGuardResult {
  const command = commandFromRequest(request);
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.executionGuard requires a generated command", "input", request.context);
  }

  const permissionFailure = ensurePermissions(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const workingDirectory = workingDirectoryFromRequest(request);
  const workingDirectoryFailure = ensureWorkingDirectory(workingDirectory, request.policy, request.context, command);
  if (workingDirectoryFailure !== undefined) {
    return workingDirectoryFailure;
  }

  const argv = argvFromRequest(request);
  const decision = evaluateGuard(command, argv, request.policy);

  return {
    ok: true,
    toolId: shellExecutionGuardDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.executionGuard",
      command,
      argv,
      workingDirectory,
      verdict: decision.verdict,
      reasons: decision.reasons,
      requiredPermissions: shellExecutionGuardDescriptor.requiredPermissions,
      requiresTapApproval: decision.requiresTapApproval,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.executionGuard.dryRun", request.context, command, {
        verdict: decision.verdict,
        workingDirectory,
      }),
    ],
    events: [`basicTool.shell.executionGuard.${decision.verdict}`],
  };
}
