/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptation Feedback Loop 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptationFeedbackBoundary = "input" | "contract" | "governance" | "runtime-state" | "decision" | "feedback";

export type AdaptationFeedbackCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type AdaptationFeedbackCaller = {
  kind: AdaptationFeedbackCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type AdaptationFeedbackGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptationFeedbackOutcome = "accepted" | "deferred" | "rejected" | "observed";

export type AdaptationFeedbackItem = {
  feedbackId?: string;
  decisionId?: string;
  outcome?: AdaptationFeedbackOutcome | string;
  signalRefs?: readonly string[];
  note?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptationFeedbackErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_LOOP_ID"
  | "MISSING_DECISION_ID"
  | "MISSING_FEEDBACK"
  | "MISSING_FEEDBACK_ID"
  | "MISSING_FEEDBACK_OUTCOME"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AdaptationFeedbackError = {
  code: AdaptationFeedbackErrorCode;
  message: string;
  boundary: AdaptationFeedbackBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type AdaptationFeedbackRecord = {
  feedbackId: string;
  decisionId: string;
  outcome: AdaptationFeedbackOutcome | string;
  signalRefs: readonly string[];
  note?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type AdaptationFeedbackLoopState = {
  runtimeId: string;
  loopId: string;
  decisionId: string;
  caller: AdaptationFeedbackCaller;
  route: "runtime.adaptiveRuntime.adaptationFeedbackLoop";
  feedback: readonly AdaptationFeedbackRecord[];
  nextSignalRefs: readonly string[];
  status: "feedback-recorded";
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
};

export type AdaptationFeedbackLoopRequest = {
  runtimeId?: string;
  loopId?: string;
  decisionId?: string;
  caller?: AdaptationFeedbackCaller;
  feedback?: readonly AdaptationFeedbackItem[];
  runtimeReady?: boolean;
  contract?: AdaptationFeedbackGate;
  governance?: AdaptationFeedbackGate;
};

export type AdaptationFeedbackLoopResult =
  | {
      ok: true;
      loop: AdaptationFeedbackLoopState;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptationFeedbackError;
      events: readonly string[];
    };

export const adaptationFeedbackLoopDescriptor = {
  surface: "runtime.adaptiveRuntime",
  capability: "adaptationFeedbackLoop",
  purpose: "record adaptation decision feedback as a dry-run loop envelope",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: AdaptationFeedbackCaller): AdaptationFeedbackCaller {
  const normalized: AdaptationFeedbackCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: AdaptationFeedbackErrorCode,
  message: string,
  boundary: AdaptationFeedbackBoundary,
): AdaptationFeedbackLoopResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.adaptiveRuntime.feedbackLoop.rejected"],
  };
}

function normalizeFeedback(
  item: AdaptationFeedbackItem,
  defaultDecisionId: string,
): AdaptationFeedbackRecord | AdaptationFeedbackLoopResult {
  const feedbackId = item.feedbackId?.trim();
  if (!hasText(feedbackId)) {
    return failure("MISSING_FEEDBACK_ID", "adaptation feedback loop requires every feedback item to include feedbackId", "feedback");
  }

  const decisionId = item.decisionId?.trim() || defaultDecisionId;
  if (!hasText(decisionId)) {
    return failure("MISSING_DECISION_ID", "adaptation feedback loop requires a decisionId", "decision");
  }

  const outcome = item.outcome?.trim();
  if (!hasText(outcome)) {
    return failure("MISSING_FEEDBACK_OUTCOME", "adaptation feedback loop requires every feedback item to include outcome", "feedback");
  }

  const note = item.note?.trim();
  const record: AdaptationFeedbackRecord = {
    feedbackId,
    decisionId,
    outcome,
    signalRefs: cleanList(item.signalRefs),
    metadata: item.metadata ?? {},
  };

  if (note !== undefined && note.length > 0) {
    record.note = note;
  }

  return record;
}

export function runAdaptationFeedbackLoop(
  request?: AdaptationFeedbackLoopRequest,
): AdaptationFeedbackLoopResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptation feedback loop requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptation feedback loop requires an application, module, or runtime caller", "input");
  }

  if (!hasText(request.loopId)) {
    return failure("MISSING_LOOP_ID", "adaptation feedback loop requires a loopId for auditability", "input");
  }

  if (!hasText(request.decisionId)) {
    return failure("MISSING_DECISION_ID", "adaptation feedback loop requires the decisionId being evaluated", "decision");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptation feedback can only be recorded through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptation feedback loop was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptation feedback loop was rejected by governance",
      "governance",
    );
  }

  if ((request.feedback ?? []).length === 0) {
    return failure("MISSING_FEEDBACK", "adaptation feedback loop requires at least one feedback item", "feedback");
  }

  const runtimeId = request.runtimeId.trim();
  const loopId = request.loopId.trim();
  const decisionId = request.decisionId.trim();
  const feedback: AdaptationFeedbackRecord[] = [];
  for (const item of request.feedback ?? []) {
    const normalized = normalizeFeedback(item, decisionId);
    if ("ok" in normalized) {
      return normalized;
    }

    feedback.push(normalized);
  }

  return {
    ok: true,
    loop: {
      runtimeId,
      loopId,
      decisionId,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptationFeedbackLoop",
      feedback,
      nextSignalRefs: cleanList(feedback.flatMap((item) => item.signalRefs)),
      status: "feedback-recorded",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
    },
    events: ["runtime.adaptiveRuntime.feedbackLoop.recorded"],
  };
}
