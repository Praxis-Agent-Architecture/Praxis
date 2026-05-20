/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：给上层应用提供受控 runtime 上下文。
 * 能力要求1：需要包含当前能力、会话、模式、事件订阅、治理状态等应用需要的信息。
 * 能力要求2：不能泄露执行引擎、模型适配或官方模块的内部可变状态。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationRuntimeContextErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "RUNTIME_NOT_READY"
  | "GOVERNANCE_REJECTED";

export type ApplicationRuntimeContextError = {
  code: ApplicationRuntimeContextErrorCode;
  message: string;
  boundary: "input" | "runtime-state" | "governance";
};

export type ApplicationRuntimeContextGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationRuntimeCapabilityView = {
  capabilityId: string;
  kind?: "agent" | "tool" | "model" | "interface" | "event";
  visibility?: "public" | "application" | "internal";
};

export type ApplicationRuntimeSessionView = {
  sessionId: string;
  agentId?: string;
  status: "new" | "active" | "paused" | "closed";
};

export type ApplicationRuntimeModeView = {
  modeId: string;
  label?: string;
  active?: boolean;
};

export type ApplicationRuntimeContextRequest = {
  runtimeId: string;
  applicationId: string;
  runtimeReady?: boolean;
  sessionId?: string;
  capabilities?: readonly ApplicationRuntimeCapabilityView[];
  sessions?: readonly ApplicationRuntimeSessionView[];
  modes?: readonly ApplicationRuntimeModeView[];
  eventSubscriptions?: readonly string[];
  governance?: ApplicationRuntimeContextGate;
};

export type ApplicationRuntimeContext = {
  runtimeId: string;
  applicationId: string;
  sessionId?: string;
  capabilities: readonly Omit<ApplicationRuntimeCapabilityView, "visibility">[];
  sessions: readonly ApplicationRuntimeSessionView[];
  modes: readonly ApplicationRuntimeModeView[];
  activeModeId?: string;
  eventSubscriptions: readonly string[];
  governanceState: "accepted";
  internalStateExposed: false;
};

export type ApplicationRuntimeContextResult =
  | {
      ok: true;
      context: ApplicationRuntimeContext;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationRuntimeContextError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function visibleCapabilities(
  capabilities: readonly ApplicationRuntimeCapabilityView[] | undefined,
): readonly Omit<ApplicationRuntimeCapabilityView, "visibility">[] {
  return (capabilities ?? [])
    .filter((capability) => !isBlank(capability.capabilityId))
    .filter((capability) => capability.visibility !== "internal")
    .map((capability) => {
      const visible: Omit<ApplicationRuntimeCapabilityView, "visibility"> = {
        capabilityId: capability.capabilityId.trim(),
      };

      if (capability.kind !== undefined) {
        visible.kind = capability.kind;
      }

      return visible;
    });
}

function visibleSessions(
  sessions: readonly ApplicationRuntimeSessionView[] | undefined,
): readonly ApplicationRuntimeSessionView[] {
  return (sessions ?? [])
    .filter((session) => !isBlank(session.sessionId))
    .map((session) => ({
      sessionId: session.sessionId.trim(),
      agentId: session.agentId?.trim() || undefined,
      status: session.status,
    }));
}

function visibleModes(modes: readonly ApplicationRuntimeModeView[] | undefined): readonly ApplicationRuntimeModeView[] {
  return (modes ?? [])
    .filter((mode) => !isBlank(mode.modeId))
    .map((mode) => ({
      modeId: mode.modeId.trim(),
      label: mode.label?.trim() || undefined,
      active: mode.active,
    }));
}

function failure(
  code: ApplicationRuntimeContextErrorCode,
  message: string,
  boundary: ApplicationRuntimeContextError["boundary"],
): ApplicationRuntimeContextResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.runtime.context.rejected"],
  };
}

export function createApplicationRuntimeContext(
  request: ApplicationRuntimeContextRequest,
): ApplicationRuntimeContextResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before exposing application context", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure(
      "MISSING_APPLICATION_ID",
      "applicationId is required before exposing application context",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "application context can only expose a ready runtime", "runtime-state");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application runtime context was rejected by governance",
      "governance",
    );
  }

  const modes = visibleModes(request.modes);
  const activeMode = modes.find((mode) => mode.active);

  return {
    ok: true,
    context: {
      runtimeId: request.runtimeId.trim(),
      applicationId: request.applicationId.trim(),
      sessionId: request.sessionId?.trim() || undefined,
      capabilities: visibleCapabilities(request.capabilities),
      sessions: visibleSessions(request.sessions),
      modes,
      activeModeId: activeMode?.modeId,
      eventSubscriptions: cleanList(request.eventSubscriptions),
      governanceState: "accepted",
      internalStateExposed: false,
    },
    events: ["application.runtime.context.ready"],
  };
}
