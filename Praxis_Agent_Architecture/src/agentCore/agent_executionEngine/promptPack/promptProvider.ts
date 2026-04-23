/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Provider 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { MappedPromptPack, PromptProviderPayload } from "./promptMapper.js";
import type { PromptPackMaterialKind } from "./promptDefiner.js";

export type PromptProviderMaterialKind =
  | PromptPackMaterialKind;

export type PromptProviderMaterialSourceKind =
  | "runtime"
  | "application"
  | "official-module"
  | "cmp"
  | "memory"
  | "file"
  | "retrieval"
  | "event"
  | "tool";

export type PromptProviderBoundary = "input" | "contract" | "governance" | "scope" | "budget" | "injection";

export type PromptProviderErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "EMPTY_MATERIALS"
  | "EMPTY_MATERIAL_CONTENT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "SOURCE_DENIED"
  | "UNTRUSTED_COMMAND_INJECTION"
  | "PROMPT_BUDGET_EXCEEDED";

export type PromptProviderGate = {
  accepted: boolean;
  reason?: string;
};

export type PromptProviderMaterialSource = {
  kind: PromptProviderMaterialSourceKind;
  ref?: string;
  trusted?: boolean;
};

export type PromptProviderMaterialInput = {
  id?: string;
  kind: PromptProviderMaterialKind;
  content?: string;
  source: PromptProviderMaterialSource;
  priority?: number;
  tokenEstimate?: number;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type PromptProviderBudget = {
  maxEstimatedTokens?: number;
  reservedForLowering?: number;
  maxMaterials?: number;
};

export type PromptProviderRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  mappedPack?: MappedPromptPack;
  materials?: readonly PromptProviderMaterialInput[];
  budget?: PromptProviderBudget;
  allowedSourceKinds?: readonly PromptProviderMaterialSourceKind[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: PromptProviderGate;
  governance?: PromptProviderGate;
};

export type PromptProviderError = {
  code: PromptProviderErrorCode;
  message: string;
  boundary: PromptProviderBoundary;
  safeForRuntimeInspection: true;
};

export type PromptProviderSourceRecord = {
  materialId: string;
  kind: PromptProviderMaterialKind;
  source: PromptProviderMaterialSource;
  trusted: boolean;
};

export type PromptProviderTrimRecord = {
  materialId: string;
  reason: "budget" | "max-materials";
  estimatedTokens: number;
};

export type PromptProviderInjectionRecord = {
  materialId: string;
  accepted: boolean;
  reason: "trusted-command-injection";
};

export type PromptPackProvidedMaterial = {
  id: string;
  kind: PromptProviderMaterialKind;
  content: string;
  source: PromptProviderMaterialSource;
  priority: number;
  estimatedTokens: number;
  metadata: Readonly<Record<string, string | number | boolean>>;
};

export type PromptProviderPack = {
  kind: "prompt-pack-input";
  runtimeId: string;
  sessionId: string;
  invocationId?: string;
  materials: readonly PromptPackProvidedMaterial[];
  sourceRecords: readonly PromptProviderSourceRecord[];
  trimRecords: readonly PromptProviderTrimRecord[];
  injectionRecords: readonly PromptProviderInjectionRecord[];
  budget: {
    maxEstimatedTokens?: number;
    reservedForLowering: number;
    usedEstimatedTokens: number;
  };
  providerPayloadCreated: false;
  promptLoweringRequired: boolean;
  unsafeSideEffects: false;
};

export type PromptProviderUpstreamRequest = {
  kind: "prompt-provider-upstream-request";
  runtimeId: string;
  sessionId: string;
  invocationId?: string;
  payload: PromptProviderPayload;
  providerPayloadCreated: true;
  unsafeSideEffects: false;
};

export type PromptProviderResult =
  | {
      ok: true;
      pack: PromptProviderPack;
      mappedPack?: MappedPromptPack;
      upstreamRequest?: PromptProviderUpstreamRequest;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptProviderError;
      events: readonly string[];
    };

export const promptProviderDescriptor = {
  route: "agent_executionEngine.promptPack.promptProvider",
  purpose: "expose mapped PromptPack provider payloads as the final upstream request boundary",
  providerPayloadCreated: true,
  promptLoweringRequired: false,
  unsafeSideEffects: false,
} as const;

const defaultPriorityByKind: Record<PromptProviderMaterialKind, number> = {
  system: 100,
  user: 90,
  tool: 80,
  command: 80,
  "command-injection": 80,
  "tool-summary": 70,
  cmp: 60,
  memory: 50,
  file: 45,
  retrieval: 40,
  event: 30,
  runtime: 20,
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: PromptProviderErrorCode,
  message: string,
  boundary: PromptProviderBoundary,
): PromptProviderResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptProvider.rejected"],
  };
}

