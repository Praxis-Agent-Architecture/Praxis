/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Inspector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeInspectionAudience = "application" | "official-module" | "management" | "inspection" | "debug";

export type RuntimeInspectionBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "surface"
  | "module"
  | "invariant"
  | "check"
  | "scope";

export type RuntimeInspectionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MISSING_INSPECTION_SIGNAL"
  | "MISSING_CONTRACT_ID"
  | "MISSING_POLICY_ID"
  | "MISSING_CHECK_ID"
  | "CHECK_REJECTED"
  | "CHECK_FAILED"
  | "CONTRACT_MISSING"
  | "GOVERNANCE_POLICY_MISSING"
  | "SURFACE_NOT_READY"
  | "MODULE_NOT_MOUNTED"
  | "INVARIANT_FAILED"
  | "SCOPE_DENIED";

export type RuntimeInspectionGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeInspectionSeverity = "info" | "warning" | "error";

export type RuntimeInspectionError = {
  code: RuntimeInspectionErrorCode;
  message: string;
  boundary: RuntimeInspectionBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeInspectionFailure = {
  ok: false;
  error: RuntimeInspectionError;
  events: readonly string[];
};

export type RuntimeInspectionFinding = {
  findingId: string;
  severity: RuntimeInspectionSeverity;
  boundary: RuntimeInspectionBoundary;
  message: string;
  relatedSurface?: string;
  remediation?: string;
};

export type RuntimeInspectionSignal = {
  signalId?: string;
  boundary?: RuntimeInspectionBoundary;
  ready?: boolean;
  findings?: readonly RuntimeInspectionFinding[];
  events?: readonly string[];
};

export type RuntimeInspectionRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  audience?: RuntimeInspectionAudience;
  contract?: RuntimeInspectionGate;
  governance?: RuntimeInspectionGate;
  surfaces?: Readonly<Record<string, boolean>> | readonly RuntimeInspectionSignal[];
  modules?: readonly RuntimeInspectionSignal[];
  invariants?: readonly RuntimeInspectionSignal[];
};

export type RuntimeInspectionStatus = "ready" | "degraded" | "blocked";

export type RuntimeInspectionSnapshot = {
  runtimeId: string;
  status: RuntimeInspectionStatus;
  audience?: RuntimeInspectionAudience;
  findings: readonly RuntimeInspectionFinding[];
  checkedSurfaces: readonly string[];
  checkedModules: readonly string[];
  checkedInvariants: readonly string[];
  inspectionSurface: "runtime.inspection.runtimeInspector";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeInspectionResult =
  | {
      ok: true;
      snapshot: RuntimeInspectionSnapshot;
      events: readonly string[];
    }
  | RuntimeInspectionFailure;

export function isRuntimeInspectionBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function cleanRuntimeInspectionList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function runtimeInspectionError(
  code: RuntimeInspectionErrorCode,
  message: string,
  boundary: RuntimeInspectionBoundary,
): RuntimeInspectionError {
  return {
    code,
    message,
    boundary,
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

export function rejectRuntimeInspection(
  code: RuntimeInspectionErrorCode,
  message: string,
  boundary: RuntimeInspectionBoundary,
  event = "runtime.inspection.rejected",
): RuntimeInspectionFailure {
  return {
    ok: false,
    error: runtimeInspectionError(code, message, boundary),
    events: [event],
  };
}

function normalizeSurfaceSignals(
  surfaces: RuntimeInspectionRequest["surfaces"],
): readonly RuntimeInspectionSignal[] {
  if (surfaces === undefined) {
    return [];
  }

  if (Array.isArray(surfaces)) {
    return surfaces;
  }

  return Object.entries(surfaces).map(([surfaceId, ready]) => ({
    signalId: surfaceId,
    boundary: "surface",
    ready,
  }));
}

function signalId(signal: RuntimeInspectionSignal, fallbackPrefix: string, index: number): string {
  return isRuntimeInspectionBlank(signal.signalId) ? `${fallbackPrefix}:${index}` : (signal.signalId ?? "").trim();
}

function signalFindings(
  signal: RuntimeInspectionSignal,
  fallbackPrefix: string,
  index: number,
): readonly RuntimeInspectionFinding[] {
  if (signal.findings !== undefined && signal.findings.length > 0) {
    return signal.findings;
  }

  if (signal.ready === false) {
    const id = signalId(signal, fallbackPrefix, index);
    const boundary = signal.boundary ?? "surface";
    return [
      {
        findingId: `${id}.not-ready`,
        severity: "error",
        boundary,
        message: `runtime inspection signal is not ready: ${id}`,
        relatedSurface: id,
      },
    ];
  }

  return [];
}

function collectSignals(
  signals: readonly RuntimeInspectionSignal[],
  fallbackPrefix: string,
): {
  ids: readonly string[];
  findings: readonly RuntimeInspectionFinding[];
  events: readonly string[];
} {
  const ids: string[] = [];
  const findings: RuntimeInspectionFinding[] = [];
  const events: string[] = [];

  signals.forEach((signal, index) => {
    ids.push(signalId(signal, fallbackPrefix, index));
    findings.push(...signalFindings(signal, fallbackPrefix, index));
    events.push(...(signal.events ?? []));
  });

  return { ids, findings, events };
}

function statusFromFindings(findings: readonly RuntimeInspectionFinding[]): RuntimeInspectionStatus {
  if (findings.some((finding) => finding.severity === "error")) {
    return "blocked";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "degraded";
  }

  return "ready";
}

export function inspectRuntime(request: RuntimeInspectionRequest = {}): RuntimeInspectionResult {
  if (isRuntimeInspectionBlank(request.runtimeId)) {
    return rejectRuntimeInspection(
      "MISSING_RUNTIME_ID",
      "runtime inspector requires a runtimeId",
      "input",
      "runtime.inspection.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeInspection(
      "RUNTIME_NOT_READY",
      "runtime inspector can only inspect a ready runtime surface",
      "runtime-state",
      "runtime.inspection.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeInspection(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime inspection was rejected by contract surface",
      "contract",
      "runtime.inspection.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeInspection(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime inspection was rejected by governance",
      "governance",
      "runtime.inspection.rejected",
    );
  }

  const surfaceSignals = collectSignals(normalizeSurfaceSignals(request.surfaces), "surface");
  const moduleSignals = collectSignals(request.modules ?? [], "module");
  const invariantSignals = collectSignals(request.invariants ?? [], "invariant");
  const findings = [...surfaceSignals.findings, ...moduleSignals.findings, ...invariantSignals.findings];
  const status = statusFromFindings(findings);

  return {
    ok: true,
    snapshot: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      audience: request.audience,
      findings,
      checkedSurfaces: surfaceSignals.ids,
      checkedModules: moduleSignals.ids,
      checkedInvariants: invariantSignals.ids,
      inspectionSurface: "runtime.inspection.runtimeInspector",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [
      `runtime.inspection.${status}`,
      ...surfaceSignals.events,
      ...moduleSignals.events,
      ...invariantSignals.events,
    ],
  };
}
