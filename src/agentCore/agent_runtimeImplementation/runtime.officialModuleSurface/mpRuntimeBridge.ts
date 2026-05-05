/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 MP 桥接 runtime 的记忆、状态、上下文和调用能力。
 * 能力要求1：需要让记忆管理系统能接入 agentCore 当前运行状态和事件。
 * 能力要求2：它不实现 MP 记忆策略，只提供 runtime 接入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS,
  defineOfficialModuleCapabilityContract,
  type OfficialModuleCapabilityContract,
  type OfficialModuleCapabilityContractError,
  type OfficialModuleCapabilityGrant,
  type OfficialModuleCapabilityUse,
  type OfficialModuleGate,
} from "./officialModuleCapabilityContract.js";

export type MpRuntimeBridgeRequest = {
  runtimeId?: string;
  moduleId?: string;
  memorySpaceId?: string;
  stateSnapshotId?: string;
  requestedCapabilities?: readonly OfficialModuleCapabilityUse[];
  allowedCapabilities?: readonly OfficialModuleCapabilityGrant[];
  runtimeReady?: boolean;
  contract?: OfficialModuleGate;
  governance?: OfficialModuleGate;
};

export type MpRuntimeBridgePlan = {
  runtimeId: string;
  moduleId: string;
  moduleKind: "MP";
  memorySpaceId?: string;
  stateSnapshotId?: string;
  capabilityContract: OfficialModuleCapabilityContract;
  memoryAccess: "runtime-mediated";
  stateAccess: "runtime-mediated";
  contextAccess: "runtime-mediated";
  invocationAccess: "dry-run";
  dispatch: "dry-run";
  memoryStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type MpRuntimeBridgeResult =
  | {
      ok: true;
      plan: MpRuntimeBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleCapabilityContractError;
      events: readonly string[];
    };

function optionalTrim(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function createMpRuntimeBridge(request?: MpRuntimeBridgeRequest): MpRuntimeBridgeResult {
  const capabilityContract = defineOfficialModuleCapabilityContract({
    runtimeId: request?.runtimeId,
    moduleId: request?.moduleId,
    moduleKind: "MP",
    requestedCapabilities: request?.requestedCapabilities ?? [
      { capabilityId: "runtime.memory", channel: "read", reason: "MP needs runtime memory access" },
      { capabilityId: "runtime.state", channel: "read", reason: "MP needs runtime state access" },
      { capabilityId: "runtime.context", channel: "read", reason: "MP needs context boundary access" },
      { capabilityId: "runtime.invocation", channel: "invoke", reason: "MP must invoke through runtime" },
    ],
    allowedCapabilities: request?.allowedCapabilities ?? DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS.MP,
    runtimeReady: request?.runtimeReady,
    contract: request?.contract,
    governance: request?.governance,
  });

  if (!capabilityContract.ok) {
    return {
      ok: false,
      error: capabilityContract.error,
      events: ["runtime.officialModule.mpBridge.rejected", ...capabilityContract.events],
    };
  }

  return {
    ok: true,
    plan: {
      runtimeId: capabilityContract.contract.runtimeId,
      moduleId: capabilityContract.contract.moduleId,
      moduleKind: "MP",
      memorySpaceId: optionalTrim(request?.memorySpaceId),
      stateSnapshotId: optionalTrim(request?.stateSnapshotId),
      capabilityContract: capabilityContract.contract,
      memoryAccess: "runtime-mediated",
      stateAccess: "runtime-mediated",
      contextAccess: "runtime-mediated",
      invocationAccess: "dry-run",
      dispatch: "dry-run",
      memoryStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.mpBridge.planned", ...capabilityContract.events],
  };
}
