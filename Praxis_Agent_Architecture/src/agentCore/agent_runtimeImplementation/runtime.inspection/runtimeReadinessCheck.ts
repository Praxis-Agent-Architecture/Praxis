/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Readiness Check 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeReadinessCheckBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeReadinessStatus = "ready" | "blocked" | "degraded";

export type RuntimeReadinessCheckErrorCode =
  | "MISSING_RUNTIME_ID"
  | "EMPTY_READINESS_INPUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeReadinessCheckGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeReadinessSignal = {
  signalId?: string;
  ready?: boolean;
  required?: boolean;
  reason?: string;
};

export type RuntimeReadinessCheckRequest = {
  runtimeId?: string;
  surfaces?: readonly RuntimeReadinessSignal[];
  modules?: readonly RuntimeReadinessSignal[];
  invariants?: readonly RuntimeReadinessSignal[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeReadinessCheckGate;
  governance?: RuntimeReadinessCheckGate;
  checkedAt?: string;
};

export type RuntimeReadinessIssue = {
  signalId: string;
  source: "surface" | "module" | "invariant";
  required: boolean;
  reason: string;
};

export type RuntimeReadinessSnapshot = {
  runtimeId: string;
  status: RuntimeReadinessStatus;
  ready: boolean;
  surface: "runtime.inspection.runtimeReadinessCheck";
  requiredSignals: readonly string[];
  optionalSignals: readonly string[];
  blockingIssues: readonly RuntimeReadinessIssue[];
  degradedIssues: readonly RuntimeReadinessIssue[];
  acceptedScopes: readonly string[];
  checkedAt: string;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeReadinessCheckError = {
  code: RuntimeReadinessCheckErrorCode;
  message: string;
  boundary: RuntimeReadinessCheckBoundary;
  safeForRuntimeInspection: true;
};

export type RuntimeReadinessCheckResult =
  | {
      ok: true;
      readiness: RuntimeReadinessSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeReadinessCheckError;
      events: readonly string[];
    };

export const runtimeReadinessCheckDescriptor = {
  surface: "runtime.inspection",
  capability: "runtimeReadinessCheck",
  purpose: "aggregate readonly runtime surface, module, and invariant readiness signals",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeReadinessCheckErrorCode,
  message: string,
  boundary: RuntimeReadinessCheckBoundary,
): RuntimeReadinessCheckResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["runtime.inspection.readinessCheck.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeReadinessCheckResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `runtime readiness check scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function normalizeSignals(
  source: RuntimeReadinessIssue["source"],
  signals: readonly RuntimeReadinessSignal[] | undefined,
): readonly (RuntimeReadinessSignal & { signalId: string; source: RuntimeReadinessIssue["source"] })[] {
  return (signals ?? [])
    .map((signal, index) => ({
      ...signal,
      signalId: signal.signalId?.trim() || `${source}:${index + 1}`,
      source,
    }))
    .filter((signal) => !isBlank(signal.signalId));
}

function toIssue(
  signal: RuntimeReadinessSignal & { signalId: string; source: RuntimeReadinessIssue["source"] },
): RuntimeReadinessIssue | undefined {
  if (signal.ready !== false) {
    return undefined;
  }

  return {
    signalId: signal.signalId,
    source: signal.source,
    required: signal.required !== false,
    reason: signal.reason?.trim() || `${signal.signalId} is not ready`,
  };
}

export function checkRuntimeReadiness(request?: RuntimeReadinessCheckRequest): RuntimeReadinessCheckResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime readiness check requires a runtimeId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime readiness check was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime readiness check was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const signals = [
    ...normalizeSignals("surface", request.surfaces),
    ...normalizeSignals("module", request.modules),
    ...normalizeSignals("invariant", request.invariants),
  ];

  if (signals.length === 0) {
    return failure("EMPTY_READINESS_INPUT", "runtime readiness check requires at least one readiness signal", "input");
  }

  const issues = signals.map(toIssue).filter((issue): issue is RuntimeReadinessIssue => issue !== undefined);
  const blockingIssues = issues.filter((issue) => issue.required);
  const degradedIssues = issues.filter((issue) => !issue.required);
  const status: RuntimeReadinessStatus =
    blockingIssues.length > 0 ? "blocked" : degradedIssues.length > 0 ? "degraded" : "ready";

  return {
    ok: true,
    readiness: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      ready: status === "ready",
      surface: "runtime.inspection.runtimeReadinessCheck",
      requiredSignals: signals.filter((signal) => signal.required !== false).map((signal) => signal.signalId),
      optionalSignals: signals.filter((signal) => signal.required === false).map((signal) => signal.signalId),
      blockingIssues,
      degradedIssues,
      acceptedScopes,
      checkedAt: request.checkedAt?.trim() || "dry-run",
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.readinessCheck.${status}`],
  };
}
