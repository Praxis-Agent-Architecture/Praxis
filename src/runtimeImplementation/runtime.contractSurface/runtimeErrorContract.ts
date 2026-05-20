/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Error Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeContractBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeContractGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeContractSeverity = "info" | "warning" | "recoverable" | "fatal";

export type RuntimeContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTRACT_ID"
  | "MISSING_ERROR_CODE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "RUNTIME_NOT_READY";

export type RuntimeContractError = {
  code: RuntimeContractErrorCode | string;
  message: string;
  boundary: RuntimeContractBoundary;
  severity: RuntimeContractSeverity;
  runtimeId?: string;
  contractId?: string;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeErrorContractRequest = {
  runtimeId: string;
  contractId: string;
  errorCode: string;
  message?: string;
  boundary?: RuntimeContractBoundary;
  severity?: RuntimeContractSeverity;
  runtimeReady?: boolean;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
  internalDetail?: unknown;
};

export type RuntimeErrorContractResult =
  | {
      ok: true;
      errorContract: RuntimeContractError;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeContractError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function normalizeMessage(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function runtimeError(
  code: RuntimeContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
  severity: RuntimeContractSeverity = "recoverable",
): RuntimeContractError {
  return {
    code,
    message,
    boundary,
    severity,
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

function failure(
  code: RuntimeContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeErrorContractResult {
  return {
    ok: false,
    error: runtimeError(code, message, boundary),
    events: ["runtime.error.contract.rejected"],
  };
}

export function defineRuntimeErrorContract(request: RuntimeErrorContractRequest): RuntimeErrorContractResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before defining a runtime error contract", "input");
  }

  if (isBlank(request.contractId)) {
    return failure("MISSING_CONTRACT_ID", "contractId is required before defining a runtime error contract", "input");
  }

  if (isBlank(request.errorCode)) {
    return failure("MISSING_ERROR_CODE", "errorCode is required before exposing a runtime error", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime errors can only be exposed through a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime error contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime error contract was rejected by governance",
      "governance",
    );
  }

  const errorContract: RuntimeContractError = {
    code: request.errorCode.trim(),
    message: normalizeMessage(request.message, "runtime contract failed without provider-specific details"),
    boundary: request.boundary ?? "contract",
    severity: request.severity ?? "recoverable",
    runtimeId: request.runtimeId.trim(),
    contractId: request.contractId.trim(),
    safeForApplication: true,
    internalDetailExposed: false,
  };

  return {
    ok: true,
    errorContract,
    events: ["runtime.error.contract.defined"],
  };
}
