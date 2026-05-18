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

import type { ShellCommandGenerationOutput } from "../shell.commandGeneration/core.js";

export type ShellExecutionGuardPermission = "shell:generate" | "shell:approve";

export type ShellExecutionGuardBoundary = "input" | "permission" | "contract" | "governance" | "scope";

export type ShellExecutionGuardVerdict = "allowed" | "requires-approval" | "blocked";

export type ShellExecutionGuardContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
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
  | "INVALID_COMMAND"
  | "INVALID_POLICY"
  | "PERMISSION_DENIED"
  | "WORKING_DIRECTORY_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
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
  dryRun: boolean;
  providerCalled: boolean;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invocationId(context: ShellExecutionGuardContext | undefined): string {
  return typeof context?.invocationId === "string" && context.invocationId.trim().length > 0
    ? context.invocationId.trim()
    : "shell.executionGuard:dry-run";
}

function cleanList<T extends string>(values: unknown): readonly T[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter((value): value is T => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean) as T[],
    ),
  ];
}

function commandFromRequest(request: ShellExecutionGuardRequest): string {
  if (isRecord(request.generatedCommand) && typeof request.generatedCommand.commandLine === "string") {
    return request.generatedCommand.commandLine;
  }
  return typeof request.command === "string" ? request.command.trim() : "";
}

function argvFromRequest(request: ShellExecutionGuardRequest): readonly string[] {
  const argv = isRecord(request.generatedCommand) && Array.isArray(request.generatedCommand.argv)
    ? request.generatedCommand.argv
    : request.argv;
  if (!Array.isArray(argv)) {
    return [];
  }
  return argv.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
}

function workingDirectoryFromRequest(request: ShellExecutionGuardRequest): string | undefined {
  if (isRecord(request.generatedCommand) && typeof request.generatedCommand.workingDirectory === "string") {
    return request.generatedCommand.workingDirectory.trim() || undefined;
  }
  return typeof request.workingDirectory === "string" ? request.workingDirectory.trim() || undefined : undefined;
}

function validateLooseCommandMaterial(request: ShellExecutionGuardRequest): ShellExecutionGuardResult | undefined {
  if (request.generatedCommand !== undefined) {
    return undefined;
  }

  if (request.command !== undefined && typeof request.command !== "string") {
    return failure("INVALID_COMMAND", "shell.executionGuard command must be a string when provided", "input", request.context);
  }

  if (request.argv !== undefined && (!Array.isArray(request.argv) || request.argv.some((value) => typeof value !== "string"))) {
    return failure("INVALID_COMMAND", "shell.executionGuard argv must be an array of strings when provided", "input", request.context);
  }

  if (request.workingDirectory !== undefined && typeof request.workingDirectory !== "string") {
    return failure("INVALID_COMMAND", "shell.executionGuard workingDirectory must be a string when provided", "input", request.context);
  }

  return undefined;
}

function validatePolicy(
  policy: unknown,
  context: ShellExecutionGuardContext | undefined,
  command: string,
): ShellExecutionGuardResult | undefined {
  if (policy === undefined) {
    return undefined;
  }

  if (!isRecord(policy)) {
    return failure("INVALID_POLICY", "shell.executionGuard policy must be an object when provided", "input", context, command);
  }

  if (
    policy.allowedWorkingDirectories !== undefined &&
    (!Array.isArray(policy.allowedWorkingDirectories) || policy.allowedWorkingDirectories.some((value) => typeof value !== "string"))
  ) {
    return failure("INVALID_POLICY", "shell.executionGuard policy.allowedWorkingDirectories must be an array of strings", "input", context, command);
  }

  if (
    policy.deniedExecutables !== undefined &&
    (!Array.isArray(policy.deniedExecutables) || policy.deniedExecutables.some((value) => typeof value !== "string"))
  ) {
    return failure("INVALID_POLICY", "shell.executionGuard policy.deniedExecutables must be an array of strings", "input", context, command);
  }

  for (const field of ["requireApprovalForShellOperators", "requireApprovalForSudo", "approvalGranted"] as const) {
    if (policy[field] !== undefined && typeof policy[field] !== "boolean") {
      return failure("INVALID_POLICY", `shell.executionGuard policy.${field} must be a boolean when provided`, "input", context, command);
    }
  }

  return undefined;
}

type GeneratedCommandMaterial = {
  command: string;
  argv: readonly string[];
  workingDirectory?: string;
};

function validateGeneratedCommand(
  request: ShellExecutionGuardRequest,
): GeneratedCommandMaterial | ShellExecutionGuardResult | undefined {
  if (request.generatedCommand === undefined) {
    return undefined;
  }

  if (!isRecord(request.generatedCommand)) {
    return failure(
      "INVALID_COMMAND",
      "shell.executionGuard generatedCommand must match shell.commandGeneration output",
      "input",
      request.context,
    );
  }

  const command = typeof request.generatedCommand.commandLine === "string"
    ? request.generatedCommand.commandLine.trim()
    : "";
  if (command.length === 0) {
    return failure(
      "INVALID_COMMAND",
      "shell.executionGuard generatedCommand.commandLine must be a non-empty string",
      "input",
      request.context,
    );
  }

  if (
    request.generatedCommand.argv !== undefined &&
    (!Array.isArray(request.generatedCommand.argv) || request.generatedCommand.argv.some((value) => typeof value !== "string"))
  ) {
    return failure(
      "INVALID_COMMAND",
      "shell.executionGuard generatedCommand.argv must be an array of strings",
      "input",
      request.context,
      command,
    );
  }

  if (
    request.generatedCommand.workingDirectory !== undefined &&
    typeof request.generatedCommand.workingDirectory !== "string"
  ) {
    return failure(
      "INVALID_COMMAND",
      "shell.executionGuard generatedCommand.workingDirectory must be a string when provided",
      "input",
      request.context,
      command,
    );
  }

  return {
    command,
    argv: Array.isArray(request.generatedCommand.argv)
      ? request.generatedCommand.argv.map((value) => value.trim()).filter(Boolean)
      : [],
    workingDirectory:
      typeof request.generatedCommand.workingDirectory === "string"
        ? request.generatedCommand.workingDirectory.trim() || undefined
        : undefined,
  };
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
  if (!isRecord(request)) {
    return failure("MISSING_COMMAND", "shell.executionGuard requires a generated command", "input", undefined);
  }

  const generatedCommand = validateGeneratedCommand(request);
  if (generatedCommand !== undefined && "ok" in generatedCommand) {
    return generatedCommand;
  }

  const looseCommandMaterialFailure = validateLooseCommandMaterial(request);
  if (looseCommandMaterialFailure !== undefined) {
    return looseCommandMaterialFailure;
  }

  const command = generatedCommand?.command ?? commandFromRequest(request);
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.executionGuard requires a generated command", "input", request.context);
  }

  const policyFailure = validatePolicy(request.policy, request.context, command);
  if (policyFailure !== undefined) {
    return policyFailure;
  }

  const permissionFailure = ensurePermissions(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const workingDirectory = generatedCommand?.workingDirectory ?? workingDirectoryFromRequest(request);
  const workingDirectoryFailure = ensureWorkingDirectory(workingDirectory, request.policy, request.context, command);
  if (workingDirectoryFailure !== undefined) {
    return workingDirectoryFailure;
  }

  const argv = generatedCommand?.argv ?? argvFromRequest(request);
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
      providerCalled: false,
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
