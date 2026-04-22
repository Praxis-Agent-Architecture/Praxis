/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：把治理面裁决桥接给 CMP、MP、TAP、multiagent 等官方模块。
 * 能力要求1：需要让官方模块申请权限、读取授权结果、感知治理拒绝或降级。
 * 能力要求2：它不实现模块内部策略，只保证模块接入 runtime 时受同一治理系统约束。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  evaluateGovernanceRule,
  type GovernanceDecision,
  type GovernanceRule,
  type GovernanceRuleGate,
} from "./governanceRuleEvaluator.js";
import { resolveRuntimeAuthority, type RuntimeAuthorityContext } from "./runtimeAuthorityResolver.js";

export type ModuleGovernanceBridgeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type ModuleGovernanceBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODULE_ID"
  | "MISSING_MODULE_KIND"
  | "MISSING_ACTION"
  | "AUTHORITY_RESOLUTION_FAILED"
  | "GOVERNANCE_EVALUATION_FAILED";

export type ModuleGovernanceBridgeRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: string;
  action?: string;
  authority?: RuntimeAuthorityContext;
  allowedModuleScopes?: readonly string[];
  requestedScopes?: readonly string[];
  rules?: readonly GovernanceRule[];
  runtimeReady?: boolean;
  contract?: GovernanceRuleGate;
};

export type ModuleGovernanceBridgePlan = {
  runtimeId: string;
  moduleId: string;
  moduleKind: string;
  action: string;
  authority: RuntimeAuthorityContext;
  decision: GovernanceDecision;
  permissionState: GovernanceDecision["status"];
  dispatch: "dry-run";
  moduleStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type ModuleGovernanceBridgeError = {
  code: ModuleGovernanceBridgeErrorCode;
  message: string;
  boundary: ModuleGovernanceBridgeBoundary;
  publicSafe: true;
};

export type ModuleGovernanceBridgeResult =
  | {
      ok: true;
      plan: ModuleGovernanceBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModuleGovernanceBridgeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: ModuleGovernanceBridgeErrorCode,
  message: string,
  boundary: ModuleGovernanceBridgeBoundary,
): ModuleGovernanceBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.moduleBridge.rejected"],
  };
}

export function createModuleGovernanceBridge(
  request?: ModuleGovernanceBridgeRequest,
): ModuleGovernanceBridgeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "module governance bridge requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "module governance bridge requires a moduleId", "input");
  }

  if (isBlank(request.moduleKind)) {
    return failure("MISSING_MODULE_KIND", "module governance bridge requires a module kind", "input");
  }

  if (isBlank(request.action)) {
    return failure("MISSING_ACTION", "module governance bridge requires an action", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const moduleId = (request.moduleId ?? "").trim();
  const moduleKind = (request.moduleKind ?? "").trim();
  const action = (request.action ?? "").trim();
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
          grantedScopes: request.allowedModuleScopes,
          runtimeReady: request.runtimeReady,
          contract: request.contract,
        })
      : ({ ok: true, authority: request.authority, events: ["runtime.authority.reused"] } as const);

  if (!authorityResult.ok) {
    return failure("AUTHORITY_RESOLUTION_FAILED", authorityResult.error.message, authorityResult.error.boundary);
  }

  const evaluation = evaluateGovernanceRule({
    runtimeId,
    action,
    authority: authorityResult.authority,
    requestedScopes: request.requestedScopes,
    rules: request.rules,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
  });

  if (!evaluation.ok) {
    return failure("GOVERNANCE_EVALUATION_FAILED", evaluation.error.message, evaluation.error.boundary);
  }

  return {
    ok: true,
    plan: {
      runtimeId,
      moduleId,
      moduleKind,
      action,
      authority: authorityResult.authority,
      decision: evaluation.decision,
      permissionState: evaluation.decision.status,
      dispatch: "dry-run",
      moduleStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: [
      "runtime.governance.moduleBridge.planned",
      ...authorityResult.events,
      ...evaluation.events,
    ],
  };
}
