/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Mapper 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  detectPromptInjectionRisk,
  estimatePromptTokens,
  type DefinedPromptMaterial,
  type PromptPackBoundary,
  type PromptPackError,
  type PromptPackErrorCode,
  type PromptPackMaterialDraft,
  type PromptPackMaterialKind,
} from "./promptDefiner.js";

export type PromptMapperOrdering = "input-order" | "priority-desc";

export type PromptMapperRequest = {
  runtimeId?: string;
  sessionId?: string;
  materials?: readonly (PromptPackMaterialDraft | DefinedPromptMaterial)[];
  ordering?: PromptMapperOrdering;
  allowUntrustedInjection?: boolean;
};

export type PromptMaterialSourceRecord = {
  materialId: string;
  source: string;
  kind: PromptPackMaterialKind;
  trusted: boolean;
};

export type MappedPromptMaterial = {
  id: string;
  kind: PromptPackMaterialKind;
  text: string;
  source: string;
  priority: number;
  estimatedTokens: number;
  trusted: boolean;
  scope?: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
  sourceRecord: PromptMaterialSourceRecord;
  injectionRisk: "none" | "suspected";
  providerPayloadCreated: false;
};

export type PromptMapperResult =
  | {
      ok: true;
      materials: readonly MappedPromptMaterial[];
      sourceRecords: readonly PromptMaterialSourceRecord[];
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackError;
      events: readonly string[];
    };

export const promptMapperDescriptor = {
  capability: "prompt-mapper",
  route: "agent_executionEngine.promptPack",
  purpose: "map raw PromptPack materials into provider-neutral material records",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(code: PromptPackErrorCode, message: string, boundary: PromptPackBoundary): PromptMapperResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptPack.mapping.rejected"],
  };
}

function normalizeMaterial(
  material: PromptPackMaterialDraft | DefinedPromptMaterial,
  index: number,
): MappedPromptMaterial {
  const text = material.text.trim();
  const id = material.id?.trim() || `mapped:${index + 1}`;
  const source = material.source?.trim() || "runtime";
  const trusted = material.trusted === true;
  const injectionRisk = detectPromptInjectionRisk(text) ? "suspected" : "none";

  return {
    id,
    kind: material.kind,
    text,
    source,
    priority: material.priority ?? 0,
    estimatedTokens: material.estimatedTokens ?? estimatePromptTokens(text),
    trusted,
    scope: material.scope?.trim() || undefined,
    metadata: material.metadata ?? {},
    sourceRecord: {
      materialId: id,
      source,
      kind: material.kind,
      trusted,
    },
    injectionRisk,
    providerPayloadCreated: false,
  };
}

export function mapPromptMaterials(request?: PromptMapperRequest): PromptMapperResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before mapping PromptPack materials", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before mapping PromptPack materials", "input");
  }

  const materials = request.materials ?? [];
  if (materials.length === 0) {
    return failure("EMPTY_MATERIALS", "PromptPack mapping requires at least one material", "material");
  }

  const mappedMaterials: MappedPromptMaterial[] = [];
  for (const [index, material] of materials.entries()) {
    if (material.text.trim().length === 0) {
      return failure("EMPTY_MATERIAL_TEXT", `PromptPack material ${material.id ?? index} must contain text`, "material");
    }

    const mapped = normalizeMaterial(material, index);
    if (mapped.injectionRisk === "suspected" && !mapped.trusted && request.allowUntrustedInjection !== true) {
      return failure(
        "UNTRUSTED_INJECTION",
        `PromptPack material ${mapped.id} contains a suspected prompt injection directive`,
        "injection",
      );
    }
    mappedMaterials.push(mapped);
  }

  const orderedMaterials =
    request.ordering === "priority-desc"
      ? [...mappedMaterials].sort((left, right) => right.priority - left.priority)
      : mappedMaterials;

  return {
    ok: true,
    materials: orderedMaterials,
    sourceRecords: orderedMaterials.map((material) => material.sourceRecord),
    events: ["promptPack.mapping.accepted"],
  };
}
