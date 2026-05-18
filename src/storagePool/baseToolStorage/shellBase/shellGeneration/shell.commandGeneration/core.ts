/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 生成。
 * 核心目的：提供 Shell 基础工具 / Shell 生成 中的“生成命令”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { quoteShellArgument, type ShellArgumentAssemblyOutput } from "../shell.argumentAssembly/core.js";

export type ShellCommandGenerationPermission = "shell:generate";

export type ShellCommandGenerationBoundary = "input" | "permission" | "contract" | "governance";

export type ShellCommandShell = "sh" | "bash" | "zsh";

export type ShellCommandGenerationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  grantedPermissions?: readonly ShellCommandGenerationPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellCommandGenerationRequest = {
  argv?: readonly string[];
  assembledArguments?: ShellArgumentAssemblyOutput;
  shell?: ShellCommandShell;
  workingDirectory?: string;
  environmentKeys?: readonly string[];
  context?: ShellCommandGenerationContext;
};

export type ShellCommandGenerationErrorCode =
  | "MISSING_ARGUMENT_VECTOR"
  | "INVALID_ARGUMENT_VECTOR"
  | "INVALID_SHELL"
  | "INVALID_WORKING_DIRECTORY"
  | "INVALID_ENVIRONMENT"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellCommandGenerationError = {
  code: ShellCommandGenerationErrorCode;
  message: string;
  boundary: ShellCommandGenerationBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellCommandGenerationAuditEvent = {
  type: string;
  toolId: "shell.commandGeneration";
  invocationId: string;
  dryRun: boolean;
  commandPreview?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellCommandGenerationOutput = {
  kind: "agentCore.basicTool.shell.commandGeneration";
  shell: ShellCommandShell;
  commandLine: string;
  argv: readonly string[];
  executable: string;
  workingDirectory?: string;
  environmentKeys: readonly string[];
  requiredPermission: ShellCommandGenerationPermission;
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellCommandGenerationResult =
  | {
      ok: true;
      toolId: "shell.commandGeneration";
      output: ShellCommandGenerationOutput;
      audit: readonly ShellCommandGenerationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.commandGeneration";
      error: ShellCommandGenerationError;
      audit: readonly ShellCommandGenerationAuditEvent[];
      events: readonly string[];
    };

export const shellCommandGenerationDescriptor = {
  toolId: "shell.commandGeneration",
  capability: "shell-command-generation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellGeneration",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermission: "shell:generate",
  unsafeSideEffects: false,
} as const;

function dryRunEnabled(context: ShellCommandGenerationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invocationId(context: ShellCommandGenerationContext | undefined): string {
  return typeof context?.invocationId === "string" && context.invocationId.trim().length > 0
    ? context.invocationId.trim()
    : "shell.commandGeneration:dry-run";
}

function cleanList(values: unknown): readonly string[] {
  if (values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function cleanPermissions(
  permissions: readonly ShellCommandGenerationPermission[] | undefined,
): readonly ShellCommandGenerationPermission[] {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return [
    ...new Set(permissions.filter((permission): permission is ShellCommandGenerationPermission => permission === "shell:generate")),
  ];
}

function auditEvent(
  type: string,
  context: ShellCommandGenerationContext | undefined,
  commandPreview?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellCommandGenerationAuditEvent {
  return {
    type,
    toolId: shellCommandGenerationDescriptor.toolId,
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
  code: ShellCommandGenerationErrorCode,
  message: string,
  boundary: ShellCommandGenerationBoundary,
  context: ShellCommandGenerationContext | undefined,
  commandPreview?: string,
): ShellCommandGenerationResult {
  return {
    ok: false,
    toolId: shellCommandGenerationDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.commandGeneration.rejected", context, commandPreview, { code })],
    events: ["basicTool.shell.commandGeneration.rejected"],
  };
}

function ensurePermissions(
  context: ShellCommandGenerationContext | undefined,
): ShellCommandGenerationResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanPermissions(context.grantedPermissions);
  if (granted.includes(shellCommandGenerationDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.commandGeneration is missing permission: shell:generate",
    "permission",
    context,
  );
}

function ensureDryRunOnly(
  context: ShellCommandGenerationContext | undefined,
): ShellCommandGenerationResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.commandGeneration only creates a dry-run command envelope in the first implementation",
    "contract",
    context,
  );
}

function commandShell(shell: ShellCommandShell | undefined): ShellCommandShell | undefined {
  if (shell === undefined) {
    return "sh";
  }

  if (shell === "sh" || shell === "bash" || shell === "zsh") {
    return shell;
  }

  return undefined;
}

function argumentVector(request: ShellCommandGenerationRequest): readonly string[] | ShellCommandGenerationResult {
  if (request.assembledArguments !== undefined) {
    if (!isRecord(request.assembledArguments)) {
      return failure(
        "INVALID_ARGUMENT_VECTOR",
        "shell.commandGeneration assembledArguments must match shell.argumentAssembly output",
        "input",
        request.context,
      );
    }

    if (!Array.isArray(request.assembledArguments.argv) || request.assembledArguments.argv.some((value) => typeof value !== "string")) {
      return failure(
        "INVALID_ARGUMENT_VECTOR",
        "shell.commandGeneration assembledArguments.argv must be an array of strings",
        "input",
        request.context,
      );
    }

    return request.assembledArguments.argv;
  }

  const argv = request.argv;

  if (argv === undefined) {
    return [];
  }

  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    return failure(
      "INVALID_ARGUMENT_VECTOR",
      "shell.commandGeneration argv must be an array of strings",
      "input",
      request.context,
    );
  }

  return argv;
}

export function generateShellCommand(request: ShellCommandGenerationRequest = {}): ShellCommandGenerationResult {
  if (!isRecord(request)) {
    return failure("MISSING_ARGUMENT_VECTOR", "shell.commandGeneration requires an argv vector from argument assembly", "input", undefined);
  }

  const shell = commandShell(request.shell);
  if (shell === undefined) {
    return failure("INVALID_SHELL", "shell.commandGeneration shell must be sh, bash, or zsh", "input", request.context);
  }

  const permissionFailure = ensurePermissions(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const argvResult = argumentVector(request);
  if ("ok" in argvResult) {
    return argvResult;
  }

  const argv = argvResult.map((value) => value.trim());
  if (argv.length === 0) {
    return failure(
      "MISSING_ARGUMENT_VECTOR",
      "shell.commandGeneration requires an argv vector from argument assembly",
      "input",
      request.context,
    );
  }

  if (argv.some((value) => value.length === 0)) {
    return failure(
      "INVALID_ARGUMENT_VECTOR",
      "shell.commandGeneration does not accept blank argv tokens",
      "input",
      request.context,
    );
  }

  if (request.workingDirectory !== undefined && typeof request.workingDirectory !== "string") {
    return failure(
      "INVALID_WORKING_DIRECTORY",
      "shell.commandGeneration workingDirectory must be a string when provided",
      "input",
      request.context,
    );
  }

  if (
    request.environmentKeys !== undefined &&
    (!Array.isArray(request.environmentKeys) || request.environmentKeys.some((value) => typeof value !== "string"))
  ) {
    return failure(
      "INVALID_ENVIRONMENT",
      "shell.commandGeneration environmentKeys must be an array of strings when provided",
      "input",
      request.context,
    );
  }

  const commandLine = argv.map(quoteShellArgument).join(" ");
  const environmentKeys = cleanList(request.environmentKeys);
  const workingDirectory = typeof request.workingDirectory === "string" ? request.workingDirectory.trim() || undefined : undefined;

  return {
    ok: true,
    toolId: shellCommandGenerationDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.commandGeneration",
      shell,
      commandLine,
      argv,
      executable: argv[0] ?? "",
      workingDirectory,
      environmentKeys,
      requiredPermission: shellCommandGenerationDescriptor.requiredPermission,
      dryRun: true,
      providerCalled: false,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.commandGeneration.dryRun", request.context, commandLine, {
        shell,
        argc: argv.length,
        environmentKeys,
      }),
    ],
    events: ["basicTool.shell.commandGeneration.generated"],
  };
}
