/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 prompt Lowering Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ModelAdapterRuntimeCaller,
  ModelAdapterRuntimeGate,
} from "./modelAdapterRuntime.js";

export type PromptLoweringMaterialKind =
  | "system"
  | "developer"
  | "user"
  | "tool-summary"
  | "command"
  | "context"
  | "memory"
  | "runtime-event"
  | (string & {});

export type PromptLoweringSourceCategory = "declared-built-in" | "process-product" | "user-request";
export type PromptLoweringSegmentKind =
  | "stableSystemCore"
  | "declaredRuntimeContext"
  | "toolDeclarations"
  | "projectContext"
  | "sessionSummary"
  | "memoryContext"
  | "retrievedContext"
  | "observations"
  | "userTurn"
  | "assistantScratchpadPlan";

export type PromptLoweringFallbackMode = "none" | "json-tool-plan";
export type PromptLoweringPolicyFailureKind =
  | "safety"
  | "permission"
  | "tool-semantics"
  | "cache"
  | "formatting"
  | "provider-feature";
export type PromptLoweringPolicyDisposition = "fail-closed" | "best-effort";

export type PromptLoweringBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "prompt-pack"
  | "target";

export type PromptLoweringErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_PROMPT_PACK"
  | "MISSING_PROMPT_PACK_ID"
  | "EMPTY_PROMPT_MATERIALS"
  | "MISSING_TARGET_CAPABILITY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "LOWERING_POLICY_REJECTED";

export type PromptLoweringError = {
  code: PromptLoweringErrorCode;
  message: string;
  boundary: PromptLoweringBoundary;
  publicSafe: true;
};

