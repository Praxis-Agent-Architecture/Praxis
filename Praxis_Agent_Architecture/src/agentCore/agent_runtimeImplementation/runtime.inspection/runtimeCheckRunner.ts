/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Check Runner 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  isRuntimeInspectionBlank,
  rejectRuntimeInspection,
  type RuntimeInspectionBoundary,
  type RuntimeInspectionFailure,
  type RuntimeInspectionFinding,
  type RuntimeInspectionGate,
} from "./runtimeInspector.js";

export type RuntimeCheckStatus = "pass" | "warn" | "fail" | "skip";

export type RuntimeCheckDefinition = {
  checkId?: string;
  boundary?: RuntimeInspectionBoundary;
  status?: RuntimeCheckStatus;
  required?: boolean;
  findings?: readonly RuntimeInspectionFinding[];
  events?: readonly string[];
};

export type RuntimeCheckRunnerRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  dryRun?: boolean;
  checks?: readonly RuntimeCheckDefinition[];
  contract?: RuntimeInspectionGate;
  governance?: RuntimeInspectionGate;
};

export type RuntimeCheckRunnerStatus = "passed" | "warning" | "failed" | "skipped";

export type RuntimeCheckRunnerReport = {
  runtimeId: string;
  status: RuntimeCheckRunnerStatus;
  executedChecks: readonly string[];
  skippedChecks: readonly string[];
  findings: readonly RuntimeInspectionFinding[];
  dryRun: true;
  auditOnly: true;
  checkSurface: "runtime.inspection.runtimeCheckRunner";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeCheckRunnerResult =
  | {
      ok: true;
      report: RuntimeCheckRunnerReport;
      events: readonly string[];
    }
  | RuntimeInspectionFailure;

function normalizeCheck(check: RuntimeCheckDefinition, index: number): RuntimeCheckDefinition | RuntimeInspectionFailure {
  if (isRuntimeInspectionBlank(check.checkId)) {
    return rejectRuntimeInspection(
      "MISSING_CHECK_ID",
      `runtime check runner requires every check to declare a checkId at index ${index}`,
      "input",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  return {
    checkId: (check.checkId ?? "").trim(),
    boundary: check.boundary ?? "check",
    status: check.status ?? "pass",
    required: check.required ?? true,
    findings: check.findings ?? [],
    events: check.events ?? [],
  };
}

function isFailure(value: RuntimeCheckDefinition | RuntimeInspectionFailure): value is RuntimeInspectionFailure {
  return "ok" in value && value.ok === false;
}

function defaultFinding(check: RuntimeCheckDefinition): RuntimeInspectionFinding | undefined {
  if (check.status !== "fail" && check.status !== "warn") {
    return undefined;
  }

  return {
    findingId: `${check.checkId ?? "check"}.${check.status}`,
    severity: check.status === "fail" ? "error" : "warning",
    boundary: check.boundary ?? "check",
    message: `runtime check ${check.checkId ?? "check"} completed with status ${check.status}`,
  };
}

function runnerStatus(
  checks: readonly RuntimeCheckDefinition[],
  findings: readonly RuntimeInspectionFinding[],
): RuntimeCheckRunnerStatus {
  if (checks.length === 0 || checks.every((check) => check.status === "skip")) {
    return "skipped";
  }

  if (checks.some((check) => check.status === "fail") || findings.some((finding) => finding.severity === "error")) {
    return "failed";
  }

  if (checks.some((check) => check.status === "warn") || findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }

  return "passed";
}

export function runRuntimeChecks(request: RuntimeCheckRunnerRequest = {}): RuntimeCheckRunnerResult {
  if (isRuntimeInspectionBlank(request.runtimeId)) {
    return rejectRuntimeInspection(
      "MISSING_RUNTIME_ID",
      "runtime check runner requires a runtimeId",
      "input",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeInspection(
      "RUNTIME_NOT_READY",
      "runtime checks can only run against a ready runtime surface",
      "runtime-state",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  if (request.dryRun === false) {
    return rejectRuntimeInspection(
      "CHECK_REJECTED",
      "runtime check runner only supports dry-run audit envelopes in the first implementation",
      "check",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeInspection(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime check runner was rejected by contract surface",
      "contract",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeInspection(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime check runner was rejected by governance",
      "governance",
      "runtime.inspection.checkRunner.rejected",
    );
  }

  const checks: RuntimeCheckDefinition[] = [];
  for (const [index, check] of (request.checks ?? []).entries()) {
    const normalized = normalizeCheck(check, index);
    if (isFailure(normalized)) {
      return normalized;
    }
    checks.push(normalized);
  }

  const executedChecks = checks
    .filter((check) => check.status !== "skip")
    .map((check) => check.checkId ?? "");
  const skippedChecks = checks
    .filter((check) => check.status === "skip")
    .map((check) => check.checkId ?? "");
  const findings = checks.flatMap((check) => {
    const explicitFindings = [...(check.findings ?? [])];
    const fallbackFinding = defaultFinding(check);
    return fallbackFinding === undefined ? explicitFindings : [...explicitFindings, fallbackFinding];
  });
  const status = runnerStatus(checks, findings);

  return {
    ok: true,
    report: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      executedChecks,
      skippedChecks,
      findings,
      dryRun: true,
      auditOnly: true,
      checkSurface: "runtime.inspection.runtimeCheckRunner",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.checkRunner.${status}`, ...checks.flatMap((check) => check.events ?? [])],
  };
}
