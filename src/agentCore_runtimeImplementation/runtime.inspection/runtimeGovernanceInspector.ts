/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Governance Inspector 这一能力位点。
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

export type RuntimeGovernancePolicy = {
  policyId?: string;
  enabled?: boolean;
  scopes?: readonly string[];
  surfaceIds?: readonly string[];
};

export type RuntimeGovernanceEvaluation = {
  policyId?: string;
  accepted: boolean;
  reason?: string;
  audited?: boolean;
};

export type RuntimeGovernanceInspectionRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  requiredPolicyIds?: readonly string[];
  requestedScopes?: readonly string[];
  policies?: readonly RuntimeGovernancePolicy[];
  evaluations?: readonly RuntimeGovernanceEvaluation[];
  contract?: RuntimeInspectionGate;
  governance?: RuntimeInspectionGate;
};

export type RuntimeGovernanceInspectionStatus = "enforced" | "weak" | "rejected";

export type RuntimeGovernanceInspection = {
  runtimeId: string;
  status: RuntimeGovernanceInspectionStatus;
  activePolicies: readonly string[];
  missingPolicies: readonly string[];
  requestedScopes: readonly string[];
  deniedScopes: readonly string[];
  deniedEvaluations: readonly string[];
  findings: readonly RuntimeInspectionFinding[];
  inspectionSurface: "runtime.inspection.runtimeGovernanceInspector";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeGovernanceInspectionResult =
  | {
      ok: true;
      inspection: RuntimeGovernanceInspection;
      events: readonly string[];
    }
  | RuntimeInspectionFailure;

function normalizePolicy(policy: RuntimeGovernancePolicy): RuntimeGovernancePolicy | RuntimeInspectionFailure {
  if (isRuntimeInspectionBlank(policy.policyId)) {
    return rejectRuntimeInspection(
      "MISSING_POLICY_ID",
      "runtime governance inspector requires every policy to declare a policyId",
      "input",
      "runtime.inspection.governance.rejected",
    );
  }

  return {
    policyId: (policy.policyId ?? "").trim(),
    enabled: policy.enabled ?? true,
    scopes: cleanRuntimeInspectionList(policy.scopes),
    surfaceIds: cleanRuntimeInspectionList(policy.surfaceIds),
  };
}

function normalizeEvaluation(
  evaluation: RuntimeGovernanceEvaluation,
): RuntimeGovernanceEvaluation | RuntimeInspectionFailure {
  if (isRuntimeInspectionBlank(evaluation.policyId)) {
    return rejectRuntimeInspection(
      "MISSING_POLICY_ID",
      "runtime governance inspector requires every evaluation to declare a policyId",
      "input",
      "runtime.inspection.governance.rejected",
    );
  }

  return {
    policyId: (evaluation.policyId ?? "").trim(),
    accepted: evaluation.accepted,
    reason: evaluation.reason?.trim(),
    audited: evaluation.audited ?? true,
  };
}

function isFailure(value: RuntimeGovernancePolicy | RuntimeGovernanceEvaluation | RuntimeInspectionFailure): value is RuntimeInspectionFailure {
  return "ok" in value && value.ok === false;
}

function policyCoversScope(policy: RuntimeGovernancePolicy, scope: string): boolean {
  return policy.enabled !== false && (policy.scopes ?? []).includes(scope);
}

export function inspectRuntimeGovernance(
  request: RuntimeGovernanceInspectionRequest = {},
): RuntimeGovernanceInspectionResult {
  if (isRuntimeInspectionBlank(request.runtimeId)) {
    return rejectRuntimeInspection(
      "MISSING_RUNTIME_ID",
      "runtime governance inspector requires a runtimeId",
      "input",
      "runtime.inspection.governance.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeInspection(
      "RUNTIME_NOT_READY",
      "runtime governance can only be inspected on a ready runtime",
      "runtime-state",
      "runtime.inspection.governance.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeInspection(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime governance inspection was rejected by contract surface",
      "contract",
      "runtime.inspection.governance.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeInspection(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance inspection was rejected by governance",
      "governance",
      "runtime.inspection.governance.rejected",
    );
  }

  const policies: RuntimeGovernancePolicy[] = [];
  for (const policy of request.policies ?? []) {
    const normalized = normalizePolicy(policy);
    if (isFailure(normalized)) {
      return normalized;
    }
    policies.push(normalized);
  }

  const evaluations: RuntimeGovernanceEvaluation[] = [];
  for (const evaluation of request.evaluations ?? []) {
    const normalized = normalizeEvaluation(evaluation);
    if (isFailure(normalized)) {
      return normalized;
    }
    evaluations.push(normalized);
  }

  const activePolicies = policies.filter((policy) => policy.enabled !== false).map((policy) => policy.policyId ?? "");
  const requiredPolicyIds = cleanRuntimeInspectionList(request.requiredPolicyIds);
  const missingPolicies = requiredPolicyIds.filter((policyId) => !activePolicies.includes(policyId));
  const requestedScopes = cleanRuntimeInspectionList(request.requestedScopes);
  const deniedScopes = requestedScopes.filter((scope) => !policies.some((policy) => policyCoversScope(policy, scope)));
  const deniedEvaluations = evaluations
    .filter((evaluation) => !evaluation.accepted)
    .map((evaluation) => evaluation.policyId ?? "");

  const findings: RuntimeInspectionFinding[] = [
    ...missingPolicies.map((policyId) => ({
      findingId: `${policyId}.missing`,
      severity: "error" as const,
      boundary: "governance" as const,
      message: `runtime governance policy is required but not active: ${policyId}`,
      relatedSurface: "runtime.governancePlane",
    })),
    ...deniedScopes.map((scope) => ({
      findingId: `${scope}.denied`,
      severity: "error" as const,
      boundary: "scope" as const,
      message: `runtime governance does not grant requested scope: ${scope}`,
      relatedSurface: "runtime.governancePlane",
    })),
    ...evaluations
      .filter((evaluation) => !evaluation.accepted)
      .map((evaluation) => ({
        findingId: `${evaluation.policyId ?? "policy"}.rejected`,
        severity: "error" as const,
        boundary: "governance" as const,
        message: evaluation.reason ?? `runtime governance evaluation rejected policy: ${evaluation.policyId ?? "policy"}`,
        relatedSurface: "runtime.governancePlane",
      })),
    ...evaluations
      .filter((evaluation) => evaluation.accepted && evaluation.audited === false)
      .map((evaluation) => ({
        findingId: `${evaluation.policyId ?? "policy"}.audit-missing`,
        severity: "warning" as const,
        boundary: "governance" as const,
        message: `runtime governance evaluation did not emit an audit record: ${evaluation.policyId ?? "policy"}`,
        relatedSurface: "runtime.governancePlane",
      })),
  ];

  const status: RuntimeGovernanceInspectionStatus =
    deniedEvaluations.length > 0 ? "rejected" : missingPolicies.length > 0 || deniedScopes.length > 0 ? "weak" : "enforced";

  return {
    ok: true,
    inspection: {
      runtimeId: (request.runtimeId ?? "").trim(),
      status,
      activePolicies,
      missingPolicies,
      requestedScopes,
      deniedScopes,
      deniedEvaluations,
      findings,
      inspectionSurface: "runtime.inspection.runtimeGovernanceInspector",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.governance.${status}`],
  };
}
