/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“做事实锚定”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SearchGroundBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type SearchGroundGate = {
  accepted: boolean;
  reason?: string;
};

export type SearchGroundMode = "strict" | "balanced" | "exploratory";

export type SearchGroundEvidence = {
  id?: string;
  url?: string;
  title?: string;
  excerpt?: string;
  observedAt?: string;
};

export type SearchGroundContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SearchGroundGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchGroundRequest = {
  context?: SearchGroundContext;
  claim?: string;
  evidence?: readonly SearchGroundEvidence[];
  mode?: SearchGroundMode;
  minimumEvidenceCount?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SearchGroundErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CLAIM"
  | "MISSING_EVIDENCE"
  | "INVALID_EVIDENCE"
  | "INVALID_EVIDENCE_URL"
  | "INVALID_MINIMUM_EVIDENCE_COUNT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_GROUNDING_NOT_ALLOWED";

export type SearchGroundError = {
  code: SearchGroundErrorCode;
  message: string;
  boundary: SearchGroundBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type SearchGroundPlan = {
  toolId: "search.ground";
  capability: "ground-factual-claim";
  runtimeId: string;
  invocationId: string;
  claim: string;
  mode: SearchGroundMode;
  minimumEvidenceCount: number;
  evidenceLedger: readonly {
    id: string;
    url?: string;
    title?: string;
    excerptPreview?: string;
    observedAt?: string;
  }[];
  requiredPermissions: readonly ["search:read", "grounding:audit"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldCompareEvidence: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  outputEnvelope: {
    status: "requires-review";
    grounded: false;
    confidence: "not-evaluated";
  };
  audit: {
    guard: "search-grounding-approval";
    event: "basicTool.search.ground.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type SearchGroundResult =
  | {
      ok: true;
      plan: SearchGroundPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: SearchGroundError;
      events: readonly string[];
    };

export const searchGroundDescriptor = {
  toolId: "search.ground",
  capability: "ground-factual-claim",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDispatch: "dry-run",
  defaultMode: "balanced",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

const MAX_EVIDENCE_ITEMS = 50;
const MAX_EXCERPT_PREVIEW = 240;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: SearchGroundErrorCode, message: string, boundary: SearchGroundBoundary): SearchGroundResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.search.ground.rejected"],
  };
}

function normalizeEvidenceUrl(value: string | undefined): string | SearchGroundResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must be a safe URL string", "input");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must be absolute when provided", "input");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must use http or https", "scope");
  }

  return parsed.toString();
}

function normalizeEvidence(
  evidence: readonly SearchGroundEvidence[] | undefined,
): SearchGroundPlan["evidenceLedger"] | SearchGroundResult {
  if (evidence === undefined || evidence.length === 0) {
    return failure("MISSING_EVIDENCE", "search.ground requires at least one evidence item", "input");
  }

  if (evidence.length > MAX_EVIDENCE_ITEMS) {
    return failure("INVALID_EVIDENCE", "search.ground accepts at most 50 evidence items in the first round", "resource");
  }

  const ledger: Array<SearchGroundPlan["evidenceLedger"][number]> = [];
  for (const [index, item] of evidence.entries()) {
    const url = normalizeEvidenceUrl(item.url);
    if (url !== undefined && typeof url !== "string") {
      return url;
    }

    const excerpt = item.excerpt?.trim();
    const title = item.title?.trim();
    if (url === undefined && isBlank(excerpt) && isBlank(title)) {
      return failure(
        "INVALID_EVIDENCE",
        "search.ground evidence must include a url, title, or excerpt",
        "input",
      );
    }

    ledger.push({
      id: item.id?.trim() || `evidence-${index + 1}`,
      url,
      title: title || undefined,
      excerptPreview: excerpt === undefined ? undefined : excerpt.slice(0, MAX_EXCERPT_PREVIEW),
      observedAt: item.observedAt?.trim() || undefined,
    });
  }

  return ledger;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | SearchGroundResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `search.ground scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planSearchGround(request: SearchGroundRequest = {}): SearchGroundResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "search.ground requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_GROUNDING_NOT_ALLOWED",
      "first-round search.ground only creates a dry-run factual grounding plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "search.ground was rejected by runtime governance",
      "governance",
    );
  }

  const claim = request.claim?.trim();
  if (isBlank(claim)) {
    return failure("MISSING_CLAIM", "search.ground requires a claim to anchor", "input");
  }

  const evidenceLedger = normalizeEvidence(request.evidence);
  if ("ok" in evidenceLedger) {
    return evidenceLedger;
  }

  const minimumEvidenceCount = request.minimumEvidenceCount ?? 1;
  if (
    !Number.isInteger(minimumEvidenceCount) ||
    minimumEvidenceCount <= 0 ||
    minimumEvidenceCount > evidenceLedger.length
  ) {
    return failure(
      "INVALID_MINIMUM_EVIDENCE_COUNT",
      "search.ground minimumEvidenceCount must be between 1 and the evidence count",
      "resource",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const invocationId = request.context?.invocationId?.trim() || `${runtimeId}:search.ground`;

  return {
    ok: true,
    plan: {
      toolId: "search.ground",
      capability: "ground-factual-claim",
      runtimeId: runtimeId ?? "",
      invocationId,
      claim: claim ?? "",
      mode: request.mode ?? searchGroundDescriptor.defaultMode,
      minimumEvidenceCount,
      evidenceLedger,
      requiredPermissions: ["search:read", "grounding:audit"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldCompareEvidence: true,
      unsafeSideEffects: false,
      acceptedScopes,
      outputEnvelope: {
        status: "requires-review",
        grounded: false,
        confidence: "not-evaluated",
      },
      audit: {
        guard: "search-grounding-approval",
        event: "basicTool.search.ground.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.search.ground.planned"],
  };
}
