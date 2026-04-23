/*
 * 文件定位：Agent 运行态实现层 / 模式暴露面。
 * 核心目的：承载 execution Mode Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  isRuntimeModeBlank,
  normalizeRuntimeModeDescriptor,
  rejectRuntimeModeExposure,
  type RuntimeModeDescriptor,
  type RuntimeModeDescriptorInput,
  type RuntimeModeExposureFailure,
  type RuntimeModeExposureGate,
} from "./modeDescriptor.js";

export type ExecutionModeRegistryRequest = {
  runtimeId?: string;
  modes?: readonly RuntimeModeDescriptorInput[];
  defaultModeId?: string;
  activeModeId?: string;
  runtimeReady?: boolean;
  contract?: RuntimeModeExposureGate;
  governance?: RuntimeModeExposureGate;
};

export type ExecutionModeRegistrySnapshot = {
  runtimeId: string;
  modes: readonly RuntimeModeDescriptor[];
  defaultModeId: string;
  activeModeId: string;
  registrySurface: "runtime.modeExposure.executionModeRegistry";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type ExecutionModeRegistryResult =
  | {
      ok: true;
      registry: ExecutionModeRegistrySnapshot;
      events: readonly string[];
    }
  | RuntimeModeExposureFailure;

export const executionModeRegistryCapability = {
  surface: "runtime.modeExposure",
  capability: "executionModeRegistry",
  purpose: "build a readonly registry of runtime execution modes without touching execution engine internals",
  unsafeSideEffects: false,
} as const;

function findMode(modes: readonly RuntimeModeDescriptor[], modeId: string | undefined): RuntimeModeDescriptor | undefined {
  if (isRuntimeModeBlank(modeId)) {
    return undefined;
  }

  return modes.find((mode) => mode.modeId === modeId?.trim());
}

function firstDefaultMode(modes: readonly RuntimeModeDescriptor[]): RuntimeModeDescriptor | undefined {
  return modes.find((mode) => mode.default) ?? modes[0];
}

export function buildExecutionModeRegistry(request: ExecutionModeRegistryRequest = {}): ExecutionModeRegistryResult {
  if (isRuntimeModeBlank(request.runtimeId)) {
    return rejectRuntimeModeExposure(
      "MISSING_RUNTIME_ID",
      "execution mode registry requires a runtimeId",
      "input",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeModeExposure(
      "RUNTIME_NOT_READY",
      "execution mode registry requires a ready runtime",
      "runtime-state",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeModeExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "execution mode registry was rejected by contract surface",
      "contract",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeModeExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "execution mode registry was rejected by governance",
      "governance",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  const modes: RuntimeModeDescriptor[] = [];
  const seenModeIds = new Set<string>();

  for (const modeInput of request.modes ?? []) {
    const mode = normalizeRuntimeModeDescriptor(modeInput);
    if ("code" in mode) {
      return {
        ok: false,
        error: mode,
        events: ["runtime.modeExposure.executionModeRegistry.rejected"],
      };
    }

    if (seenModeIds.has(mode.modeId)) {
      return rejectRuntimeModeExposure(
        "DUPLICATE_MODE_ID",
        `execution mode registry received duplicate modeId: ${mode.modeId}`,
        "registry",
        "runtime.modeExposure.executionModeRegistry.rejected",
      );
    }

    seenModeIds.add(mode.modeId);
    modes.push(mode);
  }

  const defaultMode = isRuntimeModeBlank(request.defaultModeId)
    ? firstDefaultMode(modes)
    : findMode(modes, request.defaultModeId);

  if (defaultMode === undefined) {
    return rejectRuntimeModeExposure(
      "DEFAULT_MODE_NOT_REGISTERED",
      "execution mode registry requires a registered default mode",
      "registry",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  const activeMode = isRuntimeModeBlank(request.activeModeId)
    ? defaultMode
    : findMode(modes, request.activeModeId);

  if (activeMode === undefined) {
    return rejectRuntimeModeExposure(
      "ACTIVE_MODE_NOT_REGISTERED",
      "execution mode registry activeModeId must point to a registered mode",
      "registry",
      "runtime.modeExposure.executionModeRegistry.rejected",
    );
  }

  return {
    ok: true,
    registry: {
      runtimeId: (request.runtimeId ?? "").trim(),
      modes,
      defaultModeId: defaultMode.modeId,
      activeModeId: activeMode.modeId,
      registrySurface: "runtime.modeExposure.executionModeRegistry",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modeExposure.executionModeRegistry.ready"],
  };
}
