/*
 * 文件定位：Agent 执行引擎 / Context compact contract。
 * 核心目的：定义 turn-boundary compact 的判定、执行器抽象和审计记录。
 * 边界：不在 action 中途打断，不绑定具体 provider compact API，不保存 raw secret/provider body。
 */

export type CompactTriggerKind = "turnBoundary" | "toolLoopBoundary";

export type CompactThresholdDecision = {
  kind: "praxis.contextCompact.thresholdDecision";
  shouldCompact: boolean;
  trigger: CompactTriggerKind;
  thresholdRatio: number;
  estimatedNextPromptTokens: number;
  contextWindowTokens: number;
  usageRatio: number;
  reason: string;
  publicSafe: true;
};

export type CompactRecord = {
  kind: "praxis.contextCompact.record";
  compactId: string;
  sessionId: string;
  trigger: CompactTriggerKind;
  thresholdRatio: number;
  before: {
    estimatedTokens: number;
    materialRefs: readonly string[];
  };
  after: {
    estimatedTokens: number;
    sessionSummaryRef: string;
    recentConversationRefs: readonly string[];
  };
  compactedMaterialRefs: readonly string[];
  artifactRefs: readonly string[];
  createdAt: string;
  executor: "provider-native" | "summaryAgent" | "application" | "runtimeFallback";
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type CompactExecutorRequest = {
  sessionId: string;
  trigger: CompactTriggerKind;
  materialRefs: readonly string[];
  materials?: readonly {
    id: string;
    promptSegmentKind?: string;
    text: string;
    source?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }[];
  currentUserTurnText?: string;
  estimatedTokens: number;
  contextWindowTokens: number;
  thresholdRatio?: number;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CompactExecutorResult =
  | {
      ok: true;
      sessionSummaryText: string;
      recentConversationText: string;
      record: CompactRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

export type CompactExecutor = {
  compact(request: CompactExecutorRequest): Promise<CompactExecutorResult>;
};

export function decideTurnBoundaryCompact(input: {
  trigger?: CompactTriggerKind;
  estimatedNextPromptTokens: number;
  contextWindowTokens: number;
  thresholdRatio?: number;
}): CompactThresholdDecision {
  const trigger = input.trigger ?? "turnBoundary";
  const thresholdRatio = input.thresholdRatio === undefined || !Number.isFinite(input.thresholdRatio)
    ? 0.95
    : Math.min(1, Math.max(0.01, input.thresholdRatio));
  const usageRatio = input.contextWindowTokens > 0 ? input.estimatedNextPromptTokens / input.contextWindowTokens : 1;
  const shouldCompact = input.contextWindowTokens > 0 && usageRatio >= thresholdRatio;
  return {
    kind: "praxis.contextCompact.thresholdDecision",
    shouldCompact,
    trigger,
    thresholdRatio,
    estimatedNextPromptTokens: Math.max(0, input.estimatedNextPromptTokens),
    contextWindowTokens: Math.max(0, input.contextWindowTokens),
    usageRatio,
    reason: shouldCompact
      ? `estimated next PromptPack is ${(usageRatio * 100).toFixed(1)}% of context window; compact at boundary`
      : `estimated next PromptPack is ${(usageRatio * 100).toFixed(1)}% of context window; no compact needed`,
    publicSafe: true,
  };
}

export function createRuntimeFallbackCompactExecutor(): CompactExecutor {
  return {
    async compact(request) {
      const now = request.now ?? new Date().toISOString();
      const thresholdRatio = request.thresholdRatio ?? 0.95;
      const summaryText = [
        "Runtime fallback compact summary.",
        `Compacted ${request.materialRefs.length} material refs after ${request.trigger}.`,
        request.currentUserTurnText === undefined ? "" : `Current user turn to preserve: ${request.currentUserTurnText}`,
      ].filter(Boolean).join("\n");
      const recentConversationText = request.currentUserTurnText ?? "";
      const compactId = `${request.sessionId}:compact:${now}`;
      return {
        ok: true,
        sessionSummaryText: summaryText,
        recentConversationText,
        record: {
          kind: "praxis.contextCompact.record",
          compactId,
          sessionId: request.sessionId,
          trigger: request.trigger,
          thresholdRatio,
          before: {
            estimatedTokens: request.estimatedTokens,
            materialRefs: request.materialRefs,
          },
          after: {
            estimatedTokens: Math.max(1, Math.ceil(summaryText.length / 4) + Math.ceil(recentConversationText.length / 4)),
            sessionSummaryRef: `${compactId}:sessionSummary`,
            recentConversationRefs: recentConversationText.length === 0 ? [] : [`${compactId}:recentConversation`],
          },
          compactedMaterialRefs: request.materialRefs,
          artifactRefs: [],
          createdAt: now,
          executor: "runtimeFallback",
          metadata: request.metadata ?? {},
          publicSafe: true,
        },
        events: ["contextCompact.runtimeFallback.completed"],
      };
    },
  };
}
