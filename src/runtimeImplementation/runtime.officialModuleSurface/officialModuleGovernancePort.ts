/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：让官方模块通过治理面申请 runtime 权限。
 * 能力要求1：需要把模块动作、能力范围、审批需求和策略结果接起来。
 * 能力要求2：官方模块也必须受治理，而不是天然拥有无限权限。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  evaluateGovernanceRule,
  type GovernanceDecision,
  type GovernanceRule,
  type GovernanceRuleGate,
} from "../runtime.governancePlane/governanceRuleEvaluator.js";
import { resolveRuntimeAuthority, type RuntimeAuthorityContext } from "../runtime.governancePlane/runtimeAuthorityResolver.js";
import {
  createOfficialModuleRuntimeError,
  type OfficialModuleIdentity,
  type OfficialModuleKind,
  type OfficialModuleRuntimeBoundary,
  type OfficialModuleRuntimeError,
  type OfficialModuleRuntimeGate,
} from "./officialModuleRuntimeSurface.js";

export type OfficialModuleGovernanceRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: OfficialModuleKind;
  action?: string;
  requestedScopes?: readonly string[];
  grantedScopes?: readonly string[];
  policyScopes?: readonly string[];
  deniedScopes?: readonly string[];
  rules?: readonly GovernanceRule[];
  runtimeReady?: boolean;
  contract?: OfficialModuleRuntimeGate | GovernanceRuleGate;
  authority?: RuntimeAuthorityContext;
};

export type OfficialModuleGovernanceGrant = {
  runtimeId: string;
  module: OfficialModuleIdentity;
  action: string;
  requestedScopes: readonly string[];
  authority: RuntimeAuthorityContext;
  decision: GovernanceDecision;
  approvalRequired: boolean;
  permissionState: GovernanceDecision["status"];
  dispatch: "dry-run";
  unsafeSideEffects: false;
};

export type OfficialModuleGovernanceResult =
  | {
      ok: true;
      grant: OfficialModuleGovernanceGrant;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: string,
  message: string,
  boundary: OfficialModuleRuntimeBoundary,
): OfficialModuleGovernanceResult {
  return {
    ok: false,
    error: createOfficialModuleRuntimeError(code, message, boundary),
    events: ["runtime.officialModule.governance.rejected"],
  };
}

export function requestOfficialModuleGovernance(
  request?: OfficialModuleGovernanceRequest,
): OfficialModuleGovernanceResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "official module governance request requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "official module governance request requires a moduleId", "input");
  }

  if (isBlank(request.moduleKind)) {
    return failure("MISSING_MODULE_KIND", "official module governance request requires a module kind", "input");
  }

  if (isBlank(request.action)) {
    return failure("MISSING_ACTION", "official module governance request requires an action", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "official module governance requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "official module governance request was rejected by contract surface",
      "contract",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const moduleId = (request.moduleId ?? "").trim();
  const moduleKind = (request.moduleKind ?? "").trim() as OfficialModuleKind;
  const action = (request.action ?? "").trim();
  const requestedScopes = cleanList(request.requestedScopes);

  const authorityResult =
    request.authority === undefined
      ? resolveRuntimeAuthority({
          runtimeId,
          caller: {
            kind: "official-module",
            id: moduleId,
            moduleId,
          },
          moduleSource: moduleKind,
          grantedScopes: request.grantedScopes,
          policyScopes: request.policyScopes,
          deniedScopes: request.deniedScopes,
          runtimeReady: request.runtimeReady,
          contract: request.contract,
        })
      : ({ ok: true, authority: request.authority, events: ["runtime.authority.reused"] } as const);

  if (!authorityResult.ok) {
    return failure("AUTHORITY_RESOLUTION_FAILED", authorityResult.error.message, authorityResult.error.boundary);
  }

  const governanceResult = evaluateGovernanceRule({
    runtimeId,
    action,
    authority: authorityResult.authority,
    requestedScopes,
    rules: request.rules,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
  });

  if (!governanceResult.ok) {
    return failure("GOVERNANCE_EVALUATION_FAILED", governanceResult.error.message, governanceResult.error.boundary);
  }

  return {
    ok: true,
    grant: {
      runtimeId,
      module: {
        moduleId,
        moduleKind,
      },
      action,
      requestedScopes,
      authority: authorityResult.authority,
      decision: governanceResult.decision,
      approvalRequired: governanceResult.decision.approvalRequired,
      permissionState: governanceResult.decision.status,
      dispatch: "dry-run",
      unsafeSideEffects: false,
    },
    events: [
      "runtime.officialModule.governance.evaluated",
      ...authorityResult.events,
      ...governanceResult.events,
    ],
  };
}
