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

export type SearchGroundProvider = "openai" | "anthropic" | "deepmind" | "generic";
export type SearchGroundMode = "strict" | "balanced" | "exploratory";
export type SearchGroundCitationMode = "required" | "preferred" | "off";
export type SearchGroundPermission = "search:read" | "grounding:audit";
export type SearchGroundBoundary = "input" | "scope" | "permission" | "resource" | "governance" | "provider";
export type SearchGroundStatus = "grounded" | "partially-grounded" | "unsupported";
export type SearchGroundConfidence = "high" | "medium" | "low" | "not-evaluated";

export type SearchGroundGate = { accepted?: boolean; allowed?: boolean; reason?: string };

export type SearchGroundEvidence = {
  id?: string;
  url?: string;
  title?: string;
  excerpt?: string;
  observedAt?: string;
};

export type SearchGroundContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SearchGroundGate;
  grantedPermissions?: readonly SearchGroundPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchGroundTarget = {
  claim: string;
  evidence: readonly SearchGroundEvidence[];
  mode: SearchGroundMode;
  minimumEvidenceCount: number;
  provider?: SearchGroundProvider;
  model?: string;
  citations: SearchGroundCitationMode;
};

export type SearchGroundCitation = {
  url: string;
  title?: string;
  snippet?: string;
  providerReference?: string;
  raw?: unknown;
};

export type SearchGroundSource = {
  title?: string;
  url: string;
  snippet?: string;
  kind?: "search_result" | "citation" | "provider_native";
  raw?: unknown;
};

