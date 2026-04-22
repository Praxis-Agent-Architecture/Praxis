/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：承托 AgentCore 复用调用能力，让上层应用、CMP、MP、TAP 可以把 agentCore 打包复用。
 * 能力要求1：更偏向复用已构建的 Agent 实例、能力集合或运行对象，而不是单纯缓存一次调用结果。
 * 能力要求2：需要服务未来 OAO 场景：用户可以 new 出一个 agentCore 对象并用它承接实际 Agent。
 * 能力要求3：需要让官方模块也按同一复用方式实践 agentCore，而不是各自绕开核心。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentCoreReuseTargetKind = "agent-core-instance" | "capability-set" | "runtime-object";

export type AgentCoreReuseCaller = "application" | "cmp" | "mp" | "tap" | "multiagent" | "runtime";

export type AgentCoreReuseBoundary = "input" | "contract" | "governance" | "scope";

export type AgentCoreReuseGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentCoreReuseTrace = {
  correlationId?: string;
  sessionId?: string;
  callerId?: string;
};

export type AgentCoreReuseRequest = {
  reuseId?: string;
  targetKind?: AgentCoreReuseTargetKind;
  caller?: AgentCoreReuseCaller;
  requestedCapabilities?: readonly string[];
  allowedCapabilities?: readonly string[];
  invocationPayload?: unknown;
  trace?: AgentCoreReuseTrace;
  contract?: AgentCoreReuseGate;
  governance?: AgentCoreReuseGate;
};

export type AgentCoreReuseErrorCode =
  | "MISSING_REUSE_ID"
  | "MISSING_TARGET_KIND"
  | "MISSING_CALLER"
  | "CAPABILITY_SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentCoreReuseError = {
  code: AgentCoreReuseErrorCode;
  message: string;
  boundary: AgentCoreReuseBoundary;
  stateSafe: true;
};

export type AgentCoreReusePlan = {
  reuseId: string;
  targetKind: AgentCoreReuseTargetKind;
  caller: AgentCoreReuseCaller;
  requestedCapabilities: readonly string[];
  grantedCapabilities: readonly string[];
  deniedCapabilities: readonly string[];
  invocationPayload?: unknown;
  trace: AgentCoreReuseTrace;
  reuseMode: "existing-object";
  dryRun: true;
  unsafeSideEffects: false;
};

export type AgentCoreReuseResult =
  | {
      ok: true;
      plan: AgentCoreReusePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentCoreReuseError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: AgentCoreReuseTrace | undefined): AgentCoreReuseTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function failure(code: AgentCoreReuseErrorCode, message: string, boundary: AgentCoreReuseBoundary): AgentCoreReuseResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.execution.reuse.rejected"],
  };
}

export function createAgentCoreReuseInvocation(request: AgentCoreReuseRequest): AgentCoreReuseResult {
  if (isBlank(request.reuseId)) {
    return failure("MISSING_REUSE_ID", "reuseInvoker requires a reuseId for the existing agentCore object", "input");
  }

  if (request.targetKind === undefined) {
    return failure("MISSING_TARGET_KIND", "reuseInvoker requires a targetKind before planning reuse", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "reuseInvoker requires the caller surface for governance and audit", "input");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "reuse invocation was rejected by contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "reuse invocation was rejected by governance", "governance");
  }

  const requestedCapabilities = cleanList(request.requestedCapabilities);
  const allowedCapabilities = cleanList(request.allowedCapabilities);
  const grantedCapabilities =
    allowedCapabilities.length === 0
      ? requestedCapabilities
      : requestedCapabilities.filter((capability) => allowedCapabilities.includes(capability));
  const deniedCapabilities =
    allowedCapabilities.length === 0
      ? []
      : requestedCapabilities.filter((capability) => !allowedCapabilities.includes(capability));

  if (deniedCapabilities.length > 0) {
    return failure(
      "CAPABILITY_SCOPE_DENIED",
      `reuse invocation requested capabilities outside the allowed boundary: ${deniedCapabilities.join(", ")}`,
      "scope",
    );
  }

  return {
    ok: true,
    plan: {
      reuseId: (request.reuseId ?? "").trim(),
      targetKind: request.targetKind,
      caller: request.caller,
      requestedCapabilities,
      grantedCapabilities,
      deniedCapabilities,
      invocationPayload: request.invocationPayload,
      trace: cleanTrace(request.trace),
      reuseMode: "existing-object",
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.execution.reuse.planned"],
  };
}
