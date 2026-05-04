/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Definer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROMPT_PACK_INTERNAL_MATERIAL_KINDS = [
  "system",
  "user",
  "tool",
  "command",
  "cmp",
  "memory",
  "file",
  "retrieval",
  "event",
  "runtime",
] as const;

export type PromptPackInternalMaterialKind = (typeof PROMPT_PACK_INTERNAL_MATERIAL_KINDS)[number];

export type PromptPackMaterialKind = PromptPackInternalMaterialKind | "tool-summary" | "command-injection";
export type PromptPackMaterialSourceCategory = "declared-built-in" | "process-product" | "user-request";

export const BASIC_CORE_PROMPT_MATERIAL_ID = "praxis:basic-core-prompt" as const;
export const BASIC_CORE_PROMPT_SOURCE = "runtime.basicCorePrompt" as const;

export const PROMPT_PACK_TOOL_MATERIAL_TYPES = [
  "policy",
  "declaration",
  "result",
  "call-state",
] as const;

export type PromptPackToolMaterialType = (typeof PROMPT_PACK_TOOL_MATERIAL_TYPES)[number];

export type PromptPackBoundary = "input" | "contract" | "governance" | "scope" | "budget" | "material" | "injection";

export type PromptPackErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "EMPTY_MATERIALS"
  | "EMPTY_MATERIAL_TEXT"
  | "MISSING_OPERATION"
  | "MISSING_TARGET_PROVIDER"
  | "MATERIAL_NOT_FOUND"
  | "PROTECTED_MATERIAL"
  | "INVALID_BUDGET"
  | "BUDGET_EXCEEDED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "UNTRUSTED_INJECTION";

export type PromptPackGate = {
  accepted: boolean;
  reason?: string;
};

export type PromptPackBudget = {
  maxMaterials?: number;
  maxEstimatedTokens?: number;
  maxMaterialCharacters?: number;
};

export type PromptPackMaterialDraft = {
  id?: string;
  kind: PromptPackMaterialKind;
  text: string;
  source?: string;
  sourceCategory?: PromptPackMaterialSourceCategory;
  priority?: number;
  estimatedTokens?: number;
  trusted?: boolean;
  scope?: string;
  metadata?: Readonly<Record<string, string | number | boolean | object>>;
};

export type DefinedPromptMaterial = {
  id: string;
  kind: PromptPackMaterialKind;
  text: string;
  source: string;
  sourceCategory: PromptPackMaterialSourceCategory;
  priority: number;
  estimatedTokens: number;
  trusted: boolean;
  scope?: string;
  metadata: Readonly<Record<string, string | number | boolean | object>>;
};

export type PromptPackDefinitionRequest = {
  runtimeId?: string;
  sessionId?: string;
  targetModel?: string;
  loweringHint?: string;
  materials?: readonly PromptPackMaterialDraft[];
  includeBasicCorePrompt?: boolean;
  basicCorePromptText?: string;
  budget?: PromptPackBudget;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: PromptPackGate;
  governance?: PromptPackGate;
};

export type PromptPackError = {
  code: PromptPackErrorCode;
  message: string;
  boundary: PromptPackBoundary;
  safeForRuntimeInspection: true;
};

export type PromptPackDefinition = {
  kind: "prompt-pack-definition";
  runtimeId: string;
  sessionId: string;
  targetModel?: string;
  loweringHint?: string;
  materials: readonly DefinedPromptMaterial[];
  materialKinds: readonly PromptPackMaterialKind[];
  materialSourceCategories: readonly PromptPackMaterialSourceCategory[];
  basicCorePromptMaterialId: typeof BASIC_CORE_PROMPT_MATERIAL_ID;
  budget: PromptPackBudget;
  requestedScopes: readonly string[];
  providerPayloadCreated: false;
  governanceRequired: true;
  unsafeSideEffects: false;
};

export type PromptPackDefinitionResult =
  | {
      ok: true;
      definition: PromptPackDefinition;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackError;
      events: readonly string[];
    };

export const promptPackDefinerDescriptor = {
  capability: "prompt-definer",
  route: "agent_executionEngine.promptPack",
  purpose: "define Praxis internal PromptPack constructs and the protected basic core prompt head",
  internalMaterialKinds: PROMPT_PACK_INTERNAL_MATERIAL_KINDS,
  sourceCategories: ["declared-built-in", "process-product", "user-request"],
  basicCorePromptMaterialId: BASIC_CORE_PROMPT_MATERIAL_ID,
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function promptPackFailure(
  code: PromptPackErrorCode,
  message: string,
  boundary: PromptPackBoundary,
): PromptPackDefinitionResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptPack.definition.rejected"],
  };
}