export type SearchGroundExecution = {
  answer?: string;
  grounded: boolean;
  status: SearchGroundStatus;
  confidence: SearchGroundConfidence;
  citations: readonly SearchGroundCitation[];
  sources: readonly SearchGroundSource[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type SearchGroundExecutor = (request: {
  claim: string;
  evidence: readonly SearchGroundEvidence[];
  mode?: SearchGroundMode;
  minimumEvidenceCount?: number;
  provider?: SearchGroundProvider;
  model?: string;
  citations?: SearchGroundCitationMode;
  context?: SearchGroundContext;
}) => SearchGroundExecution | Promise<SearchGroundExecution>;

export type SearchGroundRequest = {
  target?: Partial<SearchGroundTarget>;
  context?: SearchGroundContext;
  executor?: SearchGroundExecutor;
  provider?: SearchGroundExecutor;
  metadata?: Readonly<Record<string, unknown>>;
  claim?: string;
  evidence?: readonly SearchGroundEvidence[];
  mode?: SearchGroundMode;
  minimumEvidenceCount?: number;
};

export type SearchGroundErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_CLAIM"
  | "MISSING_EVIDENCE"
  | "INVALID_EVIDENCE"
  | "INVALID_EVIDENCE_URL"
  | "INVALID_MODE"
  | "INVALID_MINIMUM_EVIDENCE_COUNT"
  | "INVALID_PROVIDER"
  | "INVALID_MODEL"
  | "INVALID_CITATIONS"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESULT_INVALID";

export type SearchGroundError = {
  code: SearchGroundErrorCode;
  message: string;
  boundary: SearchGroundBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type SearchGroundAuditEvent = {
  type: string;
  toolId: "search.ground";
  invocationId: string;
  dryRun: boolean;
  provider?: SearchGroundProvider;
  metadata: Readonly<Record<string, unknown>>;
};

export type SearchGroundOutput = {
  kind: "agentCore.basicTool.search.ground";
  target: SearchGroundTarget;
  requestPreview: SearchGroundTarget;
  dispatch: "dry-run" | "runtime-ground";
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SearchGroundPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    claim: string;
    answer?: string;
    grounded: boolean;
    status: SearchGroundStatus | "requires-review";
    confidence: SearchGroundConfidence;
    citations: readonly SearchGroundCitation[];
    sources: readonly SearchGroundSource[];
    evidenceLedger: readonly SearchGroundEvidence[];
    providerMetadata?: Readonly<Record<string, unknown>>;
    raw?: unknown;
  };
};

export type SearchGroundResult =
  | { ok: true; toolId: "search.ground"; output: SearchGroundOutput; audit: readonly SearchGroundAuditEvent[]; events: readonly string[] }
  | { ok: false; toolId: "search.ground"; error: SearchGroundError; audit: readonly SearchGroundAuditEvent[]; events: readonly string[] };

export const searchGroundDescriptor = {
  toolId: "search.ground",
  capability: "ground-factual-claim",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  defaultMode: "balanced",
  permissionsRequired: ["search:read", "grounding:audit"],
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

const modes = ["strict", "balanced", "exploratory"] as const;
const providers = ["openai", "anthropic", "deepmind", "generic"] as const;
const citationModes = ["required", "preferred", "off"] as const;
const maxEvidenceItems = 50;
const maxExcerptPreview = 240;

type NormalizedRequest = {
  target: SearchGroundTarget;
  context: SearchGroundContext;
  executor?: SearchGroundExecutor;
  metadata: Readonly<Record<string, unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function dryRunEnabled(context: SearchGroundContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SearchGroundContext | undefined): string {
  return context?.invocationId?.trim() || "search.ground:dry-run";
}

function isMode(value: unknown): value is SearchGroundMode {
  return modes.includes(value as SearchGroundMode);
}

function isProvider(value: unknown): value is SearchGroundProvider {
  return providers.includes(value as SearchGroundProvider);
}

function isCitationMode(value: unknown): value is SearchGroundCitationMode {
  return citationModes.includes(value as SearchGroundCitationMode);
}

function auditEvent(type: string, context: SearchGroundContext | undefined, provider?: SearchGroundProvider, metadata?: Readonly<Record<string, unknown>>): SearchGroundAuditEvent {
  return {
    type,
    toolId: searchGroundDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    provider,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(code: SearchGroundErrorCode, message: string, boundary: SearchGroundBoundary, context?: SearchGroundContext, provider?: SearchGroundProvider): SearchGroundResult {
  return {
    ok: false,
    toolId: searchGroundDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.search.ground.rejected", context, provider, { code })],
    events: ["basicTool.search.ground.rejected"],
  };
}

function cleanStringList(value: unknown, message: string): readonly string[] | SearchGroundResult {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure("INVALID_CONTEXT", message, "input");
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.includes("\0")) return failure("INVALID_CONTEXT", message, "input");
    const trimmed = item.trim();
    if (trimmed.length > 0) normalized.push(trimmed);
  }
  return [...new Set(normalized)];
}

function normalizeContext(value: unknown): SearchGroundContext | SearchGroundResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "search.ground context must be an object when provided", "input");
  let guard: SearchGroundGate | undefined;
  if (value.guard !== undefined) {
    if (!isRecord(value.guard)) return failure("INVALID_CONTEXT", "search.ground context.guard must be an object when provided", "input");
    const reason = stringValue(value.guard.reason);
    guard = { accepted: booleanValue(value.guard.accepted), allowed: booleanValue(value.guard.allowed), ...(reason !== undefined ? { reason } : {}) };
  }
  const permissions = cleanStringList(value.grantedPermissions, "search.ground context.grantedPermissions must be a string array");
  if ("ok" in permissions) return permissions;
  const auditMetadata = isRecord(value.auditMetadata) ? value.auditMetadata : undefined;
  if (value.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "search.ground context.auditMetadata must be an object when provided", "input");
  }
  const runtimeId = stringValue(value.runtimeId);
  const sessionId = stringValue(value.sessionId);
  const invocation = stringValue(value.invocationId);
  const dryRun = booleanValue(value.dryRun);
  if (
    (value.runtimeId !== undefined && runtimeId === undefined) ||
    (value.sessionId !== undefined && sessionId === undefined) ||
    (value.invocationId !== undefined && invocation === undefined) ||
    (value.dryRun !== undefined && dryRun === undefined)
  ) {
    return failure("INVALID_CONTEXT", "search.ground context has invalid scalar fields", "input");
  }
  return {
    ...(runtimeId !== undefined ? { runtimeId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(invocation !== undefined ? { invocationId: invocation } : {}),
    ...(dryRun !== undefined ? { dryRun } : {}),
    ...(guard !== undefined ? { guard } : {}),
    grantedPermissions: permissions as readonly SearchGroundPermission[],
    ...(auditMetadata !== undefined ? { auditMetadata } : {}),
  };
}

function normalizeEvidenceUrl(value: unknown, context: SearchGroundContext, provider?: SearchGroundProvider): string | SearchGroundResult | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must be a string", "input", context, provider);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must be a safe URL string", "input", context, provider);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must be absolute when provided", "input", context, provider);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure("INVALID_EVIDENCE_URL", "search.ground evidence url must use http or https", "scope", context, provider);
  }
  return parsed.toString();
}

