/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：桥接官方模块读取必要 runtime 状态。
 * 能力要求1：需要提供受控状态视图，而不是让模块直接改 agentCore 内部状态。
 * 能力要求2：它服务模块协作，也保护 runtime 状态一致性。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficialModuleStateBridgeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type OfficialModuleStateBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODULE_ID"
  | "MISSING_MODULE_KIND"
  | "MISSING_STATE_SOURCE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MODULE_NOT_MOUNTED";

export type OfficialModuleStateBridgeGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficialModuleStateBridgeRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: string;
  runtimeReady?: boolean;
  mountedModuleIds?: readonly string[];
  visibleState?: Readonly<Record<string, unknown>>;
  requestedStateKeys?: readonly string[];
  contract?: OfficialModuleStateBridgeGate;
  governance?: OfficialModuleStateBridgeGate;
  traceId?: string;
};

export type OfficialModuleStateView = {
  runtimeId: string;
  moduleId: string;
  moduleKind: string;
  ready: true;
  traceId?: string;
  exposedKeys: readonly string[];
  state: Readonly<Record<string, unknown>>;
  readonly: true;
  unsafeSideEffects: false;
};

export type OfficialModuleStateBridgeError = {
  code: OfficialModuleStateBridgeErrorCode;
  message: string;
  boundary: OfficialModuleStateBridgeBoundary;
  publicSafe: true;
};

export type OfficialModuleStateBridgeResult =
  | {
      ok: true;
      view: OfficialModuleStateView;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleStateBridgeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isPublicStateKey(key: string): boolean {
  return !key.startsWith("_") && !key.startsWith("internal.");
}

function snapshotReadonlyValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (Array.isArray(value)) {
    const snapshot: unknown[] = [];
    seen.set(value, snapshot);
    snapshot.push(...value.map((item) => snapshotReadonlyValue(item, seen)));
    return Object.freeze(snapshot);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    const snapshot: Record<string, unknown> = {};
    seen.set(value, snapshot);
    for (const [key, entryValue] of Object.entries(value)) {
      snapshot[key] = snapshotReadonlyValue(entryValue, seen);
    }

    return Object.freeze(snapshot);
  }

  try {
    return Object.freeze(structuredClone(value));
  } catch {
    return value;
  }
}

function failure(
  code: OfficialModuleStateBridgeErrorCode,
  message: string,
  boundary: OfficialModuleStateBridgeBoundary,
): OfficialModuleStateBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.officialModule.stateBridge.rejected"],
  };
}

function pickStateView(
  state: Readonly<Record<string, unknown>>,
  requestedStateKeys: readonly string[] | undefined,
): Readonly<Record<string, unknown>> {
  const requestedKeys = cleanList(requestedStateKeys);
  const candidateKeys = requestedKeys.length > 0 ? requestedKeys : Object.keys(state);
  const exposedEntries = candidateKeys
    .filter((key) => isPublicStateKey(key) && Object.hasOwn(state, key))
    .map((key) => [key, snapshotReadonlyValue(state[key])] as const);

  return Object.freeze(Object.fromEntries(exposedEntries));
}

export function createOfficialModuleStateBridge(
  request?: OfficialModuleStateBridgeRequest,
): OfficialModuleStateBridgeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "official module state bridge requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "official module state bridge requires a moduleId", "input");
  }

  if (isBlank(request.moduleKind)) {
    return failure("MISSING_MODULE_KIND", "official module state bridge requires a module kind", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "official modules can only read state from a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "official module state bridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "official module state bridge was rejected by governance",
      "governance",
    );
  }

  if (request.visibleState === undefined) {
    return failure("MISSING_STATE_SOURCE", "official module state bridge requires a visible runtime state source", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const moduleId = (request.moduleId ?? "").trim();
  const moduleKind = (request.moduleKind ?? "").trim();
  const mountedModuleIds = cleanList(request.mountedModuleIds);

  if (mountedModuleIds.length > 0 && !mountedModuleIds.includes(moduleId)) {
    return failure("MODULE_NOT_MOUNTED", "official module is not mounted on this runtime", "runtime-state");
  }

  const state = pickStateView(request.visibleState, request.requestedStateKeys);

  return {
    ok: true,
    view: {
      runtimeId,
      moduleId,
      moduleKind,
      ready: true,
      traceId: request.traceId?.trim() || undefined,
      exposedKeys: Object.keys(state),
      state,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.stateBridge.viewCreated"],
  };
}
