/*
 * 文件定位：Agent 模型适配层 / 模型抽象层。
 * 核心目的：承载 capability Selection Panel 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CapabilitySelectionBoundary = "input" | "contract" | "governance" | "scope" | "selection";

export type CapabilitySelectionErrorCode =
  | "MISSING_PANEL_ID"
  | "MISSING_INTENT"
  | "EMPTY_CANDIDATES"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_PROVIDER_ID"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "NO_COMPATIBLE_CAPABILITY";

export type CapabilitySelectionGate = {
  accepted: boolean;
  reason?: string;
};

export type CapabilitySelectionIntent = {
  requiredModalities?: readonly string[];
  requiredInterfaces?: readonly string[];
  requiredScopes?: readonly string[];
  preferredProviderId?: string;
  preferredModelId?: string;
  priority?: "quality" | "cost" | "latency" | "stability";
};

export type CapabilitySelectionCandidate = {
  capabilityId?: string;
  providerId?: string;
  modelId?: string;
  modalities?: readonly string[];
  interfaces?: readonly string[];
  scopes?: readonly string[];
  qualityScore?: number;
  costScore?: number;
  latencyScore?: number;
  stabilityScore?: number;
  compatibility?: "compatible" | "partial" | "incompatible";
  gaps?: readonly string[];
};

export type CapabilitySelectionRequest = {
  panelId?: string;
  runtimeId?: string;
  intent?: CapabilitySelectionIntent;
  candidates?: readonly CapabilitySelectionCandidate[];
  allowedScopes?: readonly string[];
  contract?: CapabilitySelectionGate;
  governance?: CapabilitySelectionGate;
};

export type CapabilitySelectionError = {
  code: CapabilitySelectionErrorCode;
  message: string;
  boundary: CapabilitySelectionBoundary;
  safeForRuntimeInspection: true;
  providerRawShapeExposed: false;
};

export type CapabilitySelectionOption = {
  capabilityId: string;
  providerId: string;
  modelId?: string;
  modalities: readonly string[];
  interfaces: readonly string[];
  scopes: readonly string[];
  compatibility: "compatible" | "partial";
  score: number;
  rank: number;
  gaps: readonly string[];
};

export type CapabilitySelectionPanel = {
  kind: "capability-selection-panel";
  panelId: string;
  runtimeId?: string;
  intent: CapabilitySelectionIntent;
  options: readonly CapabilitySelectionOption[];
  selected?: CapabilitySelectionOption;
  bridgeReady: boolean;
  providerRawShapeExposed: false;
  providerCallPlanned: false;
  unsafeSideEffects: false;
};

export type CapabilitySelectionPanelResult =
  | {
      ok: true;
      panel: CapabilitySelectionPanel;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CapabilitySelectionError;
      events: readonly string[];
    };

export const capabilitySelectionPanelDescriptor = {
  capability: "capability-selection-panel",
  route: "agent_modelAdapter.abstractionLayer",
  purpose: "rank abstracted model capabilities for bridging-layer handoff without invoking providers",
  providerRawShapeExposed: false,
  providerCallPlanned: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function uniqueStrings(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CapabilitySelectionErrorCode,
  message: string,
  boundary: CapabilitySelectionBoundary,
): CapabilitySelectionPanelResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, providerRawShapeExposed: false },
    events: ["modelAdapter.capabilitySelectionPanel.rejected"],
  };
}

function hasAll(required: readonly string[], advertised: readonly string[]): boolean {
  if (required.length === 0) {
    return true;
  }

  const advertisedSet = new Set(advertised);
  return required.every((value) => advertisedSet.has(value));
}

function deniedScope(requiredScopes: readonly string[], allowedScopes: readonly string[] | undefined): string | undefined {
  if (requiredScopes.length === 0) {
    return undefined;
  }

  const allowed = new Set(uniqueStrings(allowedScopes));
  return requiredScopes.find((scope) => !allowed.has(scope));
}

function weightedScore(candidate: CapabilitySelectionCandidate, intent: CapabilitySelectionIntent): number {
  const priority = intent.priority ?? "quality";
  const quality = candidate.qualityScore ?? 0;
  const cost = candidate.costScore ?? 0;
  const latency = candidate.latencyScore ?? 0;
  const stability = candidate.stabilityScore ?? 0;
  const compatibilityBonus = candidate.compatibility === "partial" ? 10 : 25;
  const providerBonus = candidate.providerId?.trim() === intent.preferredProviderId?.trim() ? 5 : 0;
  const modelBonus = candidate.modelId?.trim() === intent.preferredModelId?.trim() ? 5 : 0;

  const priorityScores: Record<NonNullable<CapabilitySelectionIntent["priority"]>, number> = {
    quality,
    cost,
    latency,
    stability,
  };

  return priorityScores[priority] * 2 + quality + cost + latency + stability + compatibilityBonus + providerBonus + modelBonus;
}

function normalizeIntent(intent: CapabilitySelectionIntent): CapabilitySelectionIntent {
  return {
    requiredModalities: uniqueStrings(intent.requiredModalities),
    requiredInterfaces: uniqueStrings(intent.requiredInterfaces),
    requiredScopes: uniqueStrings(intent.requiredScopes),
    preferredProviderId: intent.preferredProviderId?.trim() || undefined,
    preferredModelId: intent.preferredModelId?.trim() || undefined,
    priority: intent.priority ?? "quality",
  };
}

export function createCapabilitySelectionPanel(request?: CapabilitySelectionRequest): CapabilitySelectionPanelResult {
  if (request === undefined || isBlank(request.panelId)) {
    return failure("MISSING_PANEL_ID", "capabilitySelectionPanel requires a panelId", "input");
  }

  if (request.intent === undefined) {
    return failure("MISSING_INTENT", "capabilitySelectionPanel requires a DSL selection intent", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "capability selection was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "capability selection was rejected by runtime governance",
      "governance",
    );
  }

  const intent = normalizeIntent(request.intent);
  const requiredScopes = uniqueStrings(intent.requiredScopes);
  const denied = deniedScope(requiredScopes, request.allowedScopes);
  if (denied !== undefined) {
    return failure("SCOPE_DENIED", `capability scope ${denied} is outside runtime governance`, "scope");
  }

  const candidates = request.candidates ?? [];
  if (candidates.length === 0) {
    return failure("EMPTY_CANDIDATES", "capabilitySelectionPanel requires at least one abstracted candidate", "input");
  }

  const options: CapabilitySelectionOption[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const capabilityId = candidate.capabilityId?.trim();
    if (isBlank(capabilityId)) {
      return failure("MISSING_CAPABILITY_ID", `candidate ${index + 1} requires a capabilityId`, "input");
    }

    const providerId = candidate.providerId?.trim();
    if (isBlank(providerId)) {
      return failure("MISSING_PROVIDER_ID", `candidate ${capabilityId} requires a providerId`, "input");
    }

    const modalities = uniqueStrings(candidate.modalities);
    const interfaces = uniqueStrings(candidate.interfaces);
    const scopes = uniqueStrings(candidate.scopes);
    const compatibility = candidate.compatibility ?? "compatible";

    if (
      compatibility !== "incompatible" &&
      hasAll(uniqueStrings(intent.requiredModalities), modalities) &&
      hasAll(uniqueStrings(intent.requiredInterfaces), interfaces) &&
      hasAll(requiredScopes, scopes)
    ) {
      options.push({
        capabilityId: capabilityId ?? "",
        providerId: providerId ?? "",
        modelId: candidate.modelId?.trim() || undefined,
        modalities,
        interfaces,
        scopes,
        compatibility,
        score: weightedScore(candidate, intent),
        rank: 0,
        gaps: uniqueStrings(candidate.gaps),
      });
    }
  }

  if (options.length === 0) {
    return failure("NO_COMPATIBLE_CAPABILITY", "no candidate matched the DSL intent and runtime scope boundary", "selection");
  }

  const ranked = options
    .sort((left, right) => right.score - left.score || left.capabilityId.localeCompare(right.capabilityId))
    .map((option, index) => ({ ...option, rank: index + 1 }));

  return {
    ok: true,
    panel: {
      kind: "capability-selection-panel",
      panelId: request.panelId?.trim() ?? "",
      runtimeId: request.runtimeId?.trim() || undefined,
      intent,
      options: ranked,
      selected: ranked[0],
      bridgeReady: ranked[0] !== undefined,
      providerRawShapeExposed: false,
      providerCallPlanned: false,
      unsafeSideEffects: false,
    },
    events: ["modelAdapter.capabilitySelectionPanel.created"],
  };
}
