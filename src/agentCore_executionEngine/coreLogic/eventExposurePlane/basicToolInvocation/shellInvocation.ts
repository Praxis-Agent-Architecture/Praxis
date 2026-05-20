/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 shell Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellInvocationEventPhase = "planned" | "started" | "completed" | "failed";

export type ShellInvocationEventBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type ShellInvocationEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_COMMAND"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellInvocationEventGate = {
  accepted: boolean;
  reason?: string;
};

export type ShellInvocationEventTrace = {
  correlationId?: string;
  callerId?: string;
  sessionId?: string;
};

export type ShellInvocationEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  command?: string;
  cwd?: string;
  phase?: ShellInvocationEventPhase;
  runtimeReady?: boolean;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: ShellInvocationEventGate;
  governance?: ShellInvocationEventGate;
  trace?: ShellInvocationEventTrace;
  observedAt?: string;
};

export type ShellInvocationEvent = {
  kind: "basicTool.shell.invocation";
  tool: "shell";
  eventId: string;
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  command: string;
  cwd?: string;
  phase: ShellInvocationEventPhase;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: ShellInvocationEventTrace;
  observedAt: string;
  dryRun: true;
  shellExecutionPlanned: false;
  unsafeSideEffects: false;
};

export type ShellInvocationEventError = {
  code: ShellInvocationEventErrorCode;
  message: string;
  boundary: ShellInvocationEventBoundary;
  publicSafe: true;
};

export type ShellInvocationEventResult =
  | {
      ok: true;
      event: ShellInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShellInvocationEventError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ShellInvocationEventErrorCode,
  message: string,
  boundary: ShellInvocationEventBoundary,
): ShellInvocationEventResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.eventExposure.basicTool.shell.rejected"],
  };
}

function cleanTrace(trace: ShellInvocationEventTrace | undefined, sessionId: string): ShellInvocationEventTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || sessionId,
  };
}

export function exposeShellInvocationEvent(request?: ShellInvocationEventRequest): ShellInvocationEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell invocation event requires a runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "shell invocation event requires a sessionId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "shell invocation event requires an invocationId", "input");
  }

  if (isBlank(request.command)) {
    return failure("MISSING_COMMAND", "shell invocation event requires a command summary", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "shell invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "shell invocation event was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "shell invocation event was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "shellInvocation only exposes a dry-run event envelope in the first implementation",
      "contract",
    );
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0 ? requestedScopes : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `shell invocation event includes scopes outside the event exposure boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = (request.sessionId ?? "").trim();
  const invocationId = (request.invocationId ?? "").trim();
  const command = (request.command ?? "").trim();
  const trace = cleanTrace(request.trace, sessionId);
  const observedAt = request.observedAt?.trim() || "dry-run";

  return {
    ok: true,
    event: {
      kind: "basicTool.shell.invocation",
      tool: "shell",
      eventId: `${runtimeId}:shell:${invocationId}:${trace.correlationId ?? observedAt}`,
      runtimeId,
      sessionId,
      invocationId,
      command,
      cwd: request.cwd?.trim() || undefined,
      phase: request.phase ?? "planned",
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace,
      observedAt,
      dryRun: true,
      shellExecutionPlanned: false,
      unsafeSideEffects: false,
    },
    events: ["agentCore.eventExposure.basicTool.shell.exposed"],
  };
}