function normalizeEvidence(value: unknown, context: SearchGroundContext, provider?: SearchGroundProvider): readonly SearchGroundEvidence[] | SearchGroundResult {
  if (!Array.isArray(value) || value.length === 0) return failure("MISSING_EVIDENCE", "search.ground requires at least one evidence item", "input", context, provider);
  if (value.length > maxEvidenceItems) return failure("INVALID_EVIDENCE", "search.ground accepts at most 50 evidence items", "resource", context, provider);
  const ledger: SearchGroundEvidence[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return failure("INVALID_EVIDENCE", "search.ground evidence items must be objects", "input", context, provider);
    const url = normalizeEvidenceUrl(item.url, context, provider);
    if (url !== undefined && typeof url !== "string") return url;
    const id = stringValue(item.id)?.trim() || `evidence-${index + 1}`;
    const title = stringValue(item.title)?.trim();
    const excerpt = stringValue(item.excerpt)?.trim();
    const observedAt = stringValue(item.observedAt)?.trim();
    if (url === undefined && (title === undefined || title.length === 0) && (excerpt === undefined || excerpt.length === 0)) {
      return failure("INVALID_EVIDENCE", "search.ground evidence must include a url, title, or excerpt", "input", context, provider);
    }
    ledger.push({
      id,
      ...(url !== undefined ? { url } : {}),
      ...(title !== undefined && title.length > 0 ? { title } : {}),
      ...(excerpt !== undefined && excerpt.length > 0 ? { excerpt: excerpt.slice(0, maxExcerptPreview) } : {}),
      ...(observedAt !== undefined && observedAt.length > 0 ? { observedAt } : {}),
    });
  }
  return ledger;
}

