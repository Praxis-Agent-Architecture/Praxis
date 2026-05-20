/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 exec Engine Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ExecEngineRuntimeBoundary = "input" | "contract" | "governance" | "runtime-state" | "binding";

export type ExecEngineRuntimeCallerKind = "application" | "official-module" | "runtime-surface" | "test";

export type ExecEngineRuntimeCaller = {
  kind: ExecEngineRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type ExecEngineRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type ExecEngineRuntimeSurface =
  | "promptPack"
  | "invocationBridge"
  | "stateBridge"
  | "coreLogic"
  | "ioTransceiver"
  | "basicToolLayer"
  | "eventExposurePlane"
  | (string & {});

export type ExecEngineRuntimeBindingInput = {
  surface?: ExecEngineRuntimeSurface;
  bindingId?: string;
  ready?: boolean;
  capabilities?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ExecEngineRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BINDINGS"
  | "MISSING_BINDING_SURFACE"
  | "MISSING_BINDING_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "BINDING_NOT_READY";

export type ExecEngineRuntimeError = {
  code: ExecEngineRuntimeErrorCode;
  message: string;
  boundary: ExecEngineRuntimeBoundary;
  publicSafe: true;
};

export type ExecEngineRuntimeBinding = {
  surface: ExecEngineRuntimeSurface;
  bindingId: string;
  ready: boolean;
  capabilities: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type ExecEngineRuntimeHandle = {
  runtimeId: string;
  caller: ExecEngineRuntimeCaller;
  route: "runtime.execEngine";
  phase: "bound";
  bindings: readonly ExecEngineRuntimeBinding[];
  bindingIds: readonly string[];
  surfaces: readonly ExecEngineRuntimeSurface[];
  governanceChecked: true;
  contractChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ExecEngineRuntimeRequest = {
  runtimeId?: string;
  caller?: ExecEngineRuntimeCaller;
  bindings?: readonly ExecEngineRuntimeBindingInput[];
  runtimeReady?: boolean;
  contract?: ExecEngineRuntimeGate;
  governance?: ExecEngineRuntimeGate;
};

export type ExecEngineRuntimeResult =
  | {
      ok: true;
      runtime: ExecEngineRuntimeHandle;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExecEngineRuntimeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
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

function failure(
  code: ExecEngineRuntimeErrorCode,
  message: string,
  boundary: ExecEngineRuntimeBoundary,
): ExecEngineRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.execEngine.rejected"],
  };
}

function normalizeBinding(binding: ExecEngineRuntimeBindingInput): ExecEngineRuntimeBinding | ExecEngineRuntimeResult {
  const surface = binding.surface?.trim();
  const bindingId = binding.bindingId?.trim();

  if (!hasText(surface)) {
    return failure("MISSING_BINDING_SURFACE", "execEngine runtime bindings require a surface", "binding");
  }

  if (!hasText(bindingId)) {
    return failure("MISSING_BINDING_ID", "execEngine runtime bindings require a bindingId", "binding");
  }

  if (binding.ready === false) {
    return failure("BINDING_NOT_READY", `execEngine binding ${bindingId} is not ready`, "binding");
  }

  return {
    surface,
    bindingId,
    ready: true,
    capabilities: cleanList(binding.capabilities),
    metadata: binding.metadata ?? {},
  };
}

export function createExecEngineRuntime(request?: ExecEngineRuntimeRequest): ExecEngineRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "execEngine runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "execEngine runtime requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "execEngine runtime can only bind through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "execEngine runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "execEngine runtime was rejected by governance",
      "governance",
    );
  }

  if ((request.bindings ?? []).length === 0) {
    return failure("MISSING_BINDINGS", "execEngine runtime requires at least one narrow binding", "input");
  }

  const bindings: ExecEngineRuntimeBinding[] = [];
  for (const binding of request.bindings ?? []) {
    const normalized = normalizeBinding(binding);
    if ("ok" in normalized) {
      return normalized;
    }

    bindings.push(normalized);
  }

  return {
    ok: true,
    runtime: {
      runtimeId: request.runtimeId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.execEngine",
      phase: "bound",
      bindings,
      bindingIds: bindings.map((binding) => binding.bindingId),
      surfaces: bindings.map((binding) => binding.surface),
      governanceChecked: true,
      contractChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.execEngine.bound"],
  };
}
