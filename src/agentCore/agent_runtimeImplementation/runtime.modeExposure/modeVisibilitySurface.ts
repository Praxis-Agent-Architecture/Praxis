/*
 * 文件定位：Agent 运行态实现层 / 模式暴露面。
 * 核心目的：承载 mode Visibility Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ExecutionModeRegistrySnapshot } from "./executionModeRegistry.js";
import {
  cleanRuntimeModeList,
  isRuntimeModeBlank,
  rejectRuntimeModeExposure,
  type RuntimeModeDescriptor,
  type RuntimeModeExposureAudience,
  type RuntimeModeExposureFailure,
  type RuntimeModeExposureGate,
} from "./modeDescriptor.js";

export type RuntimeModeVisibilityRequest = {
  runtimeId?: string;
  registry?: ExecutionModeRegistrySnapshot;
  audience?: RuntimeModeExposureAudience;
  callerScopes?: readonly string[];
  includeUnavailable?: boolean;
  runtimeReady?: boolean;
  contract?: RuntimeModeExposureGate;
  governance?: RuntimeModeExposureGate;
};

export type RuntimeModeVisibilityEntry = {
  modeId: string;
  label?: string;
  summary?: string;
  default: boolean;
  active: boolean;
  available: boolean;
  switchable: boolean;
  visibleTo: readonly RuntimeModeExposureAudience[];
  requiredScopes: readonly string[];
  contractId?: string;
};

export type RuntimeModeVisibilitySnapshot = {
  runtimeId: string;
  modes: readonly RuntimeModeVisibilityEntry[];
  defaultModeId: string;
  activeModeId: string;
  requestedAudience?: RuntimeModeExposureAudience;
  callerScopes: readonly string[];
  visibilitySurface: "runtime.modeExposure.modeVisibilitySurface";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeModeVisibilityResult =
  | {
      ok: true;
      visibility: RuntimeModeVisibilitySnapshot;
      events: readonly string[];
    }
  | RuntimeModeExposureFailure;

export const modeVisibilitySurfaceCapability = {
  surface: "runtime.modeExposure",
  capability: "modeVisibilitySurface",
  purpose: "publish a governed readonly view of registered runtime modes",
  unsafeSideEffects: false,
} as const;

function visibleToAudience(mode: RuntimeModeDescriptor, audience: RuntimeModeExposureAudience | undefined): boolean {
  return audience === undefined || mode.audiences.includes(audience);
}

function scopesSatisfied(mode: RuntimeModeDescriptor, callerScopes: readonly string[]): boolean {
  return mode.scopes.every((scope) => callerScopes.includes(scope));
}

function toVisibilityEntry(
  mode: RuntimeModeDescriptor,
  registry: ExecutionModeRegistrySnapshot,
): RuntimeModeVisibilityEntry {
  return {
    modeId: mode.modeId,
    label: mode.label,
    summary: mode.summary,
    default: mode.modeId === registry.defaultModeId,
    active: mode.modeId === registry.activeModeId,
    available: mode.available,
    switchable: mode.switchable,
    visibleTo: mode.audiences,
    requiredScopes: mode.scopes,
    contractId: mode.contract?.contractId,
  };
}

export function exposeRuntimeModeVisibility(request: RuntimeModeVisibilityRequest = {}): RuntimeModeVisibilityResult {
  if (isRuntimeModeBlank(request.runtimeId)) {
    return rejectRuntimeModeExposure(
      "MISSING_RUNTIME_ID",
      "mode visibility surface requires a runtimeId",
      "input",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  if (request.registry === undefined) {
    return rejectRuntimeModeExposure(
      "MISSING_MODE_REGISTRY",
      "mode visibility surface requires an execution mode registry snapshot",
      "input",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeModeExposure(
      "RUNTIME_NOT_READY",
      "mode visibility surface requires a ready runtime",
      "runtime-state",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeModeExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "mode visibility surface was rejected by contract surface",
      "contract",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeModeExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "mode visibility surface was rejected by governance",
      "governance",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  if (request.registry.runtimeId !== runtimeId) {
    return rejectRuntimeModeExposure(
      "REGISTRY_RUNTIME_MISMATCH",
      "mode visibility surface received a registry for a different runtime",
      "registry",
      "runtime.modeExposure.modeVisibilitySurface.rejected",
    );
  }

  const callerScopes = cleanRuntimeModeList(request.callerScopes);
  const visibleModes = request.registry.modes
    .filter((mode) => visibleToAudience(mode, request.audience))
    .filter((mode) => request.includeUnavailable === true || mode.available)
    .filter((mode) => scopesSatisfied(mode, callerScopes))
    .map((mode) => toVisibilityEntry(mode, request.registry as ExecutionModeRegistrySnapshot));

  return {
    ok: true,
    visibility: {
      runtimeId,
      modes: visibleModes,
      defaultModeId: request.registry.defaultModeId,
      activeModeId: request.registry.activeModeId,
      requestedAudience: request.audience,
      callerScopes,
      visibilitySurface: "runtime.modeExposure.modeVisibilitySurface",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modeExposure.modeVisibilitySurface.ready"],
  };
}
