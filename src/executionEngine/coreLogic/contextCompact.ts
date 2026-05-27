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

function estimateTextTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : Math.max(1, Math.ceil(trimmed.length / 4));
}

function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\n{3,}/gu, "\n\n").trim();
  if (normalized.length <= maxChars) return normalized;
  const head = Math.max(1, Math.floor(maxChars * 0.65));
  const tail = Math.max(1, maxChars - head - 80);
  return `${normalized.slice(0, head).trimEnd()}\n[... passive compact omitted repetitive payload; raw material remains by ref ...]\n${normalized.slice(-tail).trimStart()}`;
}

function materialTitle(input: NonNullable<CompactExecutorRequest["materials"]>[number]): string {
  return [
    input.promptSegmentKind ?? "material",
    input.source === undefined ? undefined : `source=${input.source}`,
    `id=${input.id}`,
  ].filter((part): part is string => part !== undefined).join(" | ");
}

function materialPriority(input: NonNullable<CompactExecutorRequest["materials"]>[number]): number {
  const kind = input.promptSegmentKind ?? "";
  const source = input.source ?? "";
  if (kind === "recentConversation") return 0;
  if (kind === "observations") return 1;
  if (kind === "sessionSummary") return 2;
  if (kind === "retrievedContext") return 3;
  if (source.includes("conversation") || source.includes("ledger")) return 0;
  if (source.includes("observation") || source.includes("tool")) return 1;
  return 4;
}

function passiveDenoiseCompactMaterials(request: CompactExecutorRequest): {
  summaryText: string;
  recentConversationText: string;
  compactedMaterialRefs: readonly string[];
  artifactRefs: readonly string[];
  denoisedMaterials: number;
  droppedEmptyMaterials: number;
} {
  const materials = (request.materials ?? [])
    .filter((material) => material.text.trim().length > 0)
    .sort((left, right) => materialPriority(left) - materialPriority(right));
  const droppedEmptyMaterials = (request.materials?.length ?? 0) - materials.length;
  const compactedMaterialRefs = materials.length > 0
    ? materials.map((material) => material.id)
    : request.materialRefs;
  const artifactRefs = materials.flatMap((material) => {
    const value = material.metadata?.artifactRefs;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  });

  const causalSections = materials.map((material) => {
    const body = compactText(material.text, material.promptSegmentKind === "recentConversation" ? 3_500 : 2_000);
    return [`### ${materialTitle(material)}`, body].join("\n");
  });
  const currentTurn = request.currentUserTurnText === undefined
    ? undefined
    : `### currentUserTurn\n${compactText(request.currentUserTurnText, 2_000)}`;
  const summaryText = [
    "Runtime fallback compact summary (ledger-aware passive denoise).",
    `Trigger: ${request.trigger}. Preserve causal order: user intent -> model/tool action -> result/error -> verification/artifact refs.`,
    `Before compact: estimatedTokens=${request.estimatedTokens}, contextWindowTokens=${request.contextWindowTokens}, materialRefs=${request.materialRefs.length}.`,
    droppedEmptyMaterials > 0 ? `Dropped ${droppedEmptyMaterials} empty material(s) during passive denoise.` : undefined,
    ...causalSections,
    currentTurn,
  ].filter((part): part is string => part !== undefined && part.trim().length > 0).join("\n\n");

  const recentConversationMaterials = materials.filter((material) =>
    material.promptSegmentKind === "recentConversation" ||
    (material.source ?? "").includes("conversation") ||
    (material.source ?? "").includes("ledger")
  );
  const recentConversationText = [
    ...recentConversationMaterials.map((material) => compactText(material.text, 2_500)),
    request.currentUserTurnText,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join("\n\n---\n\n");

  return {
    summaryText: compactText(summaryText, 24_000),
    recentConversationText: compactText(recentConversationText, 8_000),
    compactedMaterialRefs,
    artifactRefs: [...new Set(artifactRefs)],
    denoisedMaterials: materials.length,
    droppedEmptyMaterials,
  };
}

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
      const denoised = passiveDenoiseCompactMaterials(request);
      const summaryText = denoised.summaryText;
      const recentConversationText = denoised.recentConversationText;
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
            estimatedTokens: Math.max(1, estimateTextTokens(summaryText) + estimateTextTokens(recentConversationText)),
            sessionSummaryRef: `${compactId}:sessionSummary`,
            recentConversationRefs: recentConversationText.length === 0 ? [] : [`${compactId}:recentConversation`],
          },
          compactedMaterialRefs: denoised.compactedMaterialRefs,
          artifactRefs: denoised.artifactRefs,
          createdAt: now,
          executor: "runtimeFallback",
          metadata: {
            ...(request.metadata ?? {}),
            passiveDenoise: "ledger-aware",
            denoisedMaterials: denoised.denoisedMaterials,
            droppedEmptyMaterials: denoised.droppedEmptyMaterials,
          },
          publicSafe: true,
        },
        events: ["contextCompact.runtimeFallback.passiveDenoise.completed", "contextCompact.runtimeFallback.completed"],
      };
    },
  };
}
