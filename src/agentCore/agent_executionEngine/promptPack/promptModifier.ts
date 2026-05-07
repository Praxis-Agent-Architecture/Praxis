/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Modifier 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  BASIC_CORE_PROMPT_MATERIAL_ID,
  detectPromptInjectionRisk,
  estimatePromptTokens,
  inferPromptPackSegmentKind,
  inferPromptMaterialSourceCategory,
  type DefinedPromptMaterial,
  type PromptPackBoundary,
  type PromptPackError,
  type PromptPackErrorCode,
  type PromptPackMaterialDraft,
} from "./promptDefiner.js";

export type PromptModificationOperation =
  | {
      kind: "add";
      material: PromptPackMaterialDraft;
      reason?: string;
    }
  | {
      kind: "drop";
      materialId: string;
      reason?: string;
    }
  | {
      kind: "replace-text";
      materialId: string;
      text: string;
      reason?: string;
    }
  | {
      kind: "adjust-priority";
      materialId: string;
      priority: number;
      reason?: string;
    };

export type PromptModificationAuditRecord = {
  operation: PromptModificationOperation["kind"];
  materialId: string;
  reason: string;
  dryRun: true;
};

export type ModifiedPromptMaterial = DefinedPromptMaterial & {
  modifierRecords: readonly string[];
  protected: boolean;
};

export type PromptModifierRequest = {
  runtimeId?: string;
  sessionId?: string;
  materials?: readonly DefinedPromptMaterial[];
  operations?: readonly PromptModificationOperation[];
  allowUntrustedInjection?: boolean;
};

export type PromptModifierResult =
  | {
      ok: true;
      materials: readonly ModifiedPromptMaterial[];
      auditRecords: readonly PromptModificationAuditRecord[];
      dryRun: true;
      providerPayloadCreated: false;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackError;
      events: readonly string[];
    };

export const promptModifierDescriptor = {
  capability: "prompt-modifier",
  route: "agent_executionEngine.promptPack",
  purpose: "plan audited changes to Praxis internal PromptPack constructs before assembly",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(code: PromptPackErrorCode, message: string, boundary: PromptPackBoundary): PromptModifierResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptPack.modification.rejected"],
  };
}

function isProtectedMaterial(material: DefinedPromptMaterial): boolean {
  return material.id === BASIC_CORE_PROMPT_MATERIAL_ID || material.metadata.protected === true;
}

function toModified(material: DefinedPromptMaterial, note?: string): ModifiedPromptMaterial {
  const modifierRecords =
    "modifierRecords" in material ? (material as ModifiedPromptMaterial).modifierRecords : [];
  const existingRecords: readonly string[] = modifierRecords;
  return {
    ...material,
    protected: isProtectedMaterial(material),
    modifierRecords: note ? [...existingRecords, note] : existingRecords,
  };
}

function createAddedMaterial(material: PromptPackMaterialDraft, index: number): ModifiedPromptMaterial {
  const text = material.text.trim();
  const id = material.id?.trim() || `added:${index + 1}`;
  const source = material.source?.trim() || "runtime";
  const trusted = material.trusted === true;
  const promptSegmentKind = inferPromptPackSegmentKind({ ...material, source });

  return {
    id,
    kind: material.kind,
    text,
    source,
    sourceCategory: inferPromptMaterialSourceCategory({ ...material, source }),
    priority: material.priority ?? 0,
    estimatedTokens: material.estimatedTokens ?? estimatePromptTokens(text),
    trusted,
    scope: material.scope?.trim() || undefined,
    promptSegmentKind,
    internalOnly: material.internalOnly === true || promptSegmentKind === "assistantScratchpadPlan",
    metadata: material.metadata ?? {},
    protected: false,
    modifierRecords: ["added"],
  };
}

