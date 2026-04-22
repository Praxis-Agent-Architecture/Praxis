/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：返回给上层应用的稳定 runtime 句柄。
 * 能力要求1：句柄需要能发起调用、订阅事件、查询状态、关闭实例，但不暴露内部可变对象。
 * 能力要求2：它是开发者真正拿在手里使用 agentCore 的对象边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentRuntimeHandleOperation = "invoke" | "subscribe" | "inspect" | "close";

export type AgentRuntimeHandleErrorCode =
  | "MISSING_RUNTIME_ID"
  | "RUNTIME_NOT_READY"
  | "UNSUPPORTED_OPERATION"
  | "HANDLE_CLOSED"
  | "GOVERNANCE_REJECTED";

export type AgentRuntimeHandleError = {
  code: AgentRuntimeHandleErrorCode;
  message: string;
  boundary: "input" | "runtime-state" | "governance";
};

export type AgentRuntimeHandleGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeHandleRequest = {
  runtimeId: string;
  applicationId?: string;
  runtimeReady?: boolean;
  enabledOperations?: readonly AgentRuntimeHandleOperation[];
  visibleSessions?: readonly string[];
  visibleEventTypes?: readonly string[];
  governance?: AgentRuntimeHandleGate;
};

export type AgentRuntimeHandleStatus = {
  runtimeId: string;
  applicationId?: string;
  status: "ready" | "closed";
  enabledOperations: readonly AgentRuntimeHandleOperation[];
  visibleSessions: readonly string[];
  visibleEventTypes: readonly string[];
};

export type AgentRuntimeHandleCall = {
  operation: AgentRuntimeHandleOperation;
  payload?: unknown;
};

export type AgentRuntimeHandleCallResult =
  | {
      ok: true;
      operation: AgentRuntimeHandleOperation;
      runtimeId: string;
      applicationId?: string;
      accepted: true;
      dryRun: true;
    }
  | {
      ok: false;
      error: AgentRuntimeHandleError;
    };

export type AgentRuntimeHandleCloseResult =
  | {
      ok: true;
      runtimeId: string;
      status: "closed";
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeHandleError;
      events: readonly string[];
    };

export type AgentRuntimeHandle = {
  runtimeId: string;
  applicationId?: string;
  enabledOperations: readonly AgentRuntimeHandleOperation[];
  visibleSessions: readonly string[];
  visibleEventTypes: readonly string[];
  call: (call: AgentRuntimeHandleCall) => AgentRuntimeHandleCallResult;
  getStatus: () => AgentRuntimeHandleStatus;
  close: () => AgentRuntimeHandleCloseResult;
};

export type AgentRuntimeHandleResult =
  | {
      ok: true;
      handle: AgentRuntimeHandle;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeHandleError;
      events: readonly string[];
    };

const defaultHandleOperations = ["invoke", "subscribe", "inspect", "close"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanOperations(
  values: readonly AgentRuntimeHandleOperation[] | undefined,
): readonly AgentRuntimeHandleOperation[] {
  return [...new Set(values ?? defaultHandleOperations)];
}

function failure(
  code: AgentRuntimeHandleErrorCode,
  message: string,
  boundary: AgentRuntimeHandleError["boundary"],
): AgentRuntimeHandleResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.handle.rejected"],
  };
}

function callFailure(
  code: AgentRuntimeHandleErrorCode,
  message: string,
  boundary: AgentRuntimeHandleError["boundary"],
): AgentRuntimeHandleCallResult {
  return {
    ok: false,
    error: { code, message, boundary },
  };
}

export function createAgentRuntimeHandle(request: AgentRuntimeHandleRequest): AgentRuntimeHandleResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before creating a runtime handle", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime handle can only wrap a ready runtime", "runtime-state");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime handle creation was rejected by governance",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const applicationId = request.applicationId?.trim() || undefined;
  const enabledOperations = cleanOperations(request.enabledOperations);
  const visibleSessions = cleanList(request.visibleSessions);
  const visibleEventTypes = cleanList(request.visibleEventTypes);
  let closed = false;

  const handle: AgentRuntimeHandle = {
    runtimeId,
    applicationId,
    enabledOperations,
    visibleSessions,
    visibleEventTypes,
    call(call: AgentRuntimeHandleCall): AgentRuntimeHandleCallResult {
      if (closed) {
        return callFailure("HANDLE_CLOSED", "runtime handle is already closed", "runtime-state");
      }

      if (!enabledOperations.includes(call.operation)) {
        return callFailure(
          "UNSUPPORTED_OPERATION",
          `operation ${call.operation} is not enabled for this runtime handle`,
          "input",
        );
      }

      return {
        ok: true,
        operation: call.operation,
        runtimeId,
        applicationId,
        accepted: true,
        dryRun: true,
      };
    },
    getStatus(): AgentRuntimeHandleStatus {
      return {
        runtimeId,
        applicationId,
        status: closed ? "closed" : "ready",
        enabledOperations,
        visibleSessions,
        visibleEventTypes,
      };
    },
    close(): AgentRuntimeHandleCloseResult {
      if (closed) {
        return {
          ok: false,
          error: {
            code: "HANDLE_CLOSED",
            message: "runtime handle is already closed",
            boundary: "runtime-state",
          },
          events: ["runtime.handle.close.rejected"],
        };
      }

      closed = true;
      return {
        ok: true,
        runtimeId,
        status: "closed",
        events: ["runtime.handle.closed"],
      };
    },
  };

  return {
    ok: true,
    handle,
    events: ["runtime.handle.ready"],
  };
}