function normalizeTarget(value: unknown, request: Record<string, unknown>, context: SearchGroundContext): SearchGroundTarget | SearchGroundResult {
  if (value !== undefined && !isRecord(value)) return failure("INVALID_REQUEST", "search.ground target must be an object when provided", "input", context);
  const target = isRecord(value) ? value : {};
  const rawProvider = target.provider === undefined ? undefined : stringValue(target.provider)?.trim();
  if (target.provider !== undefined && (rawProvider === undefined || !isProvider(rawProvider))) return failure("INVALID_PROVIDER", "search.ground provider must be openai, anthropic, deepmind, or generic", "input", context);
  const provider = rawProvider as SearchGroundProvider | undefined;
  const rawClaim = target.claim ?? request.claim;
  if (typeof rawClaim !== "string") return failure("MISSING_CLAIM", "search.ground requires target.claim", "input", context, provider);
  const claim = rawClaim.trim();
  if (claim.length === 0 || claim.includes("\0")) return failure("MISSING_CLAIM", "search.ground requires a non-empty safe target.claim", "input", context, provider);
  const evidence = normalizeEvidence(target.evidence ?? request.evidence, context, provider);
  if ("ok" in evidence) return evidence;
  const rawMode = stringValue(target.mode ?? request.mode)?.trim() || searchGroundDescriptor.defaultMode;
  if (!isMode(rawMode)) return failure("INVALID_MODE", "search.ground mode must be strict, balanced, or exploratory", "input", context, provider);
  const minimumEvidenceCount = target.minimumEvidenceCount ?? request.minimumEvidenceCount ?? 1;
  if (typeof minimumEvidenceCount !== "number" || !Number.isInteger(minimumEvidenceCount) || minimumEvidenceCount <= 0 || minimumEvidenceCount > evidence.length) {
    return failure("INVALID_MINIMUM_EVIDENCE_COUNT", "search.ground minimumEvidenceCount must be between 1 and the evidence count", "resource", context, provider);
  }
  const model = target.model === undefined ? undefined : stringValue(target.model)?.trim();
  if (target.model !== undefined && (model === undefined || model.length === 0 || model.includes("\0"))) return failure("INVALID_MODEL", "search.ground model must be a non-empty string when provided", "input", context, provider);
  const citations = target.citations === undefined ? "required" : stringValue(target.citations)?.trim();
  if (citations === undefined || !isCitationMode(citations)) return failure("INVALID_CITATIONS", "search.ground citations must be required, preferred, or off", "input", context, provider);
  return { claim, evidence, mode: rawMode, minimumEvidenceCount, ...(provider !== undefined ? { provider } : {}), ...(model !== undefined ? { model } : {}), citations };
}

function normalizeRequest(request: unknown): NormalizedRequest | SearchGroundResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "search.ground request must be an object", "input");
  const context = normalizeContext(request.context);
  if ("ok" in context) return context;
  const target = normalizeTarget(request.target, request, context);
  if ("ok" in target) return target;
  const metadata = request.metadata;
  if (metadata !== undefined && !isRecord(metadata)) return failure("INVALID_REQUEST", "search.ground metadata must be an object when provided", "input", context, target.provider);
  const executor = request.executor ?? request.provider;
  if (executor !== undefined && typeof executor !== "function") return failure("INVALID_REQUEST", "search.ground executor must be a function when provided", "input", context, target.provider);
  return { target, context, executor: executor as SearchGroundExecutor | undefined, metadata: metadata ?? {} };
}

function ensurePermissions(target: SearchGroundTarget, context: SearchGroundContext): SearchGroundResult | undefined {
  if (context.grantedPermissions === undefined || context.grantedPermissions.length === 0) {
    return dryRunEnabled(context)
      ? undefined
      : failure("PERMISSION_DENIED", `search.ground is missing permissions: ${searchGroundDescriptor.permissionsRequired.join(", ")}`, "permission", context, target.provider);
  }
  const granted = new Set(context.grantedPermissions);
  const missing = searchGroundDescriptor.permissionsRequired.filter((permission) => !granted.has(permission));
  return missing.length === 0 ? undefined : failure("PERMISSION_DENIED", `search.ground is missing permissions: ${missing.join(", ")}`, "permission", context, target.provider);
}

function ensureGovernance(target: SearchGroundTarget, context: SearchGroundContext): SearchGroundResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure("GOVERNANCE_REJECTED", context.guard?.reason ?? "search.ground real execution requires an affirmative runtime guard", "governance", context, target.provider);
}

function dryRunResult(request: NormalizedRequest): SearchGroundResult {
  return {
    ok: true,
    toolId: searchGroundDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.ground",
      target: request.target,
      requestPreview: request.target,
      dispatch: "dry-run",
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: searchGroundDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        claim: request.target.claim,
        grounded: false,
        status: "requires-review",
        confidence: "not-evaluated",
        citations: [],
        sources: [],
        evidenceLedger: request.target.evidence,
      },
    },
    audit: [auditEvent("agentCore.basicTool.search.ground.dryRun", request.context, request.target.provider, request.metadata)],
    events: ["basicTool.search.ground.dryRun"],
  };
}

