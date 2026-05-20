/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：创建应用侧 runtime session，用来隔离会话、上下文和调用状态。
 * 能力要求1：需要支持一个应用挂多个 Agent 或同一 Agent 多会话的情况。
 * 能力要求2：它不等于记忆系统，只负责 runtime 层会话边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentRuntimeSessionCallState = "idle" | "invoking" | "streaming" | "closed";

export type AgentRuntimeSessionFactoryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "MISSING_AGENT_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentRuntimeSessionFactoryError = {
  code: AgentRuntimeSessionFactoryErrorCode;
  message: string;
  boundary: "input" | "runtime-state" | "contract" | "governance";
};

export type AgentRuntimeSessionFactoryGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeSessionFactoryRequest = {
  runtimeId: string;
  applicationId: string;
  agentId: string;
  sessionKey?: string;
  initialContextKeys?: readonly string[];
  callState?: AgentRuntimeSessionCallState;
  runtimeReady?: boolean;
  contract?: AgentRuntimeSessionFactoryGate;
  governance?: AgentRuntimeSessionFactoryGate;
};

export type AgentRuntimeSession = {
  sessionId: string;
  runtimeId: string;
  applicationId: string;
  agentId: string;
  sessionKey: string;
  contextKeys: readonly string[];
  callState: AgentRuntimeSessionCallState;
  isolation: "runtime-session";
  unsafeSideEffects: false;
};

export type AgentRuntimeSessionFactoryResult =
  | {
      ok: true;
      session: AgentRuntimeSession;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeSessionFactoryError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: AgentRuntimeSessionFactoryErrorCode,
  message: string,
  boundary: AgentRuntimeSessionFactoryError["boundary"],
): AgentRuntimeSessionFactoryResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.session.rejected"],
  };
}

export function createAgentRuntimeSession(
  request: AgentRuntimeSessionFactoryRequest,
): AgentRuntimeSessionFactoryResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before creating a runtime session", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure("MISSING_APPLICATION_ID", "applicationId is required before creating a runtime session", "input");
  }

  if (isBlank(request.agentId)) {
    return failure("MISSING_AGENT_ID", "agentId is required before creating a runtime session", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime session requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime session request was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime session request was rejected by governance",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const applicationId = request.applicationId.trim();
  const agentId = request.agentId.trim();
  const sessionKey = request.sessionKey?.trim() || "default";

  return {
    ok: true,
    session: {
      sessionId: `${runtimeId}:${applicationId}:${agentId}:${sessionKey}`,
      runtimeId,
      applicationId,
      agentId,
      sessionKey,
      contextKeys: cleanList(request.initialContextKeys),
      callState: request.callState ?? "idle",
      isolation: "runtime-session",
      unsafeSideEffects: false,
    },
    events: ["runtime.session.created"],
  };
}