function hasInvalidBudget(budget: PromptPackBudget | undefined): boolean {
  return [budget?.maxMaterials, budget?.maxEstimatedTokens, budget?.maxMaterialCharacters].some(
    (value) => value !== undefined && (!Number.isInteger(value) || value <= 0),
  );
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): PromptPackDefinitionResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return promptPackFailure("SCOPE_DENIED", `PromptPack scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

export function inferPromptMaterialSourceCategory(
  material: Pick<PromptPackMaterialDraft, "kind" | "source" | "sourceCategory">,
): PromptPackMaterialSourceCategory {
  if (material.sourceCategory !== undefined) {
    return material.sourceCategory;
  }

  if (material.kind === "user" || material.source?.trim() === "user") {
    return "user-request";
  }

  if (
    material.kind === "event" ||
    material.kind === "runtime" ||
    material.kind === "tool-summary" ||
    material.kind === "command-injection" ||
    material.source?.startsWith("observation.")
  ) {
    return "process-product";
  }

  return "declared-built-in";
}

export function estimatePromptTokens(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function detectPromptInjectionRisk(text: string): boolean {
  return /\b(ignore (previous|all)|reveal (the )?(system|developer) prompt|override system|bypass governance)\b/i.test(text);
}

function loadBasicCorePromptFromDisk(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  try {
    const text = readFileSync(join(currentDir, "basicCorePrompt.md"), "utf8").trim();
    if (text.length > 0) {
      return text;
    }
  } catch {
    // Fall through to the embedded minimum so a missing asset does not create an empty root contract.
  }

  return "You are Praxis agentCore. Keep runtime governance, PromptPack boundaries, and provider-neutral semantics intact.";
}

export function createBasicCorePromptMaterial(textOverride?: string): PromptPackMaterialDraft {
  const text = textOverride?.trim() || loadBasicCorePromptFromDisk();
  return {
    id: BASIC_CORE_PROMPT_MATERIAL_ID,
    kind: "system",
    text,
    source: BASIC_CORE_PROMPT_SOURCE,
    sourceCategory: "declared-built-in",
    priority: 1000,
    trusted: true,
    scope: "runtime.core",
    metadata: {
      protected: true,
      coreHead: true,
      promptPackHead: true,
    },
  };
}

function hasBasicCorePromptMaterial(materials: readonly PromptPackMaterialDraft[]): boolean {
  return materials.some((material) => material.id?.trim() === BASIC_CORE_PROMPT_MATERIAL_ID);
}

export function definePromptPack(request?: PromptPackDefinitionRequest): PromptPackDefinitionResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return promptPackFailure("MISSING_RUNTIME_ID", "runtimeId is required before defining a PromptPack", "input");
  }

  if (isBlank(request.sessionId)) {
    return promptPackFailure("MISSING_SESSION_ID", "sessionId is required before defining a PromptPack", "input");
  }

  if (request.runtimeReady === false) {
    return promptPackFailure("RUNTIME_NOT_READY", "PromptPack can only be defined for a ready runtime", "input");
  }

  if (request.contract?.accepted === false) {
    return promptPackFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "PromptPack definition was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return promptPackFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "PromptPack definition was rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  if (hasInvalidBudget(request.budget)) {
    return promptPackFailure("INVALID_BUDGET", "PromptPack budget values must be positive integers", "budget");
  }

  const inputMaterials = request.materials ?? [];
  const includeBasicCorePrompt = request.includeBasicCorePrompt !== false;
  const materials =
    includeBasicCorePrompt && !hasBasicCorePromptMaterial(inputMaterials)
      ? [createBasicCorePromptMaterial(request.basicCorePromptText), ...inputMaterials]
      : inputMaterials;
  if (materials.length === 0) {
    return promptPackFailure("EMPTY_MATERIALS", "PromptPack definition requires at least one material", "material");
  }

  if (request.budget?.maxMaterials !== undefined && materials.length > request.budget.maxMaterials) {
    return promptPackFailure(
      "BUDGET_EXCEEDED",
      `PromptPack definition received ${materials.length} materials but maxMaterials is ${request.budget.maxMaterials}`,
      "budget",
    );
  }

  const definedMaterials: DefinedPromptMaterial[] = [];
  let totalEstimatedTokens = 0;

  for (const [index, material] of materials.entries()) {
    const text = material.text.trim();
    if (text.length === 0) {
      return promptPackFailure(
        "EMPTY_MATERIAL_TEXT",
        `PromptPack material ${material.id ?? index} must contain text`,
        "material",
      );
    }

    const estimatedTokens = material.estimatedTokens ?? estimatePromptTokens(text);
    totalEstimatedTokens += estimatedTokens;
    definedMaterials.push({
      id: material.id?.trim() || `material:${index + 1}`,
      kind: material.kind,
      text,
      source: material.source?.trim() || "runtime",
      sourceCategory: inferPromptMaterialSourceCategory(material),
      priority: material.priority ?? 0,
      estimatedTokens,
      trusted: material.trusted === true,
      scope: material.scope?.trim() || undefined,
      metadata: material.metadata ?? {},
    });
  }

  if (
    request.budget?.maxEstimatedTokens !== undefined &&
    totalEstimatedTokens > request.budget.maxEstimatedTokens
  ) {
    return promptPackFailure(
      "BUDGET_EXCEEDED",
      `PromptPack definition estimates ${totalEstimatedTokens} tokens but maxEstimatedTokens is ${request.budget.maxEstimatedTokens}`,
      "budget",
    );
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";

  return {
    ok: true,
    definition: {
      kind: "prompt-pack-definition",
      runtimeId,
      sessionId,
      targetModel: request.targetModel?.trim() || undefined,
      loweringHint: request.loweringHint?.trim() || undefined,
      materials: definedMaterials,
      materialKinds: [...new Set(definedMaterials.map((material) => material.kind))],
      materialSourceCategories: [...new Set(definedMaterials.map((material) => material.sourceCategory))],
      basicCorePromptMaterialId: BASIC_CORE_PROMPT_MATERIAL_ID,
      budget: request.budget ?? {},
      requestedScopes: cleanList(request.requestedScopes),
      providerPayloadCreated: false,
      governanceRequired: true,
      unsafeSideEffects: false,
    },
    events: ["promptPack.definition.accepted"],
  };
}