function normalizeCitation(citation: SearchGroundCitation): SearchGroundCitation | undefined {
  if (!citation || typeof citation.url !== "string") return undefined;
  const url = citation.url.trim();
  if (url.length === 0) return undefined;
  return { url, ...(typeof citation.title === "string" && citation.title.trim().length > 0 ? { title: citation.title.trim() } : {}), ...(typeof citation.snippet === "string" && citation.snippet.trim().length > 0 ? { snippet: citation.snippet.trim() } : {}), ...(typeof citation.providerReference === "string" && citation.providerReference.trim().length > 0 ? { providerReference: citation.providerReference.trim() } : {}), ...(citation.raw !== undefined ? { raw: citation.raw } : {}) };
}

function normalizeSource(source: SearchGroundSource): SearchGroundSource | undefined {
  if (!source || typeof source.url !== "string") return undefined;
  const url = source.url.trim();
  if (url.length === 0) return undefined;
  return { url, ...(typeof source.title === "string" && source.title.trim().length > 0 ? { title: source.title.trim() } : {}), ...(typeof source.snippet === "string" && source.snippet.trim().length > 0 ? { snippet: source.snippet.trim() } : {}), ...(source.kind !== undefined ? { kind: source.kind } : {}), ...(source.raw !== undefined ? { raw: source.raw } : {}) };
}

function normalizeExecutionOutput(request: NormalizedRequest, execution: SearchGroundExecution): SearchGroundResult {
  if (typeof execution.grounded !== "boolean" || !["grounded", "partially-grounded", "unsupported"].includes(execution.status) || !["high", "medium", "low", "not-evaluated"].includes(execution.confidence) || !Array.isArray(execution.citations) || !Array.isArray(execution.sources)) {
    return failure("PROVIDER_RESULT_INVALID", "search.ground provider returned an invalid result envelope", "provider", request.context, request.target.provider);
  }
  const citations = execution.citations.map(normalizeCitation).filter((citation): citation is SearchGroundCitation => citation !== undefined);
  const sources = execution.sources.map(normalizeSource).filter((source): source is SearchGroundSource => source !== undefined);
  return {
    ok: true,
    toolId: searchGroundDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.ground",
      target: request.target,
      requestPreview: request.target,
      dispatch: "runtime-ground",
      dryRun: false,
      executionBlocked: false,
      permissionsRequired: searchGroundDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        claim: request.target.claim,
        ...(typeof execution.answer === "string" ? { answer: execution.answer } : {}),
        grounded: execution.grounded,
        status: execution.status,
        confidence: execution.confidence,
        citations,
        sources,
        evidenceLedger: request.target.evidence,
        ...(execution.providerMetadata !== undefined ? { providerMetadata: execution.providerMetadata } : {}),
        ...(execution.raw !== undefined ? { raw: execution.raw } : {}),
      },
    },
    audit: [auditEvent("agentCore.basicTool.search.ground.executed", request.context, request.target.provider, { citationCount: citations.length, sourceCount: sources.length, ...request.metadata })],
    events: ["basicTool.search.ground.executed"],
  };
}

export async function planSearchGround(request: SearchGroundRequest = {}): Promise<SearchGroundResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return dryRunResult(normalized);
  if (normalized.executor === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "search.ground real execution requires BaseToolExecutorPort.network.ground or an injected grounding provider", "provider", normalized.context, normalized.target.provider);
  }
  try {
    return normalizeExecutionOutput(
      normalized,
      await normalized.executor({
        claim: normalized.target.claim,
        evidence: normalized.target.evidence,
        mode: normalized.target.mode,
        minimumEvidenceCount: normalized.target.minimumEvidenceCount,
        provider: normalized.target.provider,
        model: normalized.target.model,
        citations: normalized.target.citations,
        context: normalized.context,
      }),
    );
  } catch {
    return failure("PROVIDER_REJECTED", "search.ground provider rejected the request", "provider", normalized.context, normalized.target.provider);
  }
}

export const executeSearchGround = planSearchGround;
