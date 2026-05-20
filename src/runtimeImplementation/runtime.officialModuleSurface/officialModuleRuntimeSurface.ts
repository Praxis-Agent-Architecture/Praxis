/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：作为 CMP、MP、TAP、multiagent 等官方模块接入 runtime 的主入口。
 * 能力要求1：这些模块不是外部插件，而是 Praxis 内置正式模块。
 * 能力要求2：本文件需要给它们提供统一、受治理、可演进的 runtime 使用方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficialModuleKind = "cmp" | "mp" | "tap" | "multiagent" | (string & {});

export type OfficialModuleRuntimeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type OfficialModuleRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficialModuleIdentity = {
  moduleId: string;
  moduleKind: OfficialModuleKind;
};

export type OfficialModuleRuntimeError = {
  code: string;
  message: string;
  boundary: OfficialModuleRuntimeBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OfficialModuleRuntimeSurfaceRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: OfficialModuleKind;
  requestedCapabilities?: readonly string[];
  requestedEvents?: readonly string[];
  requestedScopes?: readonly string[];
  grantedRuntimeScopes?: readonly string[];
  inheritedRuntimePolicyId?: string;
  modulePolicyExtensions?: readonly string[];
  runtimeReady?: boolean;
  contract?: OfficialModuleRuntimeGate;
  governance?: OfficialModuleRuntimeGate;
};

export type OfficialModuleRuntimeBridgeAccess = {
  governance: "runtime.officialModuleSurface.officialModuleGovernancePort";
  events: "runtime.officialModuleSurface.officialModuleEventBus";
  state: "runtime.officialModuleSurface.officialModuleStateBridge";
  invocation: "runtime.invocationMethod";
};

export type OfficialModuleRuntimeSurface = {
  runtimeId: string;
  module: OfficialModuleIdentity;
  requestedCapabilities: readonly string[];
  requestedEvents: readonly string[];
  requestedScopes: readonly string[];
  grantedRuntimeScopes: readonly string[];
  policy: {
    inheritsRuntimePolicy: true;
    inheritedRuntimePolicyId: string;
    modulePolicyExtensions: readonly string[];
    canExtendPolicy: true;
    canBypassRuntimePolicy: false;
  };
  bridgeAccess: OfficialModuleRuntimeBridgeAccess;
  entrySurface: "runtime.officialModuleSurface";
  dispatch: "dry-run";
  unsafeSideEffects: false;
  hiddenResourceAccess: false;
  canRequestCapability: (capability: string) => boolean;
  canSubscribeEvent: (eventType: string) => boolean;
  canUseScope: (scope: string) => boolean;
};

export type OfficialModuleRuntimeSurfaceResult =
  | {
      ok: true;
      surface: OfficialModuleRuntimeSurface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function firstDeniedScope(requestedScopes: readonly string[], grantedRuntimeScopes: readonly string[]): string | undefined {
  if (grantedRuntimeScopes.length === 0) {
    return undefined;
  }

  return requestedScopes.find((scope) => !grantedRuntimeScopes.includes(scope));
}

export function createOfficialModuleRuntimeError(
  code: string,
  message: string,
  boundary: OfficialModuleRuntimeBoundary,
): OfficialModuleRuntimeError {
  return {
    code,
    message,
    boundary,
    publicSafe: true,
    internalDetailExposed: false,
  };
}

function failure(
  code: string,
  message: string,
  boundary: OfficialModuleRuntimeBoundary,
): OfficialModuleRuntimeSurfaceResult {
  return {
    ok: false,
    error: createOfficialModuleRuntimeError(code, message, boundary),
    events: ["runtime.officialModuleSurface.rejected"],
  };
}

export function createOfficialModuleRuntimeSurface(
  request?: OfficialModuleRuntimeSurfaceRequest,
): OfficialModuleRuntimeSurfaceResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "official module runtime surface requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "official module runtime surface requires a moduleId", "input");
  }

  if (isBlank(request.moduleKind)) {
    return failure("MISSING_MODULE_KIND", "official module runtime surface requires a module kind", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "official modules can only enter through a ready runtime surface",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "official module runtime surface was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "official module runtime surface was rejected by governance",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const moduleId = (request.moduleId ?? "").trim();
  const moduleKind = (request.moduleKind ?? "").trim() as OfficialModuleKind;
  const requestedCapabilities = cleanList(request.requestedCapabilities);
  const requestedEvents = cleanList(request.requestedEvents);
  const requestedScopes = cleanList(request.requestedScopes);
  const grantedRuntimeScopes = cleanList(request.grantedRuntimeScopes);
  const deniedScope = firstDeniedScope(requestedScopes, grantedRuntimeScopes);

  if (deniedScope !== undefined) {
    return failure(
      "SCOPE_DENIED",
      `official module requested scope outside governed runtime grant: ${deniedScope}`,
      "scope",
    );
  }

  return {
    ok: true,
    surface: {
      runtimeId,
      module: {
        moduleId,
        moduleKind,
      },
      requestedCapabilities,
      requestedEvents,
      requestedScopes,
      grantedRuntimeScopes,
      policy: {
        inheritsRuntimePolicy: true,
        inheritedRuntimePolicyId: request.inheritedRuntimePolicyId?.trim() || "runtime.policy.standard",
        modulePolicyExtensions: cleanList(request.modulePolicyExtensions),
        canExtendPolicy: true,
        canBypassRuntimePolicy: false,
      },
      bridgeAccess: {
        governance: "runtime.officialModuleSurface.officialModuleGovernancePort",
        events: "runtime.officialModuleSurface.officialModuleEventBus",
        state: "runtime.officialModuleSurface.officialModuleStateBridge",
        invocation: "runtime.invocationMethod",
      },
      entrySurface: "runtime.officialModuleSurface",
      dispatch: "dry-run",
      unsafeSideEffects: false,
      hiddenResourceAccess: false,
      canRequestCapability(capability: string): boolean {
        const normalized = capability.trim();
        return normalized.length > 0 && (requestedCapabilities.length === 0 || requestedCapabilities.includes(normalized));
      },
      canSubscribeEvent(eventType: string): boolean {
        const normalized = eventType.trim();
        return normalized.length > 0 && (requestedEvents.length === 0 || requestedEvents.includes(normalized));
      },
      canUseScope(scope: string): boolean {
        const normalized = scope.trim();
        return normalized.length > 0 && (grantedRuntimeScopes.length === 0 || grantedRuntimeScopes.includes(normalized));
      },
    },
    events: ["runtime.officialModuleSurface.created"],
  };
}
