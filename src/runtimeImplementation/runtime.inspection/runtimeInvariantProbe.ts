/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Invariant Probe 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeInvariantProbeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeInvariantStatus = "passed" | "failed" | "warning";

export type RuntimeInvariantProbeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "EMPTY_INVARIANT_SET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeInvariantProbeGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeInvariantObservation = {
  invariantId?: string;
  description?: string;
  passed?: boolean;
  severity?: "error" | "warning";
  evidenceRef?: string;
};

export type RuntimeInvariantProbeRequest = {
  runtimeId?: string;
  probeId?: string;
  observations?: readonly RuntimeInvariantObservation[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeInvariantProbeGate;
  governance?: RuntimeInvariantProbeGate;
  observedAt?: string;
};

export type RuntimeInvariantProbeFinding = {
  invariantId: string;
  description: string;
  status: RuntimeInvariantStatus;
  severity: "error" | "warning" | "none";
  evidenceRef?: string;
};

export type RuntimeInvariantProbeSnapshot = {
  runtimeId: string;
  probeId: string;
  surface: "runtime.inspection.runtimeInvariantProbe";
  status: RuntimeInvariantStatus;
  findings: readonly RuntimeInvariantProbeFinding[];
  failedInvariantIds: readonly string[];
  warningInvariantIds: readonly string[];
  acceptedScopes: readonly string[];
  observedAt: string;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeInvariantProbeError = {
  code: RuntimeInvariantProbeErrorCode;
  message: string;
  boundary: RuntimeInvariantProbeBoundary;
  safeForRuntimeInspection: true;
};

export type RuntimeInvariantProbeResult =
  | {
      ok: true;
      snapshot: RuntimeInvariantProbeSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeInvariantProbeError;
      events: readonly string[];
    };

export const runtimeInvariantProbeDescriptor = {
  surface: "runtime.inspection",
  capability: "runtimeInvariantProbe",
  purpose: "classify runtime invariant observations without mutating runtime state",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeInvariantProbeErrorCode,
  message: string,
  boundary: RuntimeInvariantProbeBoundary,
): RuntimeInvariantProbeResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["runtime.inspection.invariantProbe.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeInvariantProbeResult {
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
    return failure("SCOPE_DENIED", `runtime invariant probe scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function normalizeFinding(
  observation: RuntimeInvariantObservation,
  index: number,
): RuntimeInvariantProbeFinding | undefined {
  const invariantId = observation.invariantId?.trim() || `invariant:${index + 1}`;
  const description = observation.description?.trim() || invariantId;

  if (isBlank(invariantId) || isBlank(description)) {
    return undefined;
  }

  const passed = observation.passed !== false;
  const severity = passed ? "none" : (observation.severity ?? "error");
  const status: RuntimeInvariantStatus = passed ? "passed" : severity === "warning" ? "warning" : "failed";

  return {
    invariantId,
    description,
    status,
    severity,
    evidenceRef: observation.evidenceRef?.trim() || undefined,
  };
}

function summarizeStatus(findings: readonly RuntimeInvariantProbeFinding[]): RuntimeInvariantStatus {
  if (findings.some((finding) => finding.status === "failed")) {
    return "failed";
  }

  if (findings.some((finding) => finding.status === "warning")) {
    return "warning";
  }

  return "passed";
}

export function probeRuntimeInvariants(request?: RuntimeInvariantProbeRequest): RuntimeInvariantProbeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime invariant probe requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime invariant probe requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime invariant probe was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime invariant probe was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const findings = (request.observations ?? [])
    .map((observation, index) => normalizeFinding(observation, index))
    .filter((finding): finding is RuntimeInvariantProbeFinding => finding !== undefined);

  if (findings.length === 0) {
    return failure("EMPTY_INVARIANT_SET", "runtime invariant probe requires at least one invariant observation", "input");
  }

  const failedInvariantIds = findings
    .filter((finding) => finding.status === "failed")
    .map((finding) => finding.invariantId);
  const warningInvariantIds = findings
    .filter((finding) => finding.status === "warning")
    .map((finding) => finding.invariantId);
  const status = summarizeStatus(findings);
  const runtimeId = (request.runtimeId ?? "").trim();

  return {
    ok: true,
    snapshot: {
      runtimeId,
      probeId: request.probeId?.trim() || `${runtimeId}:runtimeInvariantProbe`,
      surface: "runtime.inspection.runtimeInvariantProbe",
      status,
      findings,
      failedInvariantIds,
      warningInvariantIds,
      acceptedScopes,
      observedAt: request.observedAt?.trim() || "dry-run",
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.invariantProbe.${status}`],
  };
}
