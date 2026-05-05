/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 bind Prompt Pack 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ExecEngineRuntimeCaller, ExecEngineRuntimeGate } from "./execEngineRuntime.js";

export type PromptPackBindingBoundary = "input" | "contract" | "governance" | "runtime-state" | "binding";

export type PromptPackLayerKind =
  | "system"
  | "user"
  | "tool-summary"
  | "command"
  | "context"
  | "memory"
  | "runtime-event"
  | (string & {});

export type PromptPackBindingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_PROMPT_PACK"
  | "MISSING_PROMPT_PACK_ID"
  | "EMPTY_PROMPT_PACK"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type PromptPackBindingError = {
  code: PromptPackBindingErrorCode;
  message: string;
  boundary: PromptPackBindingBoundary;
  publicSafe: true;
};

export type PromptPackLayerRef = {
  kind: PromptPackLayerKind;
  ref: string;
  sourceCategory?: "declared-built-in" | "process-product" | "user-request";
};

export type PromptPackBindingInput = {
  id?: string;
  source?: "application" | "official-module" | "execution-engine" | "runtime" | "test";
  layers?: readonly PromptPackLayerRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptPackBindingRequest = {
  runtimeId?: string;
  caller?: ExecEngineRuntimeCaller;
  promptPack?: PromptPackBindingInput;
  runtimeReady?: boolean;
  contract?: ExecEngineRuntimeGate;
  governance?: ExecEngineRuntimeGate;
};

export type PromptPackBinding = {
  bindingId: string;
  runtimeId: string;
  promptPackId: string;
  caller: ExecEngineRuntimeCaller;
  source: "application" | "official-module" | "execution-engine" | "runtime" | "test";
  route: "runtime.execEngine.promptPack";
  layers: readonly PromptPackLayerRef[];
  layerKinds: readonly PromptPackLayerKind[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type PromptPackBindingResult =
  | {
      ok: true;
      binding: PromptPackBinding;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackBindingError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: ExecEngineRuntimeCaller): ExecEngineRuntimeCaller {
  const normalized: ExecEngineRuntimeCaller = {
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

function normalizeLayers(layers: readonly PromptPackLayerRef[] | undefined): readonly PromptPackLayerRef[] {
  return (layers ?? [])
    .map((layer) => ({ kind: layer.kind.trim(), ref: layer.ref.trim(), sourceCategory: layer.sourceCategory }))
    .filter((layer) => layer.kind.length > 0 && layer.ref.length > 0);
}

function failure(
  code: PromptPackBindingErrorCode,
  message: string,
  boundary: PromptPackBindingBoundary,
): PromptPackBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.execEngine.promptPack.rejected"],
  };
}

export function bindPromptPack(request?: PromptPackBindingRequest): PromptPackBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "promptPack binding requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "promptPack binding requires a caller", "input");
  }

  if (request.promptPack === undefined) {
    return failure("MISSING_PROMPT_PACK", "promptPack binding requires a promptPack input", "input");
  }

  if (!hasText(request.promptPack.id)) {
    return failure("MISSING_PROMPT_PACK_ID", "promptPack binding requires a stable promptPack id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "promptPack can only bind through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "promptPack binding was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "promptPack binding was rejected by governance",
      "governance",
    );
  }

  const layers = normalizeLayers(request.promptPack.layers);
  if (layers.length === 0) {
    return failure("EMPTY_PROMPT_PACK", "promptPack binding requires at least one non-empty layer reference", "binding");
  }

  const promptPackId = request.promptPack.id.trim();

  return {
    ok: true,
    binding: {
      bindingId: `${request.runtimeId.trim()}:promptPack:${promptPackId}`,
      runtimeId: request.runtimeId.trim(),
      promptPackId,
      caller: normalizeCaller(request.caller),
      source: request.promptPack.source ?? "application",
      route: "runtime.execEngine.promptPack",
      layers,
      layerKinds: [...new Set(layers.map((layer) => layer.kind))],
      metadata: request.promptPack.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.execEngine.promptPack.bound"],
  };
}
