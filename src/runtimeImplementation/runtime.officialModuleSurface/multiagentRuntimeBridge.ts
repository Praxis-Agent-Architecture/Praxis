/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为多 Agent 管理系统桥接 project-local session mesh 能力。
 * 能力要求1：需要让多 Agent 系统能够复用 agentCore 实例、session mesh 和 runtime surface。
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
  requesterSessionId?: string;
  targetSessionId?: string;
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
  requesterSessionId?: string;
  targetSessionId?: string;
  coordinationId?: string;
  capabilityContract: OfficialModuleCapabilityContract;
  spawnAccess: "runtime-mediated";
  messageAccess: "runtime-mediated";
  inboxAccess: "runtime-mediated";
  waitAccess: "runtime-mediated";
  stopAccess: "runtime-mediated";
  killAccess: "runtime-mediated";
  listAccess: "runtime-mediated";
  inspectAccess: "runtime-mediated";
  coordinationAccess: "runtime-mediated";
  runtimeReuseAccess: "runtime-mediated";
  dispatch: "runtime-mediated";
  topology: "project-session-mesh";
  multiagentStrategyImplemented: true;
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
      { capabilityId: "runtime.agent.message", channel: "invoke", reason: "multiagent needs message access" },
      { capabilityId: "runtime.agent.inbox", channel: "invoke", reason: "multiagent needs inbox access" },
      { capabilityId: "runtime.agent.wait", channel: "invoke", reason: "multiagent needs wait access" },
      { capabilityId: "runtime.agent.stop", channel: "invoke", reason: "multiagent needs stop access" },
      { capabilityId: "runtime.agent.kill", channel: "invoke", reason: "multiagent needs kill access" },
      { capabilityId: "runtime.agent.list", channel: "read", reason: "multiagent needs project-local list access" },
      { capabilityId: "runtime.agent.inspect", channel: "read", reason: "multiagent needs project-local inspect access" },
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
      requesterSessionId: optionalTrim(request?.requesterSessionId),
      targetSessionId: optionalTrim(request?.targetSessionId),
      coordinationId: optionalTrim(request?.coordinationId),
      capabilityContract: capabilityContract.contract,
      spawnAccess: "runtime-mediated",
      messageAccess: "runtime-mediated",
      inboxAccess: "runtime-mediated",
      waitAccess: "runtime-mediated",
      stopAccess: "runtime-mediated",
      killAccess: "runtime-mediated",
      listAccess: "runtime-mediated",
      inspectAccess: "runtime-mediated",
      coordinationAccess: "runtime-mediated",
      runtimeReuseAccess: "runtime-mediated",
      dispatch: "runtime-mediated",
      topology: "project-session-mesh",
      multiagentStrategyImplemented: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.multiagentBridge.planned", ...capabilityContract.events],
  };
}
