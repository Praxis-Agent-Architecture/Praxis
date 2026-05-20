/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 agent Runtime Instance 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentRuntimeInstancePhase = "created" | "ready" | "paused" | "closed" | "failed";

export type AgentRuntimeInstanceCaller = "application" | "official-module" | "runtime" | "inspection" | "debug";

export type AgentRuntimeInstanceBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type AgentRuntimeInstanceGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeInstanceTrace = {
  correlationId?: string;
  sessionId?: string;
  callerId?: string;
};

export type AgentRuntimeInstanceRequest = {
  runtimeId?: string;
  agentId?: string;
  caller?: AgentRuntimeInstanceCaller;
  phase?: AgentRuntimeInstancePhase | string;
  mountedSurfaces?: readonly string[];
  requiredSurfaces?: readonly string[];
  capabilityKeys?: readonly string[];
  trace?: AgentRuntimeInstanceTrace;
  contract?: AgentRuntimeInstanceGate;
  governance?: AgentRuntimeInstanceGate;
};

export type AgentRuntimeInstanceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_AGENT_ID"
  | "MISSING_CALLER"
  | "UNSUPPORTED_PHASE"
  | "RUNTIME_NOT_READY"
  | "SURFACE_NOT_MOUNTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentRuntimeInstanceError = {
  code: AgentRuntimeInstanceErrorCode;
  message: string;
  boundary: AgentRuntimeInstanceBoundary;
  stateSafe: true;
};

export type AgentRuntimeInstanceSnapshot = {
  runtimeId: string;
  agentId: string;
  caller: AgentRuntimeInstanceCaller;
  phase: "ready";
  mountedSurfaces: readonly string[];
  requiredSurfaces: readonly string[];
  capabilityKeys: readonly string[];
  trace: AgentRuntimeInstanceTrace;
  dryRun: true;
  unsafeSideEffects: false;
};

export type AgentRuntimeInstanceResult =
  | {
      ok: true;
      instance: AgentRuntimeInstanceSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeInstanceError;
      events: readonly string[];
    };

const supportedPhases = ["created", "ready", "paused", "closed", "failed"] as const;

const defaultRequiredSurfaces = [
  "runtime.contractSurface",
  "runtime.governancePlane",
  "runtime.invocationMethod",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: AgentRuntimeInstanceTrace | undefined): AgentRuntimeInstanceTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function isAgentRuntimeInstancePhase(value: string): value is AgentRuntimeInstancePhase {
  return supportedPhases.includes(value as AgentRuntimeInstancePhase);
}

function failure(
  code: AgentRuntimeInstanceErrorCode,
  message: string,
  boundary: AgentRuntimeInstanceBoundary,
): AgentRuntimeInstanceResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.runtime.instance.rejected"],
  };
}

export function createAgentRuntimeInstanceSnapshot(
  request: AgentRuntimeInstanceRequest,
): AgentRuntimeInstanceResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "agentRuntimeInstance requires a runtimeId before exposing an instance", "input");
  }

  if (isBlank(request.agentId)) {
    return failure("MISSING_AGENT_ID", "agentRuntimeInstance requires an agentId before exposing an instance", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "agentRuntimeInstance requires the caller surface for governance and audit", "input");
  }

  const phase = request.phase ?? "ready";
  if (typeof phase !== "string" || !isAgentRuntimeInstancePhase(phase.trim())) {
    return failure("UNSUPPORTED_PHASE", "agentRuntimeInstance received an unsupported runtime phase", "input");
  }

  if (phase.trim() !== "ready") {
    return failure("RUNTIME_NOT_READY", `agentRuntimeInstance cannot expose an active instance while phase is ${phase}`, "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "agentRuntimeInstance was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "agentRuntimeInstance was rejected by governance",
      "governance",
    );
  }

  const mountedSurfaces = cleanList(request.mountedSurfaces);
  const requiredSurfaces = cleanList(request.requiredSurfaces);
  const effectiveRequiredSurfaces = requiredSurfaces.length > 0 ? requiredSurfaces : defaultRequiredSurfaces;
  const missingSurfaces = effectiveRequiredSurfaces.filter((surface) => !mountedSurfaces.includes(surface));

  if (missingSurfaces.length > 0) {
    return failure(
      "SURFACE_NOT_MOUNTED",
      `agentRuntimeInstance requires mounted runtime surfaces: ${missingSurfaces.join(", ")}`,
      "scope",
    );
  }

  return {
    ok: true,
    instance: {
      runtimeId: (request.runtimeId ?? "").trim(),
      agentId: (request.agentId ?? "").trim(),
      caller: request.caller,
      phase: "ready",
      mountedSurfaces,
      requiredSurfaces: effectiveRequiredSurfaces,
      capabilityKeys: cleanList(request.capabilityKeys),
      trace: cleanTrace(request.trace),
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.runtime.instance.ready"],
  };
}
