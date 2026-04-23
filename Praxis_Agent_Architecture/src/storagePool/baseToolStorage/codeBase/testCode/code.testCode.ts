/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码测试工具。
 * 核心目的：提供 代码基础工具 / 代码测试工具 中的“执行代码测试”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeTestBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type CodeTestGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeTestRequest = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  testTarget?: string;
  command?: readonly string[];
  testFramework?: string;
  updateSnapshots?: boolean;
  timeoutMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeTestGate;
  governance?: CodeTestGate;
};

export type CodeTestErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TEST_TARGET"
  | "INVALID_COMMAND"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeTestError = {
  code: CodeTestErrorCode;
  message: string;
  boundary: CodeTestBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeTestPlan = {
  toolKind: "code.testCode";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  testTarget: string;
  command: readonly string[];
  testFramework?: string;
  updateSnapshots: boolean;
  timeoutMs: number;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    testsExecuted: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "test-code";
    governanceRequired: true;
    tapCanWrap: true;
  };
};

export type CodeTestResult =
  | {
      ok: true;
      plan: CodeTestPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeTestError;
      events: readonly string[];
    };

export const codeTestDescriptor = {
  toolKind: "code.testCode",
  purpose: "prepare a governed dry-run test execution envelope for code targets",
  defaultTimeoutMs: 60_000,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CodeTestErrorCode, message: string, boundary: CodeTestBoundary): CodeTestResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.testCode.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeTestResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code test scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeCommand(command: readonly string[] | undefined): string[] | CodeTestResult {
  if (command === undefined) {
    return [];
  }

  const normalized = cleanList(command);
  if (normalized.length !== command.length) {
    return failure("INVALID_COMMAND", "code test command entries must be non-empty strings", "input");
  }

  return normalized;
}

export function planCodeTest(request?: CodeTestRequest): CodeTestResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code test execution requires runtimeId", "input");
  }

  if (!hasText(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code test execution requires a workspaceRoot", "input");
  }

  if (!hasText(request.testTarget)) {
    return failure("MISSING_TEST_TARGET", "code test execution requires a testTarget", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round code test execution only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code test execution was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code test execution was rejected by runtime governance",
      "governance",
    );
  }

  const command = normalizeCommand(request.command);
  if (!Array.isArray(command)) {
    return command;
  }

  const timeoutMs = request.timeoutMs ?? codeTestDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    return failure("INVALID_TIMEOUT", "code test timeoutMs must be a positive integer", "resource");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const testTarget = request.testTarget.trim();

  return {
    ok: true,
    plan: {
      toolKind: "code.testCode",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:code.testCode:${testTarget}`,
      workspaceRoot: request.workspaceRoot.trim(),
      testTarget,
      command,
      testFramework: request.testFramework?.trim() || undefined,
      updateSnapshots: request.updateSnapshots ?? false,
      timeoutMs,
      permissions: ["workspace:read", "process:spawn:dry-run"],
      acceptedScopes,
      execution: {
        dryRun: true,
        testsExecuted: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "test-code",
        governanceRequired: true,
        tapCanWrap: true,
      },
    },
    events: ["basicTool.code.testCode.planned"],
  };
}
