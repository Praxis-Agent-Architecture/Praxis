/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Assembler 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { createHash } from "node:crypto";
import {
  BASIC_CORE_PROMPT_MATERIAL_ID,
  PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS,
  PROMPT_PACK_SEGMENT_KINDS,
  detectPromptInjectionRisk,
  type DefinedPromptMaterial,
  type PromptPackBoundary,
  type PromptPackBudget,
  type PromptPackError,
  type PromptPackErrorCode,
  type PromptPackMaterialKind,
  type PromptPackMaterialSourceCategory,
  type PromptPackSegmentKind,
  type PromptPackToolMaterialType,
} from "./promptDefiner.js";

export type PromptAssemblerOrdering = "input-order" | "priority-desc";
export type PromptPackSegmentStability = "static" | "semi-stable" | "dynamic";
export type PromptPackSegmentCachePolicy = "cacheable-prefix" | "cacheable-readonly" | "dynamic-no-cache";

export type PromptPackSegment = {
  segmentId: string;
  segmentKind: PromptPackSegmentKind;
  stability: PromptPackSegmentStability;
  cachePolicy: PromptPackSegmentCachePolicy;
  segmentHash: string;
  estimatedTokens: number;
  materialRefs: readonly string[];
  sourceRefs: readonly string[];
  providerHints: Readonly<Record<string, unknown>>;
};

export type PromptPackCachePlan = {
  kind: "praxis.promptPack.cachePlan";
  format: "praxis.promptPack.cachePlan.v1";
  strategy: "stable-segment-prefix";
  orderedSegmentKinds: readonly PromptPackSegmentKind[];
  providerVisibleSegmentKinds: readonly PromptPackSegmentKind[];
  segments: readonly PromptPackSegment[];
  cacheablePrefixSegmentKinds: readonly PromptPackSegmentKind[];
  dynamicSegmentKinds: readonly PromptPackSegmentKind[];
  cacheUnit: "prompt-pack-section";
  cachePriority: readonly ["context-quality", "cost", "latency"];
  cacheRiskWarnings: readonly string[];
  providerPayloadCreated: false;
};

export type PromptPackCacheTelemetry = {
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheHitRate?: number;
  segmentHashes: Readonly<Record<string, string>>;
  cacheMissReasons: readonly string[];
};

export type PromptAssemblerRequest = {
  runtimeId?: string;
  sessionId?: string;
  targetModel?: string;
  materials?: readonly DefinedPromptMaterial[];
  budget?: PromptPackBudget;
  ordering?: PromptAssemblerOrdering;
  allowUntrustedInjection?: boolean;
};

export type PromptTrimRecord = {
  materialId: string;
  reason: "max-materials" | "max-material-characters" | "max-estimated-tokens";
  originalEstimatedTokens: number;
  keptEstimatedTokens: number;
};

export type PromptInjectionRecord = {
  materialId: string;
  source: string;
  action: "allowed-trusted" | "allowed-untrusted-by-request";
};

export type AssembledPromptMaterial = {
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
  protected: boolean;
  promptSegmentKind: PromptPackSegmentKind;
  internalOnly: boolean;
};

export type AssembledPromptToolDeclaration = {
  materialId: string;
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
};

