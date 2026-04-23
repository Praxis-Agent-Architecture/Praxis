/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 执行。
 * 核心目的：提供 Shell 基础工具 / Shell 执行 中的“执行调用对象”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  planShellCommandExecution,
  type ShellCommandExecutionPlan,
  type ShellExecutionBoundary,
  type ShellExecutionContext,
} from "./shell.commandExecution.js";

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
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellInvocationExecutionRequest = {
  context?: ShellExecutionContext;
  invocation?: ShellInvocationObject;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellInvocationExecutionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INVOCATION"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EXECUTABLE"
  | "INVALID_ENVIRONMENT"
  | "COMMAND_PLAN_REJECTED";

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

export const shellInvocationExecutionDescriptor = {
  toolId: "shell.invocationExecution",
  capability: "execute-invocation-object",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
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

function normalizeEnvironment(
  entries: readonly ShellInvocationEnvironmentEntry[] | undefined,
): { ok: true; env: Readonly<Record<string, string>> } | ShellInvocationExecutionFailure {
  const normalized: Record<string, string> = {};

  for (const entry of entries ?? []) {
    const name = entry.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || entry.value.includes("\0")) {
      return failure(
        "INVALID_ENVIRONMENT",
        "shell.invocationExecution env entries must have safe variable names and string values",
        "input",
      );
    }

    normalized[name] = entry.value;
  }

  return { ok: true, env: normalized };
}

export function planShellInvocationExecution(
  request: ShellInvocationExecutionRequest = {},
): ShellInvocationExecutionResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.invocationExecution requires context.runtimeId for audit", "input");
  }

  if (request.invocation === undefined) {
    return failure("MISSING_INVOCATION", "shell.invocationExecution requires an invocation object", "input");
  }

  const invocationId = request.invocation.invocationId?.trim() || request.context?.invocationId?.trim();
  if (isBlank(invocationId)) {
    return failure("MISSING_INVOCATION_ID", "shell.invocationExecution requires invocation.invocationId", "input");
  }

  if (isBlank(request.invocation.executable)) {
    return failure("MISSING_EXECUTABLE", "shell.invocationExecution requires invocation.executable", "input");
  }

  const env = normalizeEnvironment(request.invocation.env);
  if (!env.ok) {
    return env;
  }

  const commandResult = planShellCommandExecution({
    context: {
      ...request.context,
      invocationId,
    },
    command: request.invocation.executable,
    args: request.invocation.args,
    cwd: request.invocation.cwd,
    shellType: request.invocation.shellType,
    timeoutMs: request.invocation.timeoutMs,
    metadata: {
      ...(request.metadata ?? {}),
      ...(request.invocation.metadata ?? {}),
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
      runtimeId: runtimeId ?? "",
      invocationId: invocationId ?? "",
      executable: commandResult.plan.command,
      args: commandResult.plan.args,
      cwd: commandResult.plan.cwd,
      shellType: commandResult.plan.shellType,
      env: env.env,
      commandPlan: commandResult.plan,
      requiredPermissions: ["shell:execute:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      unsafeSideEffects: false,
      acceptedScopes: commandResult.plan.acceptedScopes,
      audit: {
        event: "basicTool.shell.invocationExecution.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
          ...(request.invocation.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.shell.invocationExecution.planned", ...commandResult.events],
  };
}
