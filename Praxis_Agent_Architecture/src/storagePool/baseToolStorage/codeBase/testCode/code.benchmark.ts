/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码测试工具。
 * 核心目的：提供 代码基础工具 / 代码测试工具 中的“执行性能或行为基准测试”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeBenchmarkBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type CodeBenchmarkGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeBenchmarkRequest = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  benchmarkTarget?: string;
  command?: readonly string[];
  metric?: string;
  iterations?: number;
  timeoutMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeBenchmarkGate;
  governance?: CodeBenchmarkGate;
};

export type CodeBenchmarkErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_BENCHMARK_TARGET"
  | "INVALID_COMMAND"
  | "INVALID_ITERATIONS"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeBenchmarkError = {
  code: CodeBenchmarkErrorCode;
  message: string;
  boundary: CodeBenchmarkBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeBenchmarkPlan = {
  toolKind: "code.benchmark";
  runtimeId: string;
  invocationId: string;
  workspaceRoot: string;
  benchmarkTarget: string;
  command: readonly string[];
  metric: string;
  iterations: number;
  timeoutMs: number;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    benchmarkExecuted: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "benchmark-code";
    governanceRequired: true;
    tapCanWrap: true;
  };
};

export type CodeBenchmarkResult =
  | {
      ok: true;
      plan: CodeBenchmarkPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeBenchmarkError;
      events: readonly string[];
    };

export const codeBenchmarkDescriptor = {
  toolKind: "code.benchmark",
  purpose: "prepare a governed dry-run benchmark execution envelope for code targets",
  defaultMetric: "duration-ms",
  defaultIterations: 1,
  defaultTimeoutMs: 30_000,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CodeBenchmarkErrorCode,
  message: string,
  boundary: CodeBenchmarkBoundary,
): CodeBenchmarkResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.benchmark.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeBenchmarkResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code benchmark scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeCommand(command: readonly string[] | undefined): string[] | CodeBenchmarkResult {
  if (command === undefined) {
    return [];
  }

  const normalized = cleanList(command);
  if (normalized.length !== command.length) {
    return failure("INVALID_COMMAND", "code benchmark command entries must be non-empty strings", "input");
  }

  return normalized;
}

export function planCodeBenchmark(request?: CodeBenchmarkRequest): CodeBenchmarkResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code benchmark requires runtimeId", "input");
  }

  if (!hasText(request.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "code benchmark requires a workspaceRoot", "input");
  }

  if (!hasText(request.benchmarkTarget)) {
    return failure("MISSING_BENCHMARK_TARGET", "code benchmark requires a benchmarkTarget", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round code benchmark only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code benchmark was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code benchmark was rejected by runtime governance",
      "governance",
    );
  }

  const command = normalizeCommand(request.command);
  if (!Array.isArray(command)) {
    return command;
  }

  const iterations = request.iterations ?? codeBenchmarkDescriptor.defaultIterations;
  if (!Number.isInteger(iterations) || iterations < 1) {
    return failure("INVALID_ITERATIONS", "code benchmark iterations must be a positive integer", "resource");
  }

  const timeoutMs = request.timeoutMs ?? codeBenchmarkDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    return failure("INVALID_TIMEOUT", "code benchmark timeoutMs must be a positive integer", "resource");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const benchmarkTarget = request.benchmarkTarget.trim();

  return {
    ok: true,
    plan: {
      toolKind: "code.benchmark",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:code.benchmark:${benchmarkTarget}`,
      workspaceRoot: request.workspaceRoot.trim(),
      benchmarkTarget,
      command,
      metric: request.metric?.trim() || codeBenchmarkDescriptor.defaultMetric,
      iterations,
      timeoutMs,
      permissions: ["workspace:read", "process:spawn:dry-run"],
      acceptedScopes,
      execution: {
        dryRun: true,
        benchmarkExecuted: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "benchmark-code",
        governanceRequired: true,
        tapCanWrap: true,
      },
    },
    events: ["basicTool.code.benchmark.planned"],
  };
}
