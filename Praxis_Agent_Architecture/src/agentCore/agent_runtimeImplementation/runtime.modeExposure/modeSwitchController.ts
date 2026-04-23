/*
 * 文件定位：Agent 运行态实现层 / 模式暴露面。
 * 核心目的：承载 mode Switch Controller 这一能力位点。
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
  type RuntimeModeExposureFailure,
  type RuntimeModeExposureGate,
} from "./modeDescriptor.js";

export type RuntimeModeSwitchStatus = "unchanged" | "planned";

export type RuntimeModeSwitchRequest = {
  runtimeId?: string;
  registry?: ExecutionModeRegistrySnapshot;
  fromModeId?: string;
  toModeId?: string;
  reason?: string;
  requestedScopes?: readonly string[];
  dryRun?: boolean;
  runtimeReady?: boolean;
  contract?: RuntimeModeExposureGate;
  governance?: RuntimeModeExposureGate;
};

export type RuntimeModeSwitchPlan = {
  runtimeId: string;
  fromModeId: string;
  toModeId: string;
  status: RuntimeModeSwitchStatus;
  reason?: string;
  requestedScopes: readonly string[];
  missingScopes: readonly string[];
  dryRun: true;
  controllerSurface: "runtime.modeExposure.modeSwitchController";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeModeSwitchResult =
  | {
      ok: true;
      plan: RuntimeModeSwitchPlan;
      events: readonly string[];
    }
  | RuntimeModeExposureFailure;

export const modeSwitchControllerCapability = {
  surface: "runtime.modeExposure",
  capability: "modeSwitchController",
  purpose: "plan a governed runtime mode switch as a dry-run envelope",
  unsafeSideEffects: false,
} as const;

function findRegisteredMode(
  registry: ExecutionModeRegistrySnapshot,
  modeId: string | undefined,
): RuntimeModeDescriptor | undefined {
  if (isRuntimeModeBlank(modeId)) {
    return undefined;
  }

  return registry.modes.find((mode) => mode.modeId === modeId?.trim());
}

function missingScopes(targetMode: RuntimeModeDescriptor, requestedScopes: readonly string[]): readonly string[] {
  return targetMode.scopes.filter((scope) => !requestedScopes.includes(scope));
}

export function planRuntimeModeSwitch(request: RuntimeModeSwitchRequest = {}): RuntimeModeSwitchResult {
  if (isRuntimeModeBlank(request.runtimeId)) {
    return rejectRuntimeModeExposure(
      "MISSING_RUNTIME_ID",
      "mode switch controller requires a runtimeId",
      "input",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (request.registry === undefined) {
    return rejectRuntimeModeExposure(
      "MISSING_MODE_REGISTRY",
      "mode switch controller requires an execution mode registry snapshot",
      "input",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (isRuntimeModeBlank(request.toModeId)) {
    return rejectRuntimeModeExposure(
      "MISSING_TARGET_MODE",
      "mode switch controller requires a target mode id",
      "input",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeModeExposure(
      "RUNTIME_NOT_READY",
      "mode switch controller requires a ready runtime",
      "runtime-state",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeModeExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "mode switch controller was rejected by contract surface",
      "contract",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeModeExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "mode switch controller was rejected by governance",
      "governance",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  if (request.registry.runtimeId !== runtimeId) {
    return rejectRuntimeModeExposure(
      "REGISTRY_RUNTIME_MISMATCH",
      "mode switch controller received a registry for a different runtime",
      "registry",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  const fromModeId = (request.fromModeId ?? request.registry.activeModeId).trim();
  const fromMode = findRegisteredMode(request.registry, fromModeId);
  if (fromMode === undefined) {
    return rejectRuntimeModeExposure(
      "MODE_NOT_REGISTERED",
      "mode switch controller fromModeId must point to a registered mode",
      "registry",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  const toModeId = (request.toModeId ?? "").trim();
  const targetMode = findRegisteredMode(request.registry, toModeId);
  if (targetMode === undefined) {
    return rejectRuntimeModeExposure(
      "MODE_NOT_REGISTERED",
      `mode switch controller target is not registered: ${toModeId}`,
      "registry",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (!targetMode.available) {
    return rejectRuntimeModeExposure(
      "MODE_NOT_AVAILABLE",
      `mode switch controller target is not available: ${toModeId}`,
      "runtime-state",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  if (!targetMode.switchable && fromMode.modeId !== targetMode.modeId) {
    return rejectRuntimeModeExposure(
      "MODE_NOT_SWITCHABLE",
      `mode switch controller target is not switchable: ${toModeId}`,
      "runtime-state",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  const requestedScopes = cleanRuntimeModeList(request.requestedScopes);
  const deniedScopes = missingScopes(targetMode, requestedScopes);
  if (deniedScopes.length > 0) {
    return rejectRuntimeModeExposure(
      "MODE_SCOPE_DENIED",
      `mode switch controller caller is missing mode scope: ${deniedScopes[0]}`,
      "scope",
      "runtime.modeExposure.modeSwitchController.rejected",
    );
  }

  const status: RuntimeModeSwitchStatus = fromMode.modeId === targetMode.modeId ? "unchanged" : "planned";

  return {
    ok: true,
    plan: {
      runtimeId,
      fromModeId: fromMode.modeId,
      toModeId: targetMode.modeId,
      status,
      reason: request.reason?.trim(),
      requestedScopes,
      missingScopes: [],
      dryRun: true,
      controllerSurface: "runtime.modeExposure.modeSwitchController",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.modeExposure.modeSwitchController.${status}`],
  };
}