function auditRecord(
  operation: PromptModificationOperation["kind"],
  materialId: string,
  reason: string | undefined,
): PromptModificationAuditRecord {
  return {
    operation,
    materialId,
    reason: reason?.trim() || "prompt modifier operation",
    dryRun: true,
  };
}

export function modifyPromptMaterials(request?: PromptModifierRequest): PromptModifierResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before modifying PromptPack materials", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before modifying PromptPack materials", "input");
  }

  const initialMaterials = request.materials ?? [];
  if (initialMaterials.length === 0) {
    return failure("EMPTY_MATERIALS", "PromptPack modification requires mapped materials", "material");
  }

  const operations = request.operations ?? [];
  if (operations.length === 0) {
    return failure("MISSING_OPERATION", "PromptPack modification requires at least one operation", "contract");
  }

  let materials = initialMaterials.map((material) => toModified(material));
  const auditRecords: PromptModificationAuditRecord[] = [];

  for (const [operationIndex, operation] of operations.entries()) {
    if (operation.kind === "add") {
      if (operation.material.text.trim().length === 0) {
        return failure("EMPTY_MATERIAL_TEXT", "added PromptPack material must contain text", "material");
      }

      const added = createAddedMaterial(operation.material, operationIndex);
      if (detectPromptInjectionRisk(added.text) && !added.trusted && request.allowUntrustedInjection !== true) {
        return failure(
          "UNTRUSTED_INJECTION",
          `added PromptPack material ${added.id} contains a suspected prompt injection directive`,
          "injection",
        );
      }

      materials = [...materials, added];
      auditRecords.push(auditRecord("add", added.id, operation.reason));
      continue;
    }

    const materialIndex = materials.findIndex((material) => material.id === operation.materialId);
    if (materialIndex === -1) {
      return failure(
        "MATERIAL_NOT_FOUND",
        `PromptPack material ${operation.materialId} was not found for ${operation.kind}`,
        "material",
      );
    }

    const material = materials[materialIndex];
    if (material.protected && (operation.kind === "drop" || operation.kind === "replace-text")) {
      return failure(
        "PROTECTED_MATERIAL",
        `PromptPack material ${operation.materialId} is protected and cannot be ${operation.kind === "drop" ? "dropped" : "rewritten"} by modifier`,
        "governance",
      );
    }

    if (operation.kind === "drop") {
      materials = materials.filter((candidate) => candidate.id !== operation.materialId);
      auditRecords.push(auditRecord("drop", operation.materialId, operation.reason));
      continue;
    }

    if (operation.kind === "replace-text") {
      const text = operation.text.trim();
      if (text.length === 0) {
        return failure("EMPTY_MATERIAL_TEXT", "replacement PromptPack material text must not be empty", "material");
      }

      const injectionRisk = detectPromptInjectionRisk(text) ? "suspected" : "none";
      if (injectionRisk === "suspected" && !material.trusted && request.allowUntrustedInjection !== true) {
        return failure(
          "UNTRUSTED_INJECTION",
          `replacement PromptPack material ${operation.materialId} contains a suspected prompt injection directive`,
          "injection",
        );
      }

      materials = materials.map((candidate) =>
        candidate.id === operation.materialId
          ? {
              ...candidate,
              text,
              estimatedTokens: estimatePromptTokens(text),
              modifierRecords: [...candidate.modifierRecords, "text-replaced"],
            }
          : candidate,
      );
      auditRecords.push(auditRecord("replace-text", operation.materialId, operation.reason));
      continue;
    }

    materials = materials.map((candidate) =>
      candidate.id === operation.materialId
        ? {
            ...candidate,
            priority: operation.priority,
            modifierRecords: [...candidate.modifierRecords, "priority-adjusted"],
          }
        : candidate,
    );
    auditRecords.push(auditRecord("adjust-priority", operation.materialId, operation.reason));
  }

  return {
    ok: true,
    materials,
    auditRecords,
    dryRun: true,
    providerPayloadCreated: false,
    events: ["promptPack.modification.planned"],
  };
}
