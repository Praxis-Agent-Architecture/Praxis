/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 interface Adapter Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterfaceAdapterRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "binding"
  | "scope";

export type InterfaceAdapterRuntimeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type InterfaceAdapterRuntimeCaller = {
  kind: InterfaceAdapterRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type InterfaceAdapterRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type InterfaceAdapterRuntimeSurface =
  | "basicInterfaceLayer"
  | "customInterfaceLayer"
  | "customInterfaceRuntimeBridge"
  | "interfaceRuleRuntime"
  | "officialPoolRuntimeBridge"
  | (string & {});

export type InterfaceAdapterRuntimeBindingInput = {
  surface?: InterfaceAdapterRuntimeSurface;
  bindingId?: string;
  ready?: boolean;
  capabilities?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type InterfaceAdapterRuntimeErrorCode =
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

export type InterfaceAdapterRuntimeError = {
  code: InterfaceAdapterRuntimeErrorCode;
  message: string;
  boundary: InterfaceAdapterRuntimeBoundary;
  publicSafe: true;
};

export type InterfaceAdapterRuntimeBinding = {
  surface: InterfaceAdapterRuntimeSurface;
  bindingId: string;
  ready: true;
  capabilities: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type InterfaceAdapterRuntimeHandle = {
  runtimeId: string;
  caller: InterfaceAdapterRuntimeCaller;
  route: "runtime.interfaceAdapter";
  phase: "bound";
  bindings: readonly InterfaceAdapterRuntimeBinding[];
  bindingIds: readonly string[];
  surfaces: readonly InterfaceAdapterRuntimeSurface[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  governanceChecked: true;
  contractChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type InterfaceAdapterRuntimeRequest = {
  runtimeId?: string;
  caller?: InterfaceAdapterRuntimeCaller;
  bindings?: readonly InterfaceAdapterRuntimeBindingInput[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InterfaceAdapterRuntimeGate;
  governance?: InterfaceAdapterRuntimeGate;
};

export type InterfaceAdapterRuntimeResult =
  | {
      ok: true;
      runtime: InterfaceAdapterRuntimeHandle;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterfaceAdapterRuntimeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: InterfaceAdapterRuntimeCaller): InterfaceAdapterRuntimeCaller {
  const normalized: InterfaceAdapterRuntimeCaller = {
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
  code: InterfaceAdapterRuntimeErrorCode,
  message: string,
  boundary: InterfaceAdapterRuntimeBoundary,
): InterfaceAdapterRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.interfaceAdapter.rejected"],
  };
}

function normalizeBinding(
  binding: InterfaceAdapterRuntimeBindingInput,
): InterfaceAdapterRuntimeBinding | InterfaceAdapterRuntimeResult {
  const surface = binding.surface?.trim();
  const bindingId = binding.bindingId?.trim();

  if (!hasText(surface)) {
    return failure("MISSING_BINDING_SURFACE", "interfaceAdapter runtime bindings require a surface", "binding");
  }

  if (!hasText(bindingId)) {
    return failure("MISSING_BINDING_ID", "interfaceAdapter runtime bindings require a bindingId", "binding");
  }

  if (binding.ready === false) {
    return failure("BINDING_NOT_READY", `interfaceAdapter binding ${bindingId} is not ready`, "binding");
  }

  return {
    surface,
    bindingId,
    ready: true,
    capabilities: cleanList(binding.capabilities),
    metadata: binding.metadata ?? {},
  };
}

export function createInterfaceAdapterRuntime(
  request?: InterfaceAdapterRuntimeRequest,
): InterfaceAdapterRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "interfaceAdapter runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "interfaceAdapter runtime requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "interfaceAdapter runtime can only bind through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "interfaceAdapter runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interfaceAdapter runtime was rejected by governance",
      "governance",
    );
  }

  if ((request.bindings ?? []).length === 0) {
    return failure("MISSING_BINDINGS", "interfaceAdapter runtime requires at least one narrow binding", "input");
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
      `interfaceAdapter runtime includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const bindings: InterfaceAdapterRuntimeBinding[] = [];
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
      route: "runtime.interfaceAdapter",
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
    events: ["runtime.interfaceAdapter.bound"],
  };
}
