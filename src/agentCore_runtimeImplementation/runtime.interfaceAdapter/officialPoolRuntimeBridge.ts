/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 official Pool Runtime Bridge 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficialPoolRuntimeBridgeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "bridge"
  | "scope";

export type OfficialPoolRuntimeBridgeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type OfficialPoolRuntimeBridgeCaller = {
  kind: OfficialPoolRuntimeBridgeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type OfficialPoolRuntimeBridgeGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficialPoolModuleKind = "CMP" | "MP" | "TAP" | "multiagent" | (string & {});

export type OfficialPoolBridgeChannel =
  | "interface"
  | "rule"
  | "governance"
  | "invocation"
  | "inspection"
  | (string & {});

export type OfficialPoolModuleRef = {
  moduleId?: string;
  moduleKind?: OfficialPoolModuleKind;
  interfaceId?: string;
  ruleRef?: string;
  bridgeChannels?: readonly OfficialPoolBridgeChannel[];
  requestedScopes?: readonly string[];
};

export type OfficialPoolInput = {
  poolId?: string;
  modules?: readonly OfficialPoolModuleRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type OfficialPoolRuntimeBridgeRequest = {
  runtimeId?: string;
  caller?: OfficialPoolRuntimeBridgeCaller;
  bridgeId?: string;
  officialPool?: OfficialPoolInput;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  channelAvailability?: Partial<Record<OfficialPoolBridgeChannel, boolean>>;
  runtimeReady?: boolean;
  contract?: OfficialPoolRuntimeBridgeGate;
  governance?: OfficialPoolRuntimeBridgeGate;
  traceId?: string;
};

export type OfficialPoolRuntimeBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BRIDGE_ID"
  | "MISSING_OFFICIAL_POOL"
  | "MISSING_POOL_ID"
  | "EMPTY_OFFICIAL_MODULES"
  | "MISSING_MODULE_ID"
  | "MISSING_MODULE_KIND"
  | "MISSING_INTERFACE_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "CHANNEL_UNAVAILABLE";

export type OfficialPoolRuntimeBridgeError = {
  code: OfficialPoolRuntimeBridgeErrorCode;
  message: string;
  boundary: OfficialPoolRuntimeBridgeBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OfficialPoolRuntimeBridgeModule = {
  moduleId: string;
  moduleKind: OfficialPoolModuleKind;
  interfaceId: string;
  ruleRef?: string;
  bridgeChannels: readonly OfficialPoolBridgeChannel[];
  acceptedScopes: readonly string[];
};

export type OfficialPoolRuntimeBridgePlan = {
  bridgeId: string;
  runtimeId: string;
  poolId: string;
  caller: OfficialPoolRuntimeBridgeCaller;
  route: "runtime.interfaceAdapter.officialPoolRuntimeBridge";
  modules: readonly OfficialPoolRuntimeBridgeModule[];
  moduleIds: readonly string[];
  moduleKinds: readonly OfficialPoolModuleKind[];
  interfaceIds: readonly string[];
  channelNames: readonly OfficialPoolBridgeChannel[];
  metadata: Readonly<Record<string, unknown>>;
  traceId?: string;
  dispatch: "dry-run";
  mockableEnvelope: true;
  officialStrategyIncluded: false;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type OfficialPoolRuntimeBridgeResult =
  | {
      ok: true;
      plan: OfficialPoolRuntimeBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialPoolRuntimeBridgeError;
      events: readonly string[];
    };

export const officialPoolRuntimeBridgeDescriptor = {
  route: "runtime.interfaceAdapter.officialPoolRuntimeBridge",
  purpose: "bridge official module interface pool references into runtime.interfaceAdapter without executing module strategy",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList<T extends string>(values: readonly T[] | readonly string[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as T[];
}

function normalizeCaller(caller: OfficialPoolRuntimeBridgeCaller): OfficialPoolRuntimeBridgeCaller {
  const normalized: OfficialPoolRuntimeBridgeCaller = {
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
  code: OfficialPoolRuntimeBridgeErrorCode,
  message: string,
  boundary: OfficialPoolRuntimeBridgeBoundary,
): OfficialPoolRuntimeBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    events: ["runtime.interfaceAdapter.officialPoolRuntimeBridge.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | OfficialPoolRuntimeBridgeResult {
  const requested = cleanList<string>(requestedScopes);
  const allowed = cleanList<string>(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `officialPoolRuntimeBridge scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function unavailableChannel(
  modules: readonly OfficialPoolRuntimeBridgeModule[],
  availability: Partial<Record<OfficialPoolBridgeChannel, boolean>> | undefined,
): OfficialPoolBridgeChannel | undefined {
  return modules.flatMap((moduleRef) => moduleRef.bridgeChannels).find((channel) => availability?.[channel] === false);
}

function normalizeModule(
  moduleRef: OfficialPoolModuleRef,
  index: number,
  poolScopes: readonly string[],
): OfficialPoolRuntimeBridgeModule | OfficialPoolRuntimeBridgeResult {
  const moduleId = moduleRef.moduleId?.trim();
  const moduleKind = moduleRef.moduleKind?.trim() as OfficialPoolModuleKind | undefined;
  const interfaceId = moduleRef.interfaceId?.trim();

  if (!hasText(moduleId)) {
    return failure("MISSING_MODULE_ID", `official pool module ${index + 1} requires a moduleId`, "bridge");
  }

  if (!hasText(moduleKind)) {
    return failure("MISSING_MODULE_KIND", `official pool module ${moduleId} requires a module kind`, "bridge");
  }

  if (!hasText(interfaceId)) {
    return failure("MISSING_INTERFACE_ID", `official pool module ${moduleId} requires an interfaceId`, "bridge");
  }

  const moduleScopes = cleanList<string>(moduleRef.requestedScopes);
  const deniedScope = moduleScopes.find((scope) => !poolScopes.includes(scope));
  if (deniedScope !== undefined) {
    return failure(
      "SCOPE_DENIED",
      `official pool module ${moduleId} requested scope ${deniedScope} outside bridge scope`,
      "scope",
    );
  }

  const bridgeChannels = cleanList<OfficialPoolBridgeChannel>(moduleRef.bridgeChannels);

  return {
    moduleId,
    moduleKind,
    interfaceId,
    ruleRef: moduleRef.ruleRef?.trim() || undefined,
    bridgeChannels: bridgeChannels.length > 0 ? bridgeChannels : ["interface", "governance"],
    acceptedScopes: moduleScopes,
  };
}

export function createOfficialPoolRuntimeBridge(
  request?: OfficialPoolRuntimeBridgeRequest,
): OfficialPoolRuntimeBridgeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "officialPoolRuntimeBridge requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "officialPoolRuntimeBridge requires a caller", "input");
  }

  if (!hasText(request.bridgeId)) {
    return failure("MISSING_BRIDGE_ID", "officialPoolRuntimeBridge requires a bridgeId", "input");
  }

  if (request.officialPool === undefined) {
    return failure("MISSING_OFFICIAL_POOL", "officialPoolRuntimeBridge requires an official pool input", "input");
  }

  if (!hasText(request.officialPool.poolId)) {
    return failure("MISSING_POOL_ID", "officialPoolRuntimeBridge requires a stable official pool id", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "officialPoolRuntimeBridge can only plan against a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "officialPoolRuntimeBridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "officialPoolRuntimeBridge was rejected by governance",
      "governance",
    );
  }

  const bridgeScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in bridgeScopes) {
    return bridgeScopes;
  }

  const modules: OfficialPoolRuntimeBridgeModule[] = [];
  for (const [index, moduleRef] of (request.officialPool.modules ?? []).entries()) {
    const modulePlan = normalizeModule(moduleRef, index, bridgeScopes);
    if ("ok" in modulePlan) {
      return modulePlan;
    }

    modules.push(modulePlan);
  }

  if (modules.length === 0) {
    return failure(
      "EMPTY_OFFICIAL_MODULES",
      "officialPoolRuntimeBridge requires at least one official module interface reference",
      "bridge",
    );
  }

  const unavailable = unavailableChannel(modules, request.channelAvailability);
  if (unavailable !== undefined) {
    return failure(
      "CHANNEL_UNAVAILABLE",
      `officialPoolRuntimeBridge channel is unavailable: ${unavailable}`,
      "runtime-state",
    );
  }

  return {
    ok: true,
    plan: {
      bridgeId: request.bridgeId.trim(),
      runtimeId: request.runtimeId.trim(),
      poolId: request.officialPool.poolId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.interfaceAdapter.officialPoolRuntimeBridge",
      modules,
      moduleIds: [...new Set(modules.map((moduleRef) => moduleRef.moduleId))],
      moduleKinds: [...new Set(modules.map((moduleRef) => moduleRef.moduleKind))],
      interfaceIds: [...new Set(modules.map((moduleRef) => moduleRef.interfaceId))],
      channelNames: [...new Set(modules.flatMap((moduleRef) => moduleRef.bridgeChannels))],
      metadata: request.officialPool.metadata ?? {},
      traceId: request.traceId?.trim() || undefined,
      dispatch: "dry-run",
      mockableEnvelope: true,
      officialStrategyIncluded: false,
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.interfaceAdapter.officialPoolRuntimeBridge.planned"],
  };
}
