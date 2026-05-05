/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：把上层 Agent 应用挂载到 agentCore runtime。
 * 能力要求1：需要处理应用生命周期、能力申请、事件订阅和治理接入。
 * 能力要求2：它让应用成为 runtime 的正式使用者，而不是临时调用脚本。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentApplicationMountErrorCode =
  | "MISSING_APPLICATION_ID"
  | "MISSING_RUNTIME_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentApplicationMountError = {
  code: AgentApplicationMountErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "runtime-state";
};

export type AgentApplicationMountGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentApplicationMountRequest = {
  applicationId: string;
  runtimeId: string;
  requestedCapabilities?: readonly string[];
  eventSubscriptions?: readonly string[];
  runtimeReady?: boolean;
  contract?: AgentApplicationMountGate;
  governance?: AgentApplicationMountGate;
};

export type AgentApplicationMountRecord = {
  mountId: string;
  applicationId: string;
  runtimeId: string;
  lifecycleState: "mounted";
  acceptedCapabilities: readonly string[];
  eventSubscriptions: readonly string[];
  governanceState: "accepted";
};

export type AgentApplicationMountResult =
  | {
      ok: true;
      record: AgentApplicationMountRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentApplicationMountError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: AgentApplicationMountErrorCode,
  message: string,
  boundary: AgentApplicationMountError["boundary"],
): AgentApplicationMountResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.mount.rejected"],
  };
}

export function mountAgentApplication(request: AgentApplicationMountRequest): AgentApplicationMountResult {
  if (isBlank(request.applicationId)) {
    return failure("MISSING_APPLICATION_ID", "applicationId is required before mounting an application", "input");
  }

  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before mounting an application", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime must be ready before accepting application mounts", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "application contract was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application mount was rejected by runtime governance",
      "governance",
    );
  }

  const applicationId = request.applicationId.trim();
  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    record: {
      mountId: `${runtimeId}:${applicationId}`,
      applicationId,
      runtimeId,
      lifecycleState: "mounted",
      acceptedCapabilities: cleanList(request.requestedCapabilities),
      eventSubscriptions: cleanList(request.eventSubscriptions),
      governanceState: "accepted",
    },
    events: ["application.mount.accepted"],
  };
}
