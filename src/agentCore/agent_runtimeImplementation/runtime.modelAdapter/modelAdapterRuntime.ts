/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 model Adapter Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ModelAdapterRuntimeBoundary = "input" | "contract" | "governance" | "runtime-state" | "binding" | "scope";

export type ModelAdapterRuntimeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type ModelAdapterRuntimeCaller = {
  kind: ModelAdapterRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type ModelAdapterRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type ModelAdapterRuntimeSurface =
  | "actualInvocationLayer"
  | "abstractionLayer"
  | "bridgingLayer"
  | "promptLoweringRuntime"
  | "modelInvocationRuntime"
  | "providerCarrierRegistry"
  | "modelCapabilityBridge"
  | (string & {});

export type ModelAdapterRuntimeBindingInput = {
  surface?: ModelAdapterRuntimeSurface;
  bindingId?: string;
  ready?: boolean;
  capabilities?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelAdapterRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BINDINGS"
  | "MISSING_BINDING_SURFACE"
  | "MISSING_BINDING_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "BINDING_NOT_READY"
  | "SCOPE_DENIED";

export type ModelAdapterRuntimeError = {
  code: ModelAdapterRuntimeErrorCode;
  message: string;
  boundary: ModelAdapterRuntimeBoundary;
  publicSafe: true;
};

export type ModelAdapterRuntimeBinding = {
  surface: ModelAdapterRuntimeSurface;
  bindingId: string;
  ready: true;
  capabilities: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type ModelAdapterRuntimeHandle = {
  runtimeId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter";
  phase: "bound";
  bindings: readonly ModelAdapterRuntimeBinding[];
  bindingIds: readonly string[];
  surfaces: readonly ModelAdapterRuntimeSurface[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  governanceChecked: true;
  contractChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ModelAdapterRuntimeRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  bindings?: readonly ModelAdapterRuntimeBindingInput[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type ModelAdapterRuntimeResult =
  | {
      ok: true;
      runtime: ModelAdapterRuntimeHandle;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelAdapterRuntimeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
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
  code: ModelAdapterRuntimeErrorCode,
  message: string,
  boundary: ModelAdapterRuntimeBoundary,
): ModelAdapterRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.rejected"],
  };
}

function normalizeBinding(
  binding: ModelAdapterRuntimeBindingInput,
): ModelAdapterRuntimeBinding | ModelAdapterRuntimeResult {
  const surface = binding.surface?.trim();
  const bindingId = binding.bindingId?.trim();

  if (!hasText(surface)) {
    return failure("MISSING_BINDING_SURFACE", "modelAdapter runtime bindings require a surface", "binding");
  }

  if (!hasText(bindingId)) {
    return failure("MISSING_BINDING_ID", "modelAdapter runtime bindings require a bindingId", "binding");
  }

  if (binding.ready === false) {
    return failure("BINDING_NOT_READY", `modelAdapter binding ${bindingId} is not ready`, "binding");
  }

  return {
    surface,
    bindingId,
    ready: true,
    capabilities: cleanList(binding.capabilities),
    metadata: binding.metadata ?? {},
  };
}

export function createModelAdapterRuntime(request?: ModelAdapterRuntimeRequest): ModelAdapterRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "modelAdapter runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "modelAdapter runtime requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "modelAdapter runtime can only bind through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "modelAdapter runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "modelAdapter runtime was rejected by governance",
      "governance",
    );
  }

  if ((request.bindings ?? []).length === 0) {
    return failure("MISSING_BINDINGS", "modelAdapter runtime requires at least one narrow binding", "input");
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `modelAdapter runtime includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const bindings: ModelAdapterRuntimeBinding[] = [];
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
      route: "runtime.modelAdapter",
      phase: "bound",
      bindings,
      bindingIds: bindings.map((binding) => binding.bindingId),
      surfaces: bindings.map((binding) => binding.surface),
      requestedScopes,
      grantedScopes,
      governanceChecked: true,
      contractChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.bound"],
  };
}
