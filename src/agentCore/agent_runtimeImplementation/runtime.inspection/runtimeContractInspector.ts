/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Contract Inspector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  cleanRuntimeInspectionList,
  isRuntimeInspectionBlank,
  rejectRuntimeInspection,
  type RuntimeInspectionFailure,
  type RuntimeInspectionFinding,
  type RuntimeInspectionGate,
} from "./runtimeInspector.js";

export type RuntimeContractRequirement = {
  contractId?: string;
  required?: boolean;
  version?: string;
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  errorCodes?: readonly string[];
};

export type RuntimeContractObservation = {
  contractId?: string;
  version?: string;
  present?: boolean;
  accepted?: boolean;
  reason?: string;
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  errorCodes?: readonly string[];
};

export type RuntimeContractInspectionRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  requiredContracts?: readonly RuntimeContractRequirement[];
  observedContracts?: readonly RuntimeContractObservation[];
  contract?: RuntimeInspectionGate;
  governance?: RuntimeInspectionGate;
};

export type RuntimeContractInspectionStatus = "satisfied" | "missing" | "rejected";

export type RuntimeContractInspection = {
  runtimeId: string;
  status: RuntimeContractInspectionStatus;
  requiredContracts: readonly string[];
  observedContracts: readonly string[];
  missingContracts: readonly string[];
  rejectedContracts: readonly string[];
  findings: readonly RuntimeInspectionFinding[];
  inspectionSurface: "runtime.inspection.runtimeContractInspector";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeContractInspectionResult =
  | {
      ok: true;
      inspection: RuntimeContractInspection;
      events: readonly string[];
    }
  | RuntimeInspectionFailure;

function normalizeRequirement(requirement: RuntimeContractRequirement): RuntimeContractRequirement | RuntimeInspectionFailure {
  if (isRuntimeInspectionBlank(requirement.contractId)) {
    return rejectRuntimeInspection(
      "MISSING_CONTRACT_ID",
      "runtime contract inspector requires every contract requirement to declare a contractId",
      "input",
      "runtime.inspection.contract.rejected",
    );
  }

  return {
    contractId: (requirement.contractId ?? "").trim(),
    required: requirement.required ?? true,
    version: requirement.version?.trim(),
    inputBoundary: cleanRuntimeInspectionList(requirement.inputBoundary),
    outputBoundary: cleanRuntimeInspectionList(requirement.outputBoundary),
    errorCodes: cleanRuntimeInspectionList(requirement.errorCodes),
  };
}

function normalizeObservation(observation: RuntimeContractObservation): RuntimeContractObservation | RuntimeInspectionFailure {
  if (isRuntimeInspectionBlank(observation.contractId)) {
    return rejectRuntimeInspection(
      "MISSING_CONTRACT_ID",
      "runtime contract inspector requires every observed contract to declare a contractId",
      "input",
      "runtime.inspection.contract.rejected",
    );
  }

  return {
    contractId: (observation.contractId ?? "").trim(),
    version: observation.version?.trim(),
    present: observation.present ?? true,
    accepted: observation.accepted ?? true,
    reason: observation.reason?.trim(),
    inputBoundary: cleanRuntimeInspectionList(observation.inputBoundary),
    outputBoundary: cleanRuntimeInspectionList(observation.outputBoundary),
    errorCodes: cleanRuntimeInspectionList(observation.errorCodes),
  };
}

function isFailure(value: RuntimeContractRequirement | RuntimeContractObservation | RuntimeInspectionFailure): value is RuntimeInspectionFailure {
  return "ok" in value && value.ok === false;
}

export function inspectRuntimeContracts(
  request: RuntimeContractInspectionRequest = {},
): RuntimeContractInspectionResult {
  if (isRuntimeInspectionBlank(request.runtimeId)) {
    return rejectRuntimeInspection(
      "MISSING_RUNTIME_ID",
      "runtime contract inspector requires a runtimeId",
      "input",
      "runtime.inspection.contract.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeInspection(
      "RUNTIME_NOT_READY",
      "runtime contracts can only be inspected on a ready runtime",
      "runtime-state",
      "runtime.inspection.contract.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeInspection(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract inspection was rejected by contract surface",
      "contract",
      "runtime.inspection.contract.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeInspection(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime contract inspection was rejected by governance",
      "governance",
      "runtime.inspection.contract.rejected",
    );
  }

  const requiredContracts: RuntimeContractRequirement[] = [];
  for (const requirement of request.requiredContracts ?? []) {
    const normalized = normalizeRequirement(requirement);
    if (isFailure(normalized)) {
      return normalized;
    }
    if (normalized.required !== false) {
      requiredContracts.push(normalized);
    }
  }

  const observedContracts = new Map<string, RuntimeContractObservation>();
  for (const observation of request.observedContracts ?? []) {
    const normalized = normalizeObservation(observation);
    if (isFailure(normalized)) {
      return normalized;
    }
    observedContracts.set(normalized.contractId ?? "", normalized);
  }

  const missingContracts: string[] = [];
  const rejectedContracts: string[] = [];
  const findings: RuntimeInspectionFinding[] = [];

  for (const requirement of requiredContracts) {
    const contractId = requirement.contractId ?? "";
    const observed = observedContracts.get(contractId);
    if (observed === undefined || observed.present === false) {
      missingContracts.push(contractId);
      findings.push({
        findingId: `${contractId}.missing`,
        severity: "error",
        boundary: "contract",
        message: `runtime contract is required but not present: ${contractId}`,
        relatedSurface: "runtime.contractSurface",
      });
      continue;
    }

    if (observed.accepted === false) {
      rejectedContracts.push(contractId);
      findings.push({
        findingId: `${contractId}.rejected`,
        severity: "error",
        boundary: "contract",
        message: observed.reason ?? `runtime contract was rejected: ${contractId}`,
        relatedSurface: "runtime.contractSurface",
      });
    }
  }

  for (const observed of observedContracts.values()) {
    const contractId = observed.contractId ?? "";
    if (observed.accepted === false && !rejectedContracts.includes(contractId)) {
      rejectedContracts.push(contractId);
      findings.push({
        findingId: `${contractId}.rejected`,
        severity: "error",
        boundary: "contract",
        message: observed.reason ?? `runtime contract was rejected: ${contractId}`,
        relatedSurface: "runtime.contractSurface",
      });
    }
  }

  const status: RuntimeContractInspectionStatus =
    rejectedContracts.length > 0 ? "rejected" : missingContracts.length > 0 ? "missing" : "satisfied";

  return {
    ok: true,
    inspection: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      requiredContracts: requiredContracts.map((requirement) => requirement.contractId ?? ""),
      observedContracts: [...observedContracts.keys()],
      missingContracts,
      rejectedContracts,
      findings,
      inspectionSurface: "runtime.inspection.runtimeContractInspector",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.contract.${status}`],
  };
}
