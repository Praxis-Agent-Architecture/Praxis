/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行守卫。
 * 核心目的：提供 Shell 基础工具 / 执行守卫 中的“执行沙箱约束”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type ShellSandboxEnforcementPermission = "shell:sandbox";

export type ShellSandboxEnforcementBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type ShellSandboxDecision = "enforced" | "requires-approval" | "rejected";

export type ShellSandboxAccessIntent = "read" | "write" | "execute";

export type ShellSandboxEnforcementContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellSandboxEnforcementPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellSandboxEnforcementPolicy = {
  sandboxRoots?: readonly string[];
  allowNetwork?: boolean;
  allowHostEnvironment?: boolean;
  maxPathCount?: number;
};

export type ShellSandboxEnforcementRequest = {
  command?: string;
  workingDirectory?: string;
  requestedPaths?: readonly string[];
  accessIntents?: readonly ShellSandboxAccessIntent[];
  policy?: ShellSandboxEnforcementPolicy;
  context?: ShellSandboxEnforcementContext;
};

export type ShellSandboxEnforcementErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_WORKING_DIRECTORY"
  | "MISSING_SANDBOX_ROOT"
  | "INVALID_ACCESS_INTENT"
  | "PATH_LIMIT_EXCEEDED"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellSandboxEnforcementError = {
  code: ShellSandboxEnforcementErrorCode;
  message: string;
  boundary: ShellSandboxEnforcementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellSandboxEnforcementAuditEvent = {
  type: string;
  toolId: "shell.sandboxEnforcement";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellSandboxEnforcementOutput = {
  kind: "agentCore.basicTool.shell.sandboxEnforcement";
  command: string;
  workingDirectory: string;
  sandboxRoots: readonly string[];
  requestedPaths: readonly string[];
  accessIntents: readonly ShellSandboxAccessIntent[];
  decision: ShellSandboxDecision;
  reasons: readonly string[];
  requiredPermission: ShellSandboxEnforcementPermission;
  requiresTapApproval: boolean;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellSandboxEnforcementResult =
  | {
      ok: true;
      toolId: "shell.sandboxEnforcement";
      output: ShellSandboxEnforcementOutput;
      audit: readonly ShellSandboxEnforcementAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.sandboxEnforcement";
      error: ShellSandboxEnforcementError;
      audit: readonly ShellSandboxEnforcementAuditEvent[];
      events: readonly string[];
    };

export const shellSandboxEnforcementDescriptor = {
  toolId: "shell.sandboxEnforcement",
  capability: "shell-execution-sandbox-enforcement",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionGuard",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermission: "shell:sandbox",
  unsafeSideEffects: false,
} as const;

const validAccessIntents = new Set<ShellSandboxAccessIntent>(["read", "write", "execute"]);
const defaultMaxPathCount = 32;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellSandboxEnforcementContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellSandboxEnforcementContext | undefined): string {
  return context?.invocationId?.trim() || "shell.sandboxEnforcement:dry-run";
}

function normalizePath(value: string): string {
  const normalized = path.posix.normalize(value.trim().replaceAll("\\", "/"));
  return normalized === "." || normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function isInsideScope(path: string, scope: readonly string[]): boolean {
  const normalizedPath = normalizePath(path);
  return scope.some((root) => {
    const normalizedRoot = normalizePath(root);
    if (normalizedRoot === "/") {
      return normalizedPath.startsWith("/");
    }

    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
  });
}

function auditEvent(
  type: string,
  context: ShellSandboxEnforcementContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellSandboxEnforcementAuditEvent {
  return {
    type,
    toolId: shellSandboxEnforcementDescriptor.toolId,
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
  code: ShellSandboxEnforcementErrorCode,
  message: string,
  boundary: ShellSandboxEnforcementBoundary,
  context: ShellSandboxEnforcementContext | undefined,
  workingDirectory?: string,
): ShellSandboxEnforcementResult {
  return {
    ok: false,
    toolId: shellSandboxEnforcementDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.sandboxEnforcement.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.sandboxEnforcement.rejected"],
  };
}

function ensurePermission(
  context: ShellSandboxEnforcementContext | undefined,
  workingDirectory: string,
): ShellSandboxEnforcementResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context.grantedPermissions);
  if (granted.includes(shellSandboxEnforcementDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.sandboxEnforcement is missing permission: shell:sandbox",
    "permission",
    context,
    workingDirectory,
  );
}

function ensureDryRunOnly(
  context: ShellSandboxEnforcementContext | undefined,
  workingDirectory: string,
): ShellSandboxEnforcementResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.sandboxEnforcement only returns a guarded sandbox envelope in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

function normalizeAccessIntents(
  values: readonly ShellSandboxAccessIntent[] | undefined,
):
  | { ok: true; value: readonly ShellSandboxAccessIntent[] }
  | { ok: false; error: ShellSandboxEnforcementError } {
  const intents = cleanList(values ?? ["execute"]);
  for (const intent of intents) {
    if (!validAccessIntents.has(intent)) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACCESS_INTENT",
          message: "shell.sandboxEnforcement accessIntents must be read, write, or execute",
          boundary: "input",
          publicSafe: true,
          internalDetailExposed: false,
        },
      };
    }
  }

  return { ok: true, value: intents };
}

export function enforceShellSandbox(
  request: ShellSandboxEnforcementRequest = {},
): ShellSandboxEnforcementResult {
  const command = request.command?.trim() ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.sandboxEnforcement requires a non-empty command", "input", request.context);
  }

  const workingDirectory = request.workingDirectory?.trim() ?? "";
  if (workingDirectory.length === 0) {
    return failure(
      "MISSING_WORKING_DIRECTORY",
      "shell.sandboxEnforcement requires an explicit workingDirectory",
      "input",
      request.context,
    );
  }

  const sandboxRoots = cleanList(request.policy?.sandboxRoots).map(normalizePath);
  if (sandboxRoots.length === 0) {
    return failure(
      "MISSING_SANDBOX_ROOT",
      "shell.sandboxEnforcement requires at least one sandbox root",
      "input",
      request.context,
      workingDirectory,
    );
  }

  const requestedPaths = cleanList(request.requestedPaths).map(normalizePath);
  const maxPathCount = request.policy?.maxPathCount ?? defaultMaxPathCount;
  if (requestedPaths.length > maxPathCount) {
    return failure(
      "PATH_LIMIT_EXCEEDED",
      "shell.sandboxEnforcement requestedPaths exceed the configured sandbox path limit",
      "governance",
      request.context,
      workingDirectory,
    );
  }

  const accessIntents = normalizeAccessIntents(request.accessIntents);
  if (!accessIntents.ok) {
    return failure(accessIntents.error.code, accessIntents.error.message, accessIntents.error.boundary, request.context, workingDirectory);
  }

  const permissionFailure = ensurePermission(request.context, workingDirectory);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context, workingDirectory);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const checkedPaths = [workingDirectory, ...requestedPaths];
  const outsidePaths = checkedPaths.filter((path) => !isInsideScope(path, sandboxRoots));
  if (outsidePaths.length > 0) {
    return failure(
      "SCOPE_REJECTED",
      "shell.sandboxEnforcement blocked a shell request outside the sandbox roots",
      "scope",
      request.context,
      workingDirectory,
    );
  }

  const reasons = ["workingDirectory and requested paths are inside the configured sandbox roots"];
  let decision: ShellSandboxDecision = "enforced";
  let requiresTapApproval = false;

  if (accessIntents.value.includes("write")) {
    decision = "requires-approval";
    requiresTapApproval = true;
    reasons.push("write intent requires TAP approval before shell execution");
  }

  if (request.policy?.allowNetwork === true) {
    decision = "requires-approval";
    requiresTapApproval = true;
    reasons.push("network-enabled shell sandbox requires TAP approval");
  }

  if (request.policy?.allowHostEnvironment === true) {
    decision = "requires-approval";
    requiresTapApproval = true;
    reasons.push("host environment exposure requires TAP approval");
  }

  return {
    ok: true,
    toolId: shellSandboxEnforcementDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.sandboxEnforcement",
      command,
      workingDirectory: normalizePath(workingDirectory),
      sandboxRoots,
      requestedPaths,
      accessIntents: accessIntents.value,
      decision,
      reasons,
      requiredPermission: shellSandboxEnforcementDescriptor.requiredPermission,
      requiresTapApproval,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.sandboxEnforcement.dryRun", request.context, workingDirectory, {
        decision,
        requestedPathCount: requestedPaths.length,
      }),
    ],
    events: [`basicTool.shell.sandboxEnforcement.${decision}`],
  };
}