function estimateTokens(content: string, providedEstimate: number | undefined): number {
  if (providedEstimate !== undefined && Number.isFinite(providedEstimate) && providedEstimate > 0) {
    return Math.ceil(providedEstimate);
  }

  return Math.max(1, Math.ceil(content.length / 4));
}

function normalizeMaterial(material: PromptProviderMaterialInput, index: number): PromptPackProvidedMaterial | undefined {
  if (isBlank(material.content)) {
    return undefined;
  }

  const content = material.content?.trim() ?? "";
  const materialId = material.id?.trim() || `${material.kind}:${index + 1}`;

  return {
    id: materialId,
    kind: material.kind,
    content,
    source: {
      kind: material.source.kind,
      ref: material.source.ref?.trim() || undefined,
      trusted: material.source.trusted,
    },
    priority: material.priority ?? defaultPriorityByKind[material.kind],
    estimatedTokens: estimateTokens(content, material.tokenEstimate),
    metadata: material.metadata ?? {},
  };
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): PromptProviderResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return failure("SCOPE_DENIED", `prompt material scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

function guardSourceKinds(
  materials: readonly PromptProviderMaterialInput[],
  allowedSourceKinds: readonly PromptProviderMaterialSourceKind[] | undefined,
): PromptProviderResult | undefined {
  const allowed = new Set(allowedSourceKinds ?? []);
  if (allowed.size === 0) {
    return undefined;
  }

  const denied = materials.find((material) => !allowed.has(material.source.kind));
  if (denied) {
    return failure(
      "SOURCE_DENIED",
      `prompt material source ${denied.source.kind} is outside the allowed PromptPack sources`,
      "governance",
    );
  }

  return undefined;
}

function trimToBudget(
  materials: readonly PromptPackProvidedMaterial[],
  budget: PromptProviderBudget | undefined,
): {
  kept: readonly PromptPackProvidedMaterial[];
  trimRecords: readonly PromptProviderTrimRecord[];
  usedEstimatedTokens: number;
} {
  const reservedForLowering = Math.max(0, budget?.reservedForLowering ?? 0);
  const maxEstimatedTokens =
    budget?.maxEstimatedTokens === undefined ? undefined : Math.max(0, budget.maxEstimatedTokens - reservedForLowering);
  const maxMaterials = budget?.maxMaterials;

  const kept: PromptPackProvidedMaterial[] = [];
  const trimRecords: PromptProviderTrimRecord[] = [];
  let usedEstimatedTokens = 0;

  for (const material of materials) {
    if (maxMaterials !== undefined && kept.length >= maxMaterials) {
      trimRecords.push({ materialId: material.id, reason: "max-materials", estimatedTokens: material.estimatedTokens });
      continue;
    }

    if (maxEstimatedTokens !== undefined && usedEstimatedTokens + material.estimatedTokens > maxEstimatedTokens) {
      trimRecords.push({ materialId: material.id, reason: "budget", estimatedTokens: material.estimatedTokens });
      continue;
    }

    kept.push(material);
    usedEstimatedTokens += material.estimatedTokens;
  }

  return { kept, trimRecords, usedEstimatedTokens };
}

export function providePromptPackInput(request?: PromptProviderRequest): PromptProviderResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before providing PromptPack input", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before providing PromptPack input", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "prompt materials were rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "prompt materials were rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  if (request.mappedPack !== undefined) {
    if (request.mappedPack.runtimeId !== request.runtimeId?.trim()) {
      return failure("CONTRACT_REJECTED", "mapped PromptPack runtimeId does not match provider request", "contract");
    }

    if (request.mappedPack.sessionId !== request.sessionId?.trim()) {
      return failure("CONTRACT_REJECTED", "mapped PromptPack sessionId does not match provider request", "contract");
    }

    const materials: PromptPackProvidedMaterial[] = Object.entries(request.mappedPack.blocks)
      .filter((entry): entry is [keyof MappedPromptPack["blocks"], string] => entry[1].trim().length > 0)
      .map(([kind, content], index) => ({
        id: `mapped:${kind}`,
        kind: kind === "tool" ? "tool" : kind,
        content,
        source: { kind: "runtime", ref: request.mappedPack?.sourcePromptPackId, trusted: true },
        priority: 100 - index,
        estimatedTokens: estimateTokens(content, undefined),
        metadata: { mappedProvider: request.mappedPack?.targetProvider ?? "custom" },
      }));

    const usedEstimatedTokens = materials.reduce((sum, material) => sum + material.estimatedTokens, 0);

    return {
      ok: true,
      pack: {
        kind: "prompt-pack-input",
        runtimeId: request.runtimeId?.trim() ?? "",
        sessionId: request.sessionId?.trim() ?? "",
        invocationId: request.invocationId?.trim() || undefined,
        materials,
        sourceRecords: materials.map((material) => ({
          materialId: material.id,
          kind: material.kind,
          source: material.source,
          trusted: material.source.trusted === true,
        })),
        trimRecords: [],
        injectionRecords: [],
        budget: {
          maxEstimatedTokens: request.budget?.maxEstimatedTokens,
          reservedForLowering: 0,
          usedEstimatedTokens,
        },
        providerPayloadCreated: false,
        promptLoweringRequired: false,
        unsafeSideEffects: false,
      },
      mappedPack: request.mappedPack,
      upstreamRequest: {
        kind: "prompt-provider-upstream-request",
        runtimeId: request.runtimeId?.trim() ?? "",
        sessionId: request.sessionId?.trim() ?? "",
        invocationId: request.invocationId?.trim() || undefined,
        payload: request.mappedPack.providerPayload,
        providerPayloadCreated: true,
        unsafeSideEffects: false,
      },
      events: ["promptProvider.provided"],
    };
  }

  if (request.materials === undefined || request.materials.length === 0) {
    return failure("EMPTY_MATERIALS", "at least one prompt material is required", "input");
  }

  const sourceFailure = guardSourceKinds(request.materials, request.allowedSourceKinds);
  if (sourceFailure) {
    return sourceFailure;
  }

  const normalizedMaterials: PromptPackProvidedMaterial[] = [];
  for (const [index, material] of request.materials.entries()) {
    const normalized = normalizeMaterial(material, index);
    if (normalized === undefined) {
      return failure("EMPTY_MATERIAL_CONTENT", "prompt material content must be non-empty", "input");
    }

    if (normalized.kind === "command-injection" && normalized.source.trusted !== true) {
      return failure(
        "UNTRUSTED_COMMAND_INJECTION",
        "command-injection material must come from a trusted PromptPack source",
        "injection",
      );
    }

    normalizedMaterials.push(normalized);
  }

  const sortedMaterials = normalizedMaterials
    .map((material, index) => ({ material, index }))
    .sort((left, right) => right.material.priority - left.material.priority || left.index - right.index)
    .map(({ material }) => material);

  const { kept, trimRecords, usedEstimatedTokens } = trimToBudget(sortedMaterials, request.budget);

  if (kept.length === 0) {
    return failure("PROMPT_BUDGET_EXCEEDED", "prompt budget removed every material from the PromptPack input", "budget");
  }

  const sourceRecords: PromptProviderSourceRecord[] = kept.map((material) => ({
    materialId: material.id,
    kind: material.kind,
    source: material.source,
    trusted: material.source.trusted === true,
  }));

  const injectionRecords: PromptProviderInjectionRecord[] = kept
    .filter((material) => material.kind === "command-injection")
    .map((material) => ({ materialId: material.id, accepted: true, reason: "trusted-command-injection" }));

  return {
    ok: true,
    pack: {
      kind: "prompt-pack-input",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() ?? "",
      invocationId: request.invocationId?.trim() || undefined,
      materials: kept,
      sourceRecords,
      trimRecords,
      injectionRecords,
      budget: {
        maxEstimatedTokens: request.budget?.maxEstimatedTokens,
        reservedForLowering: Math.max(0, request.budget?.reservedForLowering ?? 0),
        usedEstimatedTokens,
      },
      providerPayloadCreated: false,
      promptLoweringRequired: true,
      unsafeSideEffects: false,
    },
    events: ["promptProvider.provided"],
  };
}
