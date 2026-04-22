/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：定义官方模块如何加入、暂停、恢复、重载和脱离 runtime。
 * 能力要求1：需要让模块生命周期和 runtime 生命周期可协调、可检查、可回滚。
 * 能力要求2：避免模块随意挂载导致运行态不可预测。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createOfficialModuleRuntimeError,
  type OfficialModuleIdentity,
  type OfficialModuleKind,
  type OfficialModuleRuntimeBoundary,
  type OfficialModuleRuntimeError,
  type OfficialModuleRuntimeGate,
} from "./officialModuleRuntimeSurface.js";

export type OfficialModuleLifecycleAction = "join" | "pause" | "resume" | "reload" | "detach";

export type OfficialModuleLifecyclePhase = "detached" | "attached" | "paused";

export type OfficialModuleLifecycleRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: OfficialModuleKind;
  action?: OfficialModuleLifecycleAction;
  currentPhase?: OfficialModuleLifecyclePhase;
  runtimeReady?: boolean;
  contract?: OfficialModuleRuntimeGate;
  governance?: OfficialModuleRuntimeGate;
};

export type OfficialModuleLifecyclePlan = {
  runtimeId: string;
  module: OfficialModuleIdentity;
  action: OfficialModuleLifecycleAction;
  from: OfficialModuleLifecyclePhase;
  to: OfficialModuleLifecyclePhase;
  coordination: "runtime-lifecycle-port";
  rollbackPhase: OfficialModuleLifecyclePhase;
  dispatch: "dry-run";
  unsafeSideEffects: false;
};

export type OfficialModuleLifecycleResult =
  | {
      ok: true;
      plan: OfficialModuleLifecyclePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

const lifecycleActions = new Set<OfficialModuleLifecycleAction>(["join", "pause", "resume", "reload", "detach"]);
const lifecyclePhases = new Set<OfficialModuleLifecyclePhase>(["detached", "attached", "paused"]);

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: string,
  message: string,
  boundary: OfficialModuleRuntimeBoundary,
): OfficialModuleLifecycleResult {
  return {
    ok: false,
    error: createOfficialModuleRuntimeError(code, message, boundary),
    events: ["runtime.officialModule.lifecycle.rejected"],
  };
}

function resolveTargetPhase(
  action: OfficialModuleLifecycleAction,
  currentPhase: OfficialModuleLifecyclePhase,
): OfficialModuleLifecyclePhase | undefined {
  if (action === "join" && currentPhase === "detached") {
    return "attached";
  }

  if (action === "pause" && currentPhase === "attached") {
    return "paused";
  }

  if (action === "resume" && currentPhase === "paused") {
    return "attached";
  }

  if (action === "reload" && currentPhase !== "detached") {
    return currentPhase;
  }

  if (action === "detach" && currentPhase !== "detached") {
    return "detached";
  }

  return undefined;
}

export function planOfficialModuleLifecycleTransition(
  request?: OfficialModuleLifecycleRequest,
): OfficialModuleLifecycleResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "official module lifecycle transition requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "official module lifecycle transition requires a moduleId", "input");
  }

  if (isBlank(request.moduleKind)) {
    return failure("MISSING_MODULE_KIND", "official module lifecycle transition requires a module kind", "input");
  }

  if (request.action === undefined || !lifecycleActions.has(request.action)) {
    return failure("INVALID_LIFECYCLE_ACTION", "official module lifecycle transition requires a known action", "input");
  }

  if (request.currentPhase !== undefined && !lifecyclePhases.has(request.currentPhase)) {
    return failure("INVALID_LIFECYCLE_PHASE", "official module lifecycle transition received an unknown phase", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "official module lifecycle changes require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "official module lifecycle transition was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "official module lifecycle transition was rejected by governance",
      "governance",
    );
  }

  const currentPhase = request.currentPhase ?? "detached";
  const targetPhase = resolveTargetPhase(request.action, currentPhase);
  if (targetPhase === undefined) {
    return failure(
      "INVALID_LIFECYCLE_TRANSITION",
      `cannot ${request.action} official module from ${currentPhase}`,
      "runtime-state",
    );
  }

  return {
    ok: true,
    plan: {
      runtimeId: (request.runtimeId ?? "").trim(),
      module: {
        moduleId: (request.moduleId ?? "").trim(),
        moduleKind: (request.moduleKind ?? "").trim() as OfficialModuleKind,
      },
      action: request.action,
      from: currentPhase,
      to: targetPhase,
      coordination: "runtime-lifecycle-port",
      rollbackPhase: currentPhase,
      dispatch: "dry-run",
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.lifecycle.planned"],
  };
}
