/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptive Capability Selector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptiveRuntimeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type AdaptiveRuntimeCaller = {
  kind: AdaptiveRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type AdaptiveRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptiveCapabilityKind =
  | "agent"
  | "tool"
  | "model"
  | "interface"
  | "runtime-surface"
  | (string & {});

export type AdaptiveCapabilitySelectorBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "capability"
  | "scope";

export type AdaptiveCapabilitySelectorErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CAPABILITIES"
  | "MISSING_CAPABILITY_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "NO_AVAILABLE_CAPABILITY";

export type AdaptiveCapabilitySelectorError = {
  code: AdaptiveCapabilitySelectorErrorCode;
  message: string;
  boundary: AdaptiveCapabilitySelectorBoundary;
  publicSafe: true;
};

export type AdaptiveCapabilityCandidateInput = {
  capabilityId?: string;
  kind?: AdaptiveCapabilityKind;
  ready?: boolean;
  healthScore?: number;
  latencyMs?: number;
  priority?: number;
  scopes?: readonly string[];
  signals?: Readonly<Record<string, number>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptiveCapabilitySelectorRequest = {
  runtimeId?: string;
  caller?: AdaptiveRuntimeCaller;
  candidates?: readonly AdaptiveCapabilityCandidateInput[];
  desiredKind?: AdaptiveCapabilityKind;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptiveRuntimeGate;
  governance?: AdaptiveRuntimeGate;
};

export type AdaptiveCapabilityCandidate = {
  capabilityId: string;
  kind?: AdaptiveCapabilityKind;
  ready: true;
  healthScore: number;
  latencyMs?: number;
  priority: number;
  scopes: readonly string[];
  signals: Readonly<Record<string, number>>;
  metadata: Readonly<Record<string, unknown>>;
  score: number;
};

export type AdaptiveCapabilitySelection = {
  selectionId: string;
  runtimeId: string;
  caller: AdaptiveRuntimeCaller;
  route: "runtime.adaptiveRuntime.adaptiveCapabilitySelector";
  selected: AdaptiveCapabilityCandidate;
  candidateIds: readonly string[];
  rejectedCandidateIds: readonly string[];
  requiredScopes: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type AdaptiveCapabilitySelectorResult =
  | {
      ok: true;
      selection: AdaptiveCapabilitySelection;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptiveCapabilitySelectorError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: AdaptiveRuntimeCaller): AdaptiveRuntimeCaller {
  const normalized: AdaptiveRuntimeCaller = {
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
  code: AdaptiveCapabilitySelectorErrorCode,
  message: string,
  boundary: AdaptiveCapabilitySelectorBoundary,
): AdaptiveCapabilitySelectorResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.adaptiveRuntime.adaptiveCapabilitySelector.rejected"],
  };
}

function scoreCapability(candidate: AdaptiveCapabilityCandidateInput): number {
  const priority = Number.isFinite(candidate.priority) ? Number(candidate.priority) : 0;
  const healthScore = Number.isFinite(candidate.healthScore) ? Number(candidate.healthScore) : 1;
  const latencyPenalty = Number.isFinite(candidate.latencyMs) ? Math.max(Number(candidate.latencyMs), 0) / 1000 : 0;
  const signalBoost = Object.values(candidate.signals ?? {}).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0),
    0,
  );

  return priority + healthScore + signalBoost - latencyPenalty;
}

function normalizeCandidate(
  candidate: AdaptiveCapabilityCandidateInput,
): AdaptiveCapabilityCandidate | AdaptiveCapabilitySelectorResult {
  if (!hasText(candidate.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "adaptive capability selector requires every candidate to have an id", "capability");
  }

  const normalized: AdaptiveCapabilityCandidate = {
    capabilityId: candidate.capabilityId.trim(),
    ready: true,
    healthScore: Number.isFinite(candidate.healthScore) ? Number(candidate.healthScore) : 1,
    priority: Number.isFinite(candidate.priority) ? Number(candidate.priority) : 0,
    scopes: cleanList(candidate.scopes),
    signals: candidate.signals ?? {},
    metadata: candidate.metadata ?? {},
    score: scoreCapability(candidate),
  };

  const kind = candidate.kind?.trim();
  if (kind !== undefined && kind.length > 0) {
    normalized.kind = kind;
  }

  if (Number.isFinite(candidate.latencyMs)) {
    normalized.latencyMs = Math.max(Number(candidate.latencyMs), 0);
  }

  return normalized;
}

export function selectAdaptiveCapability(
  request?: AdaptiveCapabilitySelectorRequest,
): AdaptiveCapabilitySelectorResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptive capability selector requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptive capability selector requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "adaptive capability selection can only run through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptive capability selection was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptive capability selection was rejected by governance",
      "governance",
    );
  }

  if ((request.candidates ?? []).length === 0) {
    return failure("MISSING_CAPABILITIES", "adaptive capability selector requires at least one candidate", "input");
  }

  const requiredScopes = cleanList(request.requiredScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const deniedRequiredScopes =
    allowedScopes.length === 0 ? [] : requiredScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedRequiredScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `adaptive capability selector requires scopes outside governance: ${deniedRequiredScopes.join(", ")}`,
      "scope",
    );
  }

  const desiredKind = request.desiredKind?.trim();
  const accepted: AdaptiveCapabilityCandidate[] = [];
  const rejectedCandidateIds: string[] = [];

  for (const candidate of request.candidates ?? []) {
    const normalized = normalizeCandidate(candidate);
    if ("ok" in normalized) {
      return normalized;
    }

    const candidateId = normalized.capabilityId;
    const deniedCandidateScopes =
      allowedScopes.length === 0 ? [] : normalized.scopes.filter((scope) => !allowedScopes.includes(scope));
    if (deniedCandidateScopes.length > 0) {
      return failure(
        "SCOPE_DENIED",
        `adaptive capability selector includes candidate scopes outside governance: ${deniedCandidateScopes.join(", ")}`,
        "scope",
      );
    }

    const kindMatches = desiredKind === undefined || desiredKind.length === 0 || normalized.kind === desiredKind;
    const scopeMatches = requiredScopes.every((scope) => normalized.scopes.includes(scope));
    const ready = candidate.ready !== false;

    if (kindMatches && scopeMatches && ready) {
      accepted.push(normalized);
    } else {
      rejectedCandidateIds.push(candidateId);
    }
  }

  if (accepted.length === 0) {
    return failure(
      "NO_AVAILABLE_CAPABILITY",
      "adaptive capability selector could not find a ready candidate within kind and scope constraints",
      "capability",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const selected = [...accepted].sort((left, right) => right.score - left.score || left.capabilityId.localeCompare(right.capabilityId))[0];

  return {
    ok: true,
    selection: {
      selectionId: `${runtimeId}:adaptiveCapability:${selected.capabilityId}`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptiveCapabilitySelector",
      selected,
      candidateIds: accepted.map((candidate) => candidate.capabilityId),
      rejectedCandidateIds,
      requiredScopes,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.adaptiveRuntime.adaptiveCapabilitySelector.selected"],
  };
}
