/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Health Check 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeHealthCheckBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "surface"
  | "module"
  | "dependency"
  | "scope";

export type RuntimeHealthStatus = "healthy" | "degraded" | "unhealthy";

export type RuntimeHealthSeverity = "warning" | "critical";

export type RuntimeHealthCheckErrorCode =
  | "MISSING_RUNTIME_ID"
  | "RUNTIME_NOT_READY"
  | "EMPTY_HEALTH_INPUT"
  | "UNSAFE_HEALTH_CHECK_REJECTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeHealthCheckGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeHealthSignal = {
  signalId?: string;
  healthy?: boolean;
  required?: boolean;
  severity?: RuntimeHealthSeverity;
  message?: string;
};

export type RuntimeHealthCheckRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  dryRun?: boolean;
  surfaces?: readonly RuntimeHealthSignal[];
  modules?: readonly RuntimeHealthSignal[];
  dependencies?: readonly RuntimeHealthSignal[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeHealthCheckGate;
  governance?: RuntimeHealthCheckGate;
  checkedAt?: string;
};

export type RuntimeHealthIssue = {
  signalId: string;
  boundary: Extract<RuntimeHealthCheckBoundary, "surface" | "module" | "dependency">;
  severity: RuntimeHealthSeverity;
  required: boolean;
  message: string;
};

export type RuntimeHealthSnapshot = {
  runtimeId: string;
  status: RuntimeHealthStatus;
  healthy: boolean;
  healthSurface: "runtime.healthCheck";
  checkedSurfaces: readonly string[];
  checkedModules: readonly string[];
  checkedDependencies: readonly string[];
  issues: readonly RuntimeHealthIssue[];
  acceptedScopes: readonly string[];
  checkedAt: string;
  dryRun: true;
  auditOnly: true;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeHealthCheckError = {
  code: RuntimeHealthCheckErrorCode;
  message: string;
  boundary: RuntimeHealthCheckBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeHealthCheckResult =
  | {
      ok: true;
      health: RuntimeHealthSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeHealthCheckError;
      events: readonly string[];
    };

export const runtimeHealthCheckDescriptor = {
  surface: "runtime",
  capability: "runtimeHealthCheck",
  purpose: "aggregate readonly runtime health signals for applications, official modules, and inspection/debug surfaces",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function rejectRuntimeHealthCheck(
  code: RuntimeHealthCheckErrorCode,
  message: string,
  boundary: RuntimeHealthCheckBoundary,
): RuntimeHealthCheckResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.healthCheck.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeHealthCheckResult {
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
    return rejectRuntimeHealthCheck("SCOPE_DENIED", `runtime health check scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function normalizeSignals(
  boundary: RuntimeHealthIssue["boundary"],
  signals: readonly RuntimeHealthSignal[] | undefined,
): readonly (RuntimeHealthSignal & { signalId: string; boundary: RuntimeHealthIssue["boundary"] })[] {
  return (signals ?? []).map((signal, index) => ({
    ...signal,
    signalId: signal.signalId?.trim() || `${boundary}:${index + 1}`,
    boundary,
  }));
}

function signalIssue(
  signal: RuntimeHealthSignal & { signalId: string; boundary: RuntimeHealthIssue["boundary"] },
): RuntimeHealthIssue | undefined {
  if (signal.healthy !== false) {
    return undefined;
  }

  const required = signal.required !== false;
  const severity = signal.severity ?? (required ? "critical" : "warning");

  return {
    signalId: signal.signalId,
    boundary: signal.boundary,
    severity,
    required,
    message: signal.message?.trim() || `${signal.signalId} is unhealthy`,
  };
}

function healthStatus(issues: readonly RuntimeHealthIssue[]): RuntimeHealthStatus {
  if (issues.some((issue) => issue.severity === "critical")) {
    return "unhealthy";
  }

  if (issues.length > 0) {
    return "degraded";
  }

  return "healthy";
}

export function checkRuntimeHealth(request: RuntimeHealthCheckRequest = {}): RuntimeHealthCheckResult {
  if (isBlank(request.runtimeId)) {
    return rejectRuntimeHealthCheck("MISSING_RUNTIME_ID", "runtime health check requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeHealthCheck(
      "RUNTIME_NOT_READY",
      "runtime health check can only inspect a ready runtime envelope",
      "runtime-state",
    );
  }

  if (request.dryRun === false) {
    return rejectRuntimeHealthCheck(
      "UNSAFE_HEALTH_CHECK_REJECTED",
      "runtime health check only supports dry-run audit envelopes in the first implementation",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeHealthCheck(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime health check was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeHealthCheck(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime health check was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const surfaceSignals = normalizeSignals("surface", request.surfaces);
  const moduleSignals = normalizeSignals("module", request.modules);
  const dependencySignals = normalizeSignals("dependency", request.dependencies);
  const signals = [...surfaceSignals, ...moduleSignals, ...dependencySignals];

  if (signals.length === 0) {
    return rejectRuntimeHealthCheck(
      "EMPTY_HEALTH_INPUT",
      "runtime health check requires at least one health signal",
      "input",
    );
  }

  const issues = signals.map(signalIssue).filter((issue): issue is RuntimeHealthIssue => issue !== undefined);
  const status = healthStatus(issues);

  return {
    ok: true,
    health: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      healthy: status === "healthy",
      healthSurface: "runtime.healthCheck",
      checkedSurfaces: surfaceSignals.map((signal) => signal.signalId),
      checkedModules: moduleSignals.map((signal) => signal.signalId),
      checkedDependencies: dependencySignals.map((signal) => signal.signalId),
      issues,
      acceptedScopes,
      checkedAt: request.checkedAt?.trim() || "dry-run",
      dryRun: true,
      auditOnly: true,
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.healthCheck.${status}`],
  };
}
