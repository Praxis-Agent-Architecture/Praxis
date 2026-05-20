/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面。
 * 核心目的：承载 reply Event 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ReplyEventKind = "text" | "data" | "media" | "status";

export type ReplyEventSource = "main-loop" | "runtime-exec-engine" | "official-module" | "debug";

export type ReplyEventBoundary = "input" | "contract" | "governance" | "subscription";

export type ReplyEventGate = {
  accepted: boolean;
  reason?: string;
};

export type ReplyEventTrace = {
  correlationId?: string;
  sessionId?: string;
  callerId?: string;
};

export type ReplyEventPayload = {
  kind: ReplyEventKind;
  content: unknown;
  format?: string;
};

export type ReplyEventRequest = {
  sessionId?: string;
  replyId?: string;
  source?: ReplyEventSource;
  reply?: ReplyEventPayload;
  subscribers?: readonly string[];
  trace?: ReplyEventTrace;
  contract?: ReplyEventGate;
  governance?: ReplyEventGate;
};

export type ReplyEventErrorCode =
  | "MISSING_SESSION_ID"
  | "MISSING_REPLY_ID"
  | "MISSING_REPLY_PAYLOAD"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ReplyEventError = {
  code: ReplyEventErrorCode;
  message: string;
  boundary: ReplyEventBoundary;
  stateSafe: true;
};

export type ExposedReplyEvent = {
  eventId: string;
  type: "agent.reply";
  sessionId: string;
  replyId: string;
  source: ReplyEventSource;
  reply: ReplyEventPayload;
  subscribers: readonly string[];
  trace: ReplyEventTrace;
  visibility: "event-exposure-plane";
  dryRun: true;
  unsafeSideEffects: false;
};

export type ReplyEventResult =
  | {
      ok: true;
      event: ExposedReplyEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ReplyEventError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: ReplyEventTrace | undefined, sessionId: string): ReplyEventTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || sessionId,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function failure(code: ReplyEventErrorCode, message: string, boundary: ReplyEventBoundary): ReplyEventResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.execution.replyEvent.rejected"],
  };
}

export function exposeReplyEvent(request: ReplyEventRequest): ReplyEventResult {
  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "replyEvent requires a sessionId before exposing an execution reply", "input");
  }

  if (isBlank(request.replyId)) {
    return failure("MISSING_REPLY_ID", "replyEvent requires a replyId for subscription and debug correlation", "input");
  }

  if (request.reply === undefined || request.reply.content === undefined) {
    return failure("MISSING_REPLY_PAYLOAD", "replyEvent requires a reply payload before exposure", "input");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "reply event was rejected by contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "reply event was rejected by governance", "governance");
  }

  const sessionId = (request.sessionId ?? "").trim();
  const replyId = (request.replyId ?? "").trim();

  return {
    ok: true,
    event: {
      eventId: `${sessionId}:reply:${replyId}`,
      type: "agent.reply",
      sessionId,
      replyId,
      source: request.source ?? "main-loop",
      reply: {
        kind: request.reply.kind,
        content: request.reply.content,
        format: request.reply.format?.trim() || undefined,
      },
      subscribers: cleanList(request.subscribers),
      trace: cleanTrace(request.trace, sessionId),
      visibility: "event-exposure-plane",
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.execution.replyEvent.exposed"],
  };
}