export type AssembledPromptToolResult = {
  materialId: string;
  callId?: string;
  name?: string;
  content: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type AssembledPromptToolState = {
  materialId: string;
  callId?: string;
  name?: string;
  arguments?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type AssembledPromptToolPack = {
  policies: readonly AssembledPromptMaterial[];
  declarations: readonly AssembledPromptToolDeclaration[];
  results: readonly AssembledPromptToolResult[];
  callStates: readonly AssembledPromptToolState[];
};

export type PromptMaterialSourceRecord = {
  materialId: string;
  source: string;
  sourceCategory: PromptPackMaterialSourceCategory;
  kind: PromptPackMaterialKind;
  trusted: boolean;
};

export type StandardPromptPack = {
  kind: "praxis.promptPack";
  format: "praxis.promptPack.assembled.v1";
  runtimeId: string;
  sessionId: string;
  targetModel?: string;
  basicCorePromptMaterialId: typeof BASIC_CORE_PROMPT_MATERIAL_ID;
  materials: readonly AssembledPromptMaterial[];
  toolPack: AssembledPromptToolPack;
  renderedText: string;
  json: Readonly<{
    materials: readonly AssembledPromptMaterial[];
    toolPack: AssembledPromptToolPack;
  }>;
  sourceRecords: readonly PromptMaterialSourceRecord[];
  materialSourceCategories: readonly PromptPackMaterialSourceCategory[];
  segments: readonly PromptPackSegment[];
  cachePlan: PromptPackCachePlan;
  cacheTelemetry: PromptPackCacheTelemetry;
  trimRecords: readonly PromptTrimRecord[];
  injectionRecords: readonly PromptInjectionRecord[];
  totalEstimatedTokens: number;
  lowering: {
    mapper: "pending";
    providerPayloadCreated: false;
  };
  unsafeSideEffects: false;
};

export type PromptAssemblerResult =
  | {
      ok: true;
      promptPack: StandardPromptPack;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackError;
      events: readonly string[];
    };

export const promptAssemblerDescriptor = {
  capability: "prompt-assembler",
  route: "agent_executionEngine.promptPack",
  purpose: "assemble Praxis internal PromptPack constructs into governed text and JSON pack forms",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(code: PromptPackErrorCode, message: string, boundary: PromptPackBoundary): PromptAssemblerResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptPack.assembly.rejected"],
  };
}

function hasInvalidBudget(budget: PromptPackBudget | undefined): boolean {
  return [budget?.maxMaterials, budget?.maxEstimatedTokens, budget?.maxMaterialCharacters].some(
    (value) => value !== undefined && (!Number.isInteger(value) || value <= 0),
  );
}

function estimateTruncatedTokens(originalTokens: number, originalLength: number, keptLength: number): number {
  if (originalLength === 0) {
    return 0;
  }

  return Math.max(1, Math.min(originalTokens, Math.ceil((originalTokens * keptLength) / originalLength)));
}

function isProtectedMaterial(material: DefinedPromptMaterial): boolean {
  return material.id === BASIC_CORE_PROMPT_MATERIAL_ID || material.metadata.protected === true;
}

function toAssembledMaterial(material: DefinedPromptMaterial): AssembledPromptMaterial {
  return {
    id: material.id,
    kind: material.kind,
    text: material.text,
    source: material.source,
    sourceCategory: material.sourceCategory,
    priority: material.priority,
    estimatedTokens: material.estimatedTokens,
    trusted: material.trusted,
    scope: material.scope,
    metadata: material.metadata,
    protected: isProtectedMaterial(material),
    promptSegmentKind: material.promptSegmentKind,
    internalOnly: material.internalOnly,
  };
}

function segmentStability(kind: PromptPackSegmentKind): PromptPackSegmentStability {
  if (
    kind === "stableSystemCore" ||
    kind === "declaredRuntimeContext" ||
    kind === "toolDeclarations" ||
    kind === "projectContext"
  ) {
    return "static";
  }
  if (kind === "sessionSummary" || kind === "memoryContext") {
    return "semi-stable";
  }
  return "dynamic";
}

function segmentCachePolicy(kind: PromptPackSegmentKind): PromptPackSegmentCachePolicy {
  if (
    kind === "retrievedContext" ||
    kind === "observations" ||
    kind === "userTurn" ||
    kind === "assistantScratchpadPlan"
  ) {
    return "dynamic-no-cache";
  }
  if (kind === "sessionSummary" || kind === "memoryContext") {
    return "cacheable-readonly";
  }
  return "cacheable-prefix";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashPromptSegmentProviderVisible(segmentKind: PromptPackSegmentKind, materials: readonly AssembledPromptMaterial[]): string {
  const input = stableStringify({
    segmentKind,
    materials: materials.map((material) => ({
      id: material.id,
      kind: material.kind,
      text: material.text,
      source: material.source,
      sourceCategory: material.sourceCategory,
      internalOnly: material.internalOnly,
    })),
  });
  return createHash("sha256").update(input).digest("hex");
}

function hashPromptSegmentInternalState(segmentKind: PromptPackSegmentKind, materials: readonly AssembledPromptMaterial[]): string {
  const input = stableStringify({
    segmentKind,
    materials: materials.map((material) => ({
      id: material.id,
      kind: material.kind,
      text: material.text,
      source: material.source,
      sourceCategory: material.sourceCategory,
      metadata: material.metadata,
      internalOnly: material.internalOnly,
    })),
  });
  return createHash("sha256").update(input).digest("hex");
}

function segmentOrder(kind: PromptPackSegmentKind): number {
  return PROMPT_PACK_SEGMENT_KINDS.indexOf(kind);
}

function toolProviderOrder(material: DefinedPromptMaterial): number {
  const providerKind = material.metadata.toolProviderKind;
  if (providerKind === "baseTool" || providerKind === "builtinBaseTool") return 0;
  if (providerKind === "tap" || providerKind === "officialTap") return 1;
  if (providerKind === "mcp" || providerKind === "mcp-static") return 2;
  if (providerKind === "dynamic" || providerKind === "external-dynamic") return 3;
  return 0;
}

function comparePromptMaterials(left: DefinedPromptMaterial, right: DefinedPromptMaterial, ordering?: PromptAssemblerOrdering): number {
  const leftSegment = left.promptSegmentKind;
  const rightSegment = right.promptSegmentKind;
  const segmentDelta = segmentOrder(leftSegment) - segmentOrder(rightSegment);
  if (segmentDelta !== 0) {
    return segmentDelta;
  }

  if (leftSegment === "toolDeclarations") {
    const providerDelta = toolProviderOrder(left) - toolProviderOrder(right);
    if (providerDelta !== 0) {
      return providerDelta;
    }
  }

  if (isProtectedMaterial(left) && !isProtectedMaterial(right)) {
    return -1;
  }
  if (!isProtectedMaterial(left) && isProtectedMaterial(right)) {
    return 1;
  }

  if (ordering === "priority-desc") {
    const priorityDelta = right.priority - left.priority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
  }

  return 0;
}

function buildPromptPackCachePlan(materials: readonly AssembledPromptMaterial[]): PromptPackCachePlan {
  const segments = PROMPT_PACK_SEGMENT_KINDS.map((segmentKind): PromptPackSegment => {
    const segmentMaterials = materials.filter((material) => material.promptSegmentKind === segmentKind);
    return {
      segmentId: `prompt.segment.${segmentKind}`,
      segmentKind,
      stability: segmentStability(segmentKind),
      cachePolicy: segmentCachePolicy(segmentKind),
      segmentHash: hashPromptSegmentProviderVisible(segmentKind, segmentMaterials),
      estimatedTokens: segmentMaterials.reduce((sum, material) => sum + material.estimatedTokens, 0),
      materialRefs: segmentMaterials.map((material) => material.id),
      sourceRefs: [...new Set(segmentMaterials.map((material) => material.source))],
      providerHints: {
        internalStateHash: hashPromptSegmentInternalState(segmentKind, segmentMaterials),
      },
    };
  });

  const cacheRiskWarnings: string[] = [];
  const dynamicBeforeStatic = materials.some((material, index) => {
    if (segmentStability(material.promptSegmentKind) !== "dynamic") {
      return false;
    }
    return materials.slice(index + 1).some((next) => segmentStability(next.promptSegmentKind) === "static");
  });
  if (dynamicBeforeStatic) {
    cacheRiskWarnings.push("dynamic-material-before-static-prefix");
  }
  if (materials.some((material) => material.promptSegmentKind === "toolDeclarations" && material.metadata.toolProviderKind === "dynamic")) {
    cacheRiskWarnings.push("dynamic-tool-declaration-in-capability-prefix");
  }
  if (materials.some((material) => material.promptSegmentKind === "assistantScratchpadPlan")) {
    cacheRiskWarnings.push("assistant-scratchpad-plan-is-internal-no-provider-cache");
  }

  return {
    kind: "praxis.promptPack.cachePlan",
    format: "praxis.promptPack.cachePlan.v1",
    strategy: "stable-segment-prefix",
    orderedSegmentKinds: PROMPT_PACK_SEGMENT_KINDS,
    providerVisibleSegmentKinds: PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS,
    segments,
    cacheablePrefixSegmentKinds: segments
      .filter((segment) => segment.cachePolicy === "cacheable-prefix")
      .map((segment) => segment.segmentKind),
    dynamicSegmentKinds: segments
      .filter((segment) => segment.cachePolicy === "dynamic-no-cache")
      .map((segment) => segment.segmentKind),
    cacheUnit: "prompt-pack-section",
    cachePriority: ["context-quality", "cost", "latency"],
    cacheRiskWarnings,
    providerPayloadCreated: false,
  };
}

function readStringMetadata(
  material: AssembledPromptMaterial,
  key: string,
): string | undefined {
  const value = material.metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readRecordMetadata(
  material: AssembledPromptMaterial,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = material.metadata[key];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readToolMaterialType(material: AssembledPromptMaterial): PromptPackToolMaterialType {
  const type = readStringMetadata(material, "toolMaterialType");
  return type === "declaration" || type === "result" || type === "call-state" ? type : "policy";
}

function buildToolPack(materials: readonly AssembledPromptMaterial[]): AssembledPromptToolPack {
  const policies: AssembledPromptMaterial[] = [];
  const declarations: AssembledPromptToolDeclaration[] = [];
  const results: AssembledPromptToolResult[] = [];
  const callStates: AssembledPromptToolState[] = [];

  for (const material of materials) {
    if (
      material.kind !== "tool" &&
      material.kind !== "tool-summary" &&
      material.kind !== "command" &&
      material.kind !== "command-injection"
    ) {
      continue;
    }

    const toolType = readToolMaterialType(material);
    if (toolType === "policy") {
      policies.push(material);
      continue;
    }

    if (toolType === "declaration") {
      declarations.push({
        materialId: material.id,
        name: readStringMetadata(material, "toolName") ?? material.id,
        description: readStringMetadata(material, "toolDescription") ?? material.text,
        inputSchema: readRecordMetadata(material, "inputSchema") ?? { type: "object", properties: {} },
        metadata: material.metadata,
      });
      continue;
    }

    if (toolType === "result") {
      results.push({
        materialId: material.id,
        callId: readStringMetadata(material, "toolCallId"),
        name: readStringMetadata(material, "toolName"),
        content: material.text,
        metadata: material.metadata,
      });
      continue;
    }

    callStates.push({
      materialId: material.id,
      callId: readStringMetadata(material, "toolCallId"),
      name: readStringMetadata(material, "toolName"),
      arguments: readStringMetadata(material, "toolArguments") ?? material.text,
      metadata: material.metadata,
    });
  }

  return { policies, declarations, results, callStates };
}

function renderAssembledText(materials: readonly AssembledPromptMaterial[]): string {
  return materials
    .map((material) => [`<${material.kind} id="${material.id}">`, material.text, `</${material.kind}>`].join("\n"))
    .join("\n\n");
}

export function assemblePromptPack(request?: PromptAssemblerRequest): PromptAssemblerResult {
  const runtimeId = request?.runtimeId?.trim();
  const sessionId = request?.sessionId?.trim();

  if (request === undefined || runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before assembling PromptPack", "input");
  }

  if (sessionId === undefined || sessionId.length === 0) {
    return failure("MISSING_SESSION_ID", "sessionId is required before assembling PromptPack", "input");
  }

  if (hasInvalidBudget(request.budget)) {
    return failure("INVALID_BUDGET", "PromptPack assembly budget values must be positive integers", "budget");
  }

  const materials = request.materials ?? [];
  if (materials.length === 0) {
    return failure("EMPTY_MATERIALS", "PromptPack assembly requires mapped materials", "material");
  }

  const injectionRecords: PromptInjectionRecord[] = [];
  for (const material of materials) {
    const suspected = detectPromptInjectionRisk(material.text);
    if (!suspected) {
      continue;
    }

    if (!material.trusted && request.allowUntrustedInjection !== true) {
      return {
        ok: false,
        error: {
          code: "UNTRUSTED_INJECTION",
          message: `PromptPack material ${material.id} contains a suspected prompt injection directive`,
          boundary: "injection",
          safeForRuntimeInspection: true,
        },
        events: ["promptPack.assembly.rejected"],
      };
    }

    injectionRecords.push({
      materialId: material.id,
      source: material.source,
      action: material.trusted ? "allowed-trusted" : "allowed-untrusted-by-request",
    });
  }

  const orderedMaterials = materials
    .map((material, index) => ({ material, index }))
    .sort((left, right) => {
      const compared = comparePromptMaterials(left.material, right.material, request.ordering);
      return compared === 0 ? left.index - right.index : compared;
    })
    .map((entry) => entry.material);

  const trimRecords: PromptTrimRecord[] = [];
  const maxMaterials = request.budget?.maxMaterials;
  const materialWindow = maxMaterials === undefined ? orderedMaterials : orderedMaterials.slice(0, maxMaterials);

  if (maxMaterials !== undefined && orderedMaterials.length > maxMaterials) {
    for (const material of orderedMaterials.slice(maxMaterials)) {
      if (!isProtectedMaterial(material)) {
        trimRecords.push({
          materialId: material.id,
          reason: "max-materials",
          originalEstimatedTokens: material.estimatedTokens,
          keptEstimatedTokens: 0,
        });
      }
    }
  }

  const assembledMaterials: AssembledPromptMaterial[] = [];
  let totalEstimatedTokens = 0;
  const maxEstimatedTokens = request.budget?.maxEstimatedTokens;
  const maxMaterialCharacters = request.budget?.maxMaterialCharacters;

  for (const material of materialWindow) {
    let assembled = toAssembledMaterial(material);

    if (!assembled.protected && maxMaterialCharacters !== undefined && assembled.text.length > maxMaterialCharacters) {
      const text = assembled.text.slice(0, maxMaterialCharacters).trimEnd();
      const keptEstimatedTokens = estimateTruncatedTokens(
        assembled.estimatedTokens,
        assembled.text.length,
        text.length,
      );
      trimRecords.push({
        materialId: assembled.id,
        reason: "max-material-characters",
        originalEstimatedTokens: assembled.estimatedTokens,
        keptEstimatedTokens,
      });
      assembled = { ...assembled, text, estimatedTokens: keptEstimatedTokens };
    }

    if (!assembled.protected && maxEstimatedTokens !== undefined && totalEstimatedTokens + assembled.estimatedTokens > maxEstimatedTokens) {
      const remainingTokens = maxEstimatedTokens - totalEstimatedTokens;
      if (remainingTokens <= 0) {
        trimRecords.push({
          materialId: assembled.id,
          reason: "max-estimated-tokens",
          originalEstimatedTokens: assembled.estimatedTokens,
          keptEstimatedTokens: 0,
        });
        continue;
      }

      const keptCharacters = Math.max(1, Math.floor((assembled.text.length * remainingTokens) / assembled.estimatedTokens));
      const text = assembled.text.slice(0, keptCharacters).trimEnd();
      trimRecords.push({
        materialId: assembled.id,
        reason: "max-estimated-tokens",
        originalEstimatedTokens: assembled.estimatedTokens,
        keptEstimatedTokens: remainingTokens,
      });
      assembled = { ...assembled, text, estimatedTokens: remainingTokens };
    }

    assembledMaterials.push(assembled);
    totalEstimatedTokens += assembled.estimatedTokens;
  }

  if (assembledMaterials.length === 0) {
    return failure("BUDGET_EXCEEDED", "PromptPack assembly budget removed all materials", "budget");
  }

  const renderedText = renderAssembledText(assembledMaterials);
  const toolPack = buildToolPack(assembledMaterials);
  const cachePlan = buildPromptPackCachePlan(assembledMaterials);
  const segmentHashes = Object.fromEntries(
    cachePlan.segments.map((segment) => [segment.segmentKind, segment.segmentHash]),
  );

  return {
    ok: true,
    promptPack: {
      kind: "praxis.promptPack",
      format: "praxis.promptPack.assembled.v1",
      runtimeId,
      sessionId,
      targetModel: request.targetModel?.trim() || undefined,
      basicCorePromptMaterialId: BASIC_CORE_PROMPT_MATERIAL_ID,
      materials: assembledMaterials,
      toolPack,
      renderedText,
      json: {
        materials: assembledMaterials,
        toolPack,
      },
      sourceRecords: materialWindow.map((material) => ({
        materialId: material.id,
        source: material.source,
        sourceCategory: material.sourceCategory,
        kind: material.kind,
        trusted: material.trusted,
      })),
      materialSourceCategories: [...new Set(assembledMaterials.map((material) => material.sourceCategory))],
      segments: cachePlan.segments,
      cachePlan,
      cacheTelemetry: {
        segmentHashes,
        cacheMissReasons: cachePlan.cacheRiskWarnings,
      },
      trimRecords,
      injectionRecords,
      totalEstimatedTokens,
      lowering: {
        mapper: "pending",
        providerPayloadCreated: false,
      },
      unsafeSideEffects: false,
    },
    events: ["promptPack.assembly.accepted"],
  };
}