export type PromptLoweringMaterialInput = {
  kind?: PromptLoweringMaterialKind;
  ref?: string;
  text?: string;
  sourceCategory?: PromptLoweringSourceCategory;
  promptSegmentKind?: PromptLoweringSegmentKind;
  priority?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptLoweringPackInput = {
  id?: string;
  materials?: readonly PromptLoweringMaterialInput[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptLoweringTarget = {
  capabilityId?: string;
  carrierId?: string;
  outputMode?: "single" | "stream" | "batch" | (string & {});
};

export type PromptLoweringPolicyIssue = {
  kind: PromptLoweringPolicyFailureKind;
  accepted: boolean;
  reason?: string;
};

export type PromptLoweringRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  promptPack?: PromptLoweringPackInput;
  target?: PromptLoweringTarget;
  runtimeReady?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
  fallbackMode?: PromptLoweringFallbackMode;
  loweringPolicyIssues?: readonly PromptLoweringPolicyIssue[];
};

export type LoweredPromptMaterial = {
  materialId: string;
  kind: PromptLoweringMaterialKind;
  ref?: string;
  text?: string;
  sourceCategory?: PromptLoweringSourceCategory;
  promptSegmentKind?: PromptLoweringSegmentKind;
  priority: number;
  sequence: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type LoweredPromptTarget = {
  capabilityId: string;
  carrierId?: string;
  outputMode: "single" | "stream" | "batch" | (string & {});
};

export type LoweredPromptEnvelope = {
  loweringId: string;
  runtimeId: string;
  promptPackId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter.promptLoweringRuntime";
  target: LoweredPromptTarget;
  materials: readonly LoweredPromptMaterial[];
  materialRefs: readonly string[];
  materialKinds: readonly PromptLoweringMaterialKind[];
  providerVisibleSegmentKinds: readonly PromptLoweringSegmentKind[];
  hiddenInternalSegmentKinds: readonly PromptLoweringSegmentKind[];
  fallbackMode: PromptLoweringFallbackMode;
  visibleFallbackCreated: boolean;
  policy: {
    failClosedKinds: readonly ["safety", "permission", "tool-semantics"];
    bestEffortKinds: readonly ["cache", "formatting", "provider-feature"];
    degradationRecords: readonly PromptLoweringPolicyIssue[];
    degraded: boolean;
  };
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type PromptLoweringResult =
  | {
      ok: true;
      loweredPrompt: LoweredPromptEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptLoweringError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: ModelAdapterRuntimeCaller): ModelAdapterRuntimeCaller {
  const normalized: ModelAdapterRuntimeCaller = {
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
  code: PromptLoweringErrorCode,
  message: string,
  boundary: PromptLoweringBoundary,
): PromptLoweringResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.promptLoweringRuntime.rejected"],
  };
}

function readPromptSegmentKind(material: PromptLoweringMaterialInput): PromptLoweringSegmentKind | undefined {
  if (material.promptSegmentKind !== undefined) {
    return material.promptSegmentKind;
  }
  const value = material.metadata?.promptSegmentKind;
  return typeof value === "string" ? (value as PromptLoweringSegmentKind) : undefined;
}

function isFailClosedKind(kind: PromptLoweringPolicyFailureKind): boolean {
  return kind === "safety" || kind === "permission" || kind === "tool-semantics";
}

function rejectedPolicyIssue(issues: readonly PromptLoweringPolicyIssue[] | undefined): PromptLoweringPolicyIssue | undefined {
  return (issues ?? []).find((issue) => issue.accepted === false && isFailClosedKind(issue.kind));
}

function bestEffortDegradations(issues: readonly PromptLoweringPolicyIssue[] | undefined): readonly PromptLoweringPolicyIssue[] {
  return (issues ?? []).filter((issue) => issue.accepted === false && !isFailClosedKind(issue.kind));
}

function normalizeMaterials(
  promptPackId: string,
  materials: readonly PromptLoweringMaterialInput[] | undefined,
  fallbackMode: PromptLoweringFallbackMode,
): readonly LoweredPromptMaterial[] {
  return (materials ?? [])
    .map((material, index) => {
      const kind = material.kind?.trim();
      const ref = material.ref?.trim();
      const text = material.text?.trim();
      const promptSegmentKind = readPromptSegmentKind(material);
      if (promptSegmentKind === "assistantScratchpadPlan" && fallbackMode !== "json-tool-plan") {
        return undefined;
      }
      if (kind === undefined || kind.length === 0 || ((ref ?? "").length === 0 && (text ?? "").length === 0)) {
        return undefined;
      }

      const lowered: LoweredPromptMaterial = {
        materialId: ref !== undefined && ref.length > 0 ? ref : `${promptPackId}:material:${index + 1}`,
        kind,
        sourceCategory: material.sourceCategory ?? "process-product",
        promptSegmentKind,
        priority: Number.isFinite(material.priority) ? Number(material.priority) : 0,
        sequence: index,
        metadata: material.metadata ?? {},
      };

      if (ref !== undefined && ref.length > 0) {
        lowered.ref = ref;
      }

      if (text !== undefined && text.length > 0) {
        lowered.text = text;
      }

      return lowered;
    })
    .filter((material): material is LoweredPromptMaterial => material !== undefined);
}

export function lowerPromptForModelAdapter(request?: PromptLoweringRequest): PromptLoweringResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "prompt lowering runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "prompt lowering runtime requires a caller", "input");
  }

  if (request.promptPack === undefined) {
    return failure("MISSING_PROMPT_PACK", "prompt lowering runtime requires a promptPack input", "input");
  }

  if (!hasText(request.promptPack.id)) {
    return failure("MISSING_PROMPT_PACK_ID", "prompt lowering runtime requires a stable promptPack id", "prompt-pack");
  }

  if (!hasText(request.target?.capabilityId)) {
    return failure(
      "MISSING_TARGET_CAPABILITY",
      "prompt lowering runtime requires a target model capability id",
      "target",
    );
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "prompt lowering can only run through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "prompt lowering runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "prompt lowering runtime was rejected by governance",
      "governance",
    );
  }

  const policyRejection = rejectedPolicyIssue(request.loweringPolicyIssues);
  if (policyRejection !== undefined) {
    return failure(
      "LOWERING_POLICY_REJECTED",
      policyRejection.reason ?? `prompt lowering failed closed for ${policyRejection.kind}`,
      policyRejection.kind === "tool-semantics" ? "prompt-pack" : "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const promptPackId = request.promptPack.id.trim();
  const fallbackMode = request.fallbackMode ?? "none";
  const materials = normalizeMaterials(promptPackId, request.promptPack.materials, fallbackMode);

  if (materials.length === 0) {
    return failure(
      "EMPTY_PROMPT_MATERIALS",
      "prompt lowering runtime requires at least one prompt material with a kind and ref or text",
      "prompt-pack",
    );
  }

  const outputMode = request.target.outputMode?.trim();
  const carrierId = request.target.carrierId?.trim();
  const target: LoweredPromptTarget = {
    capabilityId: request.target.capabilityId.trim(),
    outputMode: outputMode !== undefined && outputMode.length > 0 ? outputMode : "single",
  };

  if (carrierId !== undefined && carrierId.length > 0) {
    target.carrierId = carrierId;
  }

  const degradationRecords = bestEffortDegradations(request.loweringPolicyIssues);
  const hiddenInternalSegmentKinds = [...new Set(
    (request.promptPack.materials ?? [])
      .map((material) => readPromptSegmentKind(material))
      .filter((segmentKind): segmentKind is PromptLoweringSegmentKind => segmentKind === "assistantScratchpadPlan"),
  )];
  const providerVisibleSegmentKinds = [...new Set(
    materials
      .map((material) => material.promptSegmentKind)
      .filter((segmentKind): segmentKind is PromptLoweringSegmentKind => segmentKind !== undefined),
  )];

  return {
    ok: true,
    loweredPrompt: {
      loweringId: `${runtimeId}:promptLowering:${promptPackId}`,
      runtimeId,
      promptPackId,
      caller: normalizeCaller(request.caller),
      route: "runtime.modelAdapter.promptLoweringRuntime",
      target,
      materials,
      materialRefs: materials.map((material) => material.materialId),
      materialKinds: [...new Set(materials.map((material) => material.kind))],
      providerVisibleSegmentKinds,
      hiddenInternalSegmentKinds,
      fallbackMode,
      visibleFallbackCreated: fallbackMode === "json-tool-plan" && materials.some((material) => material.promptSegmentKind === "assistantScratchpadPlan"),
      policy: {
        failClosedKinds: ["safety", "permission", "tool-semantics"],
        bestEffortKinds: ["cache", "formatting", "provider-feature"],
        degradationRecords,
        degraded: degradationRecords.length > 0,
      },
      metadata: request.promptPack.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: degradationRecords.length > 0
      ? ["runtime.modelAdapter.promptLoweringRuntime.lowered", "runtime.modelAdapter.promptLoweringRuntime.degraded"]
      : ["runtime.modelAdapter.promptLoweringRuntime.lowered"],
  };
}
