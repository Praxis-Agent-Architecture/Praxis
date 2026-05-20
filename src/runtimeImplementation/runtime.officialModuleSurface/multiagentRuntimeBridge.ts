/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为多 Agent 管理系统桥接 spawn、resume、interrupt、coordination 等能力。
 * 能力要求1：需要让多 Agent 系统能够复用 agentCore 实例和 runtime surface。
 * 能力要求2：它不实现完整 multiagent 策略，只提供 runtime 接入和协作边界。
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

export type MultiagentRuntimeBridgeRequest = {
  runtimeId?: string;
  moduleId?: string;
  parentAgentId?: string;
  childAgentId?: string;
  coordinationId?: string;
  requestedCapabilities?: readonly OfficialModuleCapabilityUse[];
  allowedCapabilities?: readonly OfficialModuleCapabilityGrant[];
  runtimeReady?: boolean;
  contract?: OfficialModuleGate;
  governance?: OfficialModuleGate;
};

export type MultiagentRuntimeBridgePlan = {
  runtimeId: string;
  moduleId: string;
  moduleKind: "multiagent";
  parentAgentId?: string;
  childAgentId?: string;
  coordinationId?: string;
  capabilityContract: OfficialModuleCapabilityContract;
  spawnAccess: "dry-run";
  resumeAccess: "dry-run";
  interruptAccess: "dry-run";
  coordinationAccess: "runtime-mediated";
  runtimeReuseAccess: "runtime-mediated";
  dispatch: "dry-run";
  multiagentStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type MultiagentRuntimeBridgeResult =
  | {
      ok: true;
      plan: MultiagentRuntimeBridgePlan;
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

export function createMultiagentRuntimeBridge(
  request?: MultiagentRuntimeBridgeRequest,
): MultiagentRuntimeBridgeResult {
  const capabilityContract = defineOfficialModuleCapabilityContract({
    runtimeId: request?.runtimeId,
    moduleId: request?.moduleId,
    moduleKind: "multiagent",
    requestedCapabilities: request?.requestedCapabilities ?? [
      { capabilityId: "runtime.agent.spawn", channel: "invoke", reason: "multiagent needs spawn access" },
      { capabilityId: "runtime.agent.resume", channel: "invoke", reason: "multiagent needs resume access" },
      { capabilityId: "runtime.agent.interrupt", channel: "invoke", reason: "multiagent needs interrupt access" },
      {
        capabilityId: "runtime.agent.coordination",
        channel: "invoke",
        reason: "multiagent needs coordination access",
      },
      { capabilityId: "runtime.surface.reuse", channel: "read", reason: "multiagent needs runtime reuse access" },
    ],
    allowedCapabilities: request?.allowedCapabilities ?? DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS.multiagent,
    runtimeReady: request?.runtimeReady,
    contract: request?.contract,
    governance: request?.governance,
  });

  if (!capabilityContract.ok) {
    return {
      ok: false,
      error: capabilityContract.error,
      events: ["runtime.officialModule.multiagentBridge.rejected", ...capabilityContract.events],
    };
  }

  return {
    ok: true,
    plan: {
      runtimeId: capabilityContract.contract.runtimeId,
      moduleId: capabilityContract.contract.moduleId,
      moduleKind: "multiagent",
      parentAgentId: optionalTrim(request?.parentAgentId),
      childAgentId: optionalTrim(request?.childAgentId),
      coordinationId: optionalTrim(request?.coordinationId),
      capabilityContract: capabilityContract.contract,
      spawnAccess: "dry-run",
      resumeAccess: "dry-run",
      interruptAccess: "dry-run",
      coordinationAccess: "runtime-mediated",
      runtimeReuseAccess: "runtime-mediated",
      dispatch: "dry-run",
      multiagentStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.multiagentBridge.planned", ...capabilityContract.events],
  };
}
