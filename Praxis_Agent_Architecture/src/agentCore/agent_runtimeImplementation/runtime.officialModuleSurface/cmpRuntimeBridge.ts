/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 CMP 桥接 runtime 的上下文、任务、调用和能力访问。
 * 能力要求1：需要让上下文管理能力能使用 agentCore，而不是绕开 agentCore 自建运行通道。
 * 能力要求2：它不实现 CMP 内部策略，只提供 CMP 使用 runtime 的正式桥。
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

export type CmpRuntimeBridgeRequest = {
  runtimeId?: string;
  moduleId?: string;
  contextId?: string;
  taskId?: string;
  requestedCapabilities?: readonly OfficialModuleCapabilityUse[];
  allowedCapabilities?: readonly OfficialModuleCapabilityGrant[];
  runtimeReady?: boolean;
  contract?: OfficialModuleGate;
  governance?: OfficialModuleGate;
};

export type CmpRuntimeBridgePlan = {
  runtimeId: string;
  moduleId: string;
  moduleKind: "CMP";
  contextId?: string;
  taskId?: string;
  capabilityContract: OfficialModuleCapabilityContract;
  contextAccess: "runtime-mediated";
  taskAccess: "runtime-mediated";
  invocationAccess: "dry-run";
  dispatch: "dry-run";
  cmpStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type CmpRuntimeBridgeResult =
  | {
      ok: true;
      plan: CmpRuntimeBridgePlan;
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

export function createCmpRuntimeBridge(request?: CmpRuntimeBridgeRequest): CmpRuntimeBridgeResult {
  const capabilityContract = defineOfficialModuleCapabilityContract({
    runtimeId: request?.runtimeId,
    moduleId: request?.moduleId,
    moduleKind: "CMP",
    requestedCapabilities: request?.requestedCapabilities ?? [
      { capabilityId: "runtime.context", channel: "read", reason: "CMP needs runtime context access" },
      { capabilityId: "runtime.task", channel: "read", reason: "CMP needs task boundary access" },
      { capabilityId: "runtime.invocation", channel: "invoke", reason: "CMP must invoke through runtime" },
      { capabilityId: "runtime.capability", channel: "read", reason: "CMP needs capability discovery" },
    ],
    allowedCapabilities: request?.allowedCapabilities ?? DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS.CMP,
    runtimeReady: request?.runtimeReady,
    contract: request?.contract,
    governance: request?.governance,
  });

  if (!capabilityContract.ok) {
    return {
      ok: false,
      error: capabilityContract.error,
      events: ["runtime.officialModule.cmpBridge.rejected", ...capabilityContract.events],
    };
  }

  return {
    ok: true,
    plan: {
      runtimeId: capabilityContract.contract.runtimeId,
      moduleId: capabilityContract.contract.moduleId,
      moduleKind: "CMP",
      contextId: optionalTrim(request?.contextId),
      taskId: optionalTrim(request?.taskId),
      capabilityContract: capabilityContract.contract,
      contextAccess: "runtime-mediated",
      taskAccess: "runtime-mediated",
      invocationAccess: "dry-run",
      dispatch: "dry-run",
      cmpStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.cmpBridge.planned", ...capabilityContract.events],
  };
}
