/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Assembler 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  BASIC_CORE_PROMPT_MATERIAL_ID,
  detectPromptInjectionRisk,
  type DefinedPromptMaterial,
  type PromptPackBoundary,
  type PromptPackBudget,
  type PromptPackError,
  type PromptPackErrorCode,
  type PromptPackMaterialKind,
  type PromptPackToolMaterialType,
} from "./promptDefiner.js";

export type PromptAssemblerOrdering = "input-order" | "priority-desc";

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
  priority: number;
  estimatedTokens: number;
  trusted: boolean;
  scope?: string;
  metadata: Readonly<Record<string, string | number | boolean | object>>;
  protected: boolean;
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
    priority: material.priority,
    estimatedTokens: material.estimatedTokens,
    trusted: material.trusted,
    scope: material.scope,
    metadata: material.metadata,
    protected: isProtectedMaterial(material),
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

  const orderedMaterials =
    request.ordering === "priority-desc"
      ? [...materials].sort((left, right) => {
          if (isProtectedMaterial(left) && !isProtectedMaterial(right)) {
            return -1;
          }
          if (!isProtectedMaterial(left) && isProtectedMaterial(right)) {
            return 1;
          }
          return right.priority - left.priority;
        })
      : [...materials].sort((left, right) => Number(isProtectedMaterial(right)) - Number(isProtectedMaterial(left)));

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
        kind: material.kind,
        trusted: material.trusted,
      })),
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
