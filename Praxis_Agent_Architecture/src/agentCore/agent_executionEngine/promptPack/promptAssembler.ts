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
  detectPromptInjectionRisk,
  type PromptPackBoundary,
  type PromptPackBudget,
  type PromptPackError,
  type PromptPackErrorCode,
} from "./promptDefiner.js";
import type { MappedPromptMaterial, PromptMaterialSourceRecord } from "./promptMapper.js";

export type PromptAssemblerOrdering = "input-order" | "priority-desc";

export type PromptAssemblerRequest = {
  runtimeId?: string;
  sessionId?: string;
  targetModel?: string;
  materials?: readonly MappedPromptMaterial[];
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
  kind: MappedPromptMaterial["kind"];
  text: string;
  source: string;
  priority: number;
  estimatedTokens: number;
  trusted: boolean;
  scope?: string;
  metadata: MappedPromptMaterial["metadata"];
};

export type StandardPromptPack = {
  kind: "praxis.promptPack";
  runtimeId: string;
  sessionId: string;
  targetModel?: string;
  materials: readonly AssembledPromptMaterial[];
  sourceRecords: readonly PromptMaterialSourceRecord[];
  trimRecords: readonly PromptTrimRecord[];
  injectionRecords: readonly PromptInjectionRecord[];
  totalEstimatedTokens: number;
  lowering: {
    promptLoweringRuntime: "pending";
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
  purpose: "assemble provider-neutral PromptPack input with source, trim, and injection records",
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

function toAssembledMaterial(material: MappedPromptMaterial): AssembledPromptMaterial {
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
  };
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
    const suspected = material.injectionRisk === "suspected" || detectPromptInjectionRisk(material.text);
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
      ? [...materials].sort((left, right) => right.priority - left.priority)
      : [...materials];

  const trimRecords: PromptTrimRecord[] = [];
  const maxMaterials = request.budget?.maxMaterials;
  const materialWindow = maxMaterials === undefined ? orderedMaterials : orderedMaterials.slice(0, maxMaterials);

  if (maxMaterials !== undefined && orderedMaterials.length > maxMaterials) {
    for (const material of orderedMaterials.slice(maxMaterials)) {
      trimRecords.push({
        materialId: material.id,
        reason: "max-materials",
        originalEstimatedTokens: material.estimatedTokens,
        keptEstimatedTokens: 0,
      });
    }
  }

  const assembledMaterials: AssembledPromptMaterial[] = [];
  let totalEstimatedTokens = 0;
  const maxEstimatedTokens = request.budget?.maxEstimatedTokens;
  const maxMaterialCharacters = request.budget?.maxMaterialCharacters;

  for (const material of materialWindow) {
    let assembled = toAssembledMaterial(material);

    if (maxMaterialCharacters !== undefined && assembled.text.length > maxMaterialCharacters) {
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

    if (maxEstimatedTokens !== undefined && totalEstimatedTokens + assembled.estimatedTokens > maxEstimatedTokens) {
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

  return {
    ok: true,
    promptPack: {
      kind: "praxis.promptPack",
      runtimeId,
      sessionId,
      targetModel: request.targetModel?.trim() || undefined,
      materials: assembledMaterials,
      sourceRecords: materialWindow.map((material) => material.sourceRecord),
      trimRecords,
      injectionRecords,
      totalEstimatedTokens,
      lowering: {
        promptLoweringRuntime: "pending",
        providerPayloadCreated: false,
      },
      unsafeSideEffects: false,
    },
    events: ["promptPack.assembly.accepted"],
  };
}
