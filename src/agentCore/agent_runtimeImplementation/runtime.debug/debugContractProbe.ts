/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Contract Probe 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugContractProbeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type DebugContractProbeCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "debug";

export type DebugContractProbeCaller = {
  kind: DebugContractProbeCallerKind;
  id: string;
  moduleId?: string;
};

export type DebugContractProbeGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugContractExpectation = {
  contractId: string;
  surface: string;
  required?: boolean;
  satisfied: boolean;
  reason?: string;
};

export type DebugContractProbeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CONTRACT_VIOLATED";

export type DebugContractProbeRequest = {
  runtimeId?: string;
  caller?: DebugContractProbeCaller;
  runtimeReady?: boolean;
  contract?: DebugContractProbeGate;
  governance?: DebugContractProbeGate;
  expectations?: readonly DebugContractExpectation[];
  requestedScopes?: readonly string[];
  grantedScopes?: readonly string[];
};

export type DebugContractProbeReport = {
  runtimeId: string;
  caller: DebugContractProbeCaller;
  status: "satisfied" | "violated";
  checkedContracts: readonly DebugContractExpectation[];
  failedContracts: readonly DebugContractExpectation[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  probeSurface: "runtime.debug.debugContractProbe";
  contractChecked: true;
  governanceChecked: true;
  readonly: true;
  unsafeSideEffects: false;
};

export type DebugContractProbeError = {
  code: DebugContractProbeErrorCode;
  message: string;
  boundary: DebugContractProbeBoundary;
  publicSafe: true;
};

export type DebugContractProbeResult =
  | {
      ok: true;
      report: DebugContractProbeReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugContractProbeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugContractProbeCaller): DebugContractProbeCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
  };
}

function normalizeExpectation(expectation: DebugContractExpectation): DebugContractExpectation {
  return {
    contractId: expectation.contractId.trim(),
    surface: expectation.surface.trim(),
    required: expectation.required ?? true,
    satisfied: expectation.satisfied,
    reason: expectation.reason?.trim() || undefined,
  };
}

function failure(
  code: DebugContractProbeErrorCode,
  message: string,
  boundary: DebugContractProbeBoundary,
): DebugContractProbeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.debug.contractProbe.rejected"],
  };
}

export function probeDebugContract(request: DebugContractProbeRequest = {}): DebugContractProbeResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug contract probe requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "debug contract probe requires a caller with a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug contract probe can only inspect a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "debug contract probe was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug contract probe was rejected by governance",
      "governance",
    );
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const grantedScopes = cleanList(request.grantedScopes);
  const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));
  const checkedContracts = (request.expectations ?? []).map(normalizeExpectation);
  const failedContracts = checkedContracts.filter((expectation) => expectation.required !== false && !expectation.satisfied);

  if (failedContracts.length > 0) {
    return failure(
      "CONTRACT_VIOLATED",
      `debug contract probe found failed runtime contracts: ${failedContracts
        .map((expectation) => expectation.contractId)
        .join(", ")}`,
      "contract",
    );
  }

  const status = missingScopes.length > 0 ? "violated" : "satisfied";

  return {
    ok: true,
    report: {
      runtimeId: (request.runtimeId ?? "").trim(),
      caller: normalizeCaller(request.caller),
      status,
      checkedContracts,
      failedContracts,
      requestedScopes,
      grantedScopes,
      missingScopes,
      probeSurface: "runtime.debug.debugContractProbe",
      contractChecked: true,
      governanceChecked: true,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.debug.contractProbe.${status}`],
  };
}
