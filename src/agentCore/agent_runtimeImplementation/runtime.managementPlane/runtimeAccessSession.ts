/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Access Session 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeAccessSessionActorKind =
  | "application"
  | "official-module"
  | "operator"
  | "runtime-surface"
  | "external-control";

export type RuntimeAccessSessionBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "session";

export type RuntimeAccessSessionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTOR"
  | "MISSING_ACTOR_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "SESSION_EXPIRED";

export type RuntimeAccessSessionGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeAccessSessionActor = {
  kind: RuntimeAccessSessionActorKind;
  id: string;
  moduleId?: string;
  displayName?: string;
};

export type RuntimeAccessSessionRequest = {
  runtimeId?: string;
  actor?: RuntimeAccessSessionActor;
  sessionId?: string;
  requestedScopes?: readonly string[];
  grantedScopes?: readonly string[];
  deniedScopes?: readonly string[];
  issuedAt?: string;
  expiresAt?: string;
  runtimeReady?: boolean;
  contract?: RuntimeAccessSessionGate;
  governance?: RuntimeAccessSessionGate;
};

export type RuntimeAccessSession = {
  sessionId: string;
  runtimeId: string;
  actor: RuntimeAccessSessionActor;
  scopes: readonly string[];
  requestedScopes: readonly string[];
  deniedScopes: readonly string[];
  issuedAt?: string;
  expiresAt?: string;
  active: true;
  dryRunOnly: true;
  unsafeSideEffects: false;
};

export type RuntimeAccessSessionError = {
  code: RuntimeAccessSessionErrorCode;
  message: string;
  boundary: RuntimeAccessSessionBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeAccessSessionResult =
  | {
      ok: true;
      session: RuntimeAccessSession;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeAccessSessionError;
      events: readonly string[];
    };

export const runtimeAccessSessionDescriptor = {
  surface: "runtime.managementPlane",
  capability: "runtimeAccessSession",
  purpose: "create a narrow, auditable management access session for runtime control surfaces",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

const defaultScopesByActorKind: Record<RuntimeAccessSessionActorKind, readonly string[]> = {
  application: ["runtime.read", "runtime.invoke"],
  "official-module": ["runtime.read", "module.requestGovernance"],
  operator: ["runtime.read", "runtime.inspect", "runtime.manage"],
  "runtime-surface": ["runtime.read", "runtime.coordinate"],
  "external-control": ["runtime.read"],
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeAccessSessionErrorCode,
  message: string,
  boundary: RuntimeAccessSessionBoundary,
): RuntimeAccessSessionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForApplication: true,
      internalDetailExposed: false,
    },
    events: ["runtime.management.accessSession.rejected"],
  };
}

function sessionExpired(expiresAt: string | undefined, nowIso: string): boolean {
  if (isBlank(expiresAt)) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt ?? "");
  const nowMs = Date.parse(nowIso);

  if (Number.isNaN(expiresAtMs) || Number.isNaN(nowMs)) {
    return false;
  }

  return expiresAtMs <= nowMs;
}

export function isRuntimeAccessSessionActive(session: RuntimeAccessSession, nowIso = new Date(0).toISOString()): boolean {
  return session.active && !sessionExpired(session.expiresAt, nowIso);
}

export function createRuntimeAccessSession(request: RuntimeAccessSessionRequest = {}): RuntimeAccessSessionResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime access session requires a runtimeId", "input");
  }

  if (request.actor === undefined) {
    return failure("MISSING_ACTOR", "runtime access session requires an actor", "input");
  }

  if (isBlank(request.actor.id)) {
    return failure("MISSING_ACTOR_ID", "runtime access session actor requires a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime access session requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the access session",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the access session",
      "governance",
    );
  }

  if (sessionExpired(request.expiresAt, request.issuedAt ?? new Date(0).toISOString())) {
    return failure("SESSION_EXPIRED", "runtime access session expiry is not after its issuedAt", "session");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const deniedScopes = cleanList(request.deniedScopes);
  const grantedScopes = cleanList(request.grantedScopes);
  const baseScopes = grantedScopes.length > 0 ? grantedScopes : defaultScopesByActorKind[request.actor.kind];
  const scopes = cleanList(baseScopes).filter((scope) => !deniedScopes.includes(scope));
  const requestedScopes = cleanList(request.requestedScopes);
  const missingScopes = requestedScopes.filter((scope) => !scopes.includes(scope));

  if (missingScopes.length > 0) {
    return failure("SCOPE_DENIED", `runtime access session is missing scope: ${missingScopes.join(", ")}`, "scope");
  }

  return {
    ok: true,
    session: {
      sessionId:
        request.sessionId?.trim() ||
        `runtime-access:${runtimeId}:${request.actor.kind}:${request.actor.id.trim()}`,
      runtimeId,
      actor: {
        kind: request.actor.kind,
        id: request.actor.id.trim(),
        moduleId: request.actor.moduleId?.trim() || undefined,
        displayName: request.actor.displayName?.trim() || undefined,
      },
      scopes,
      requestedScopes,
      deniedScopes,
      issuedAt: request.issuedAt?.trim() || undefined,
      expiresAt: request.expiresAt?.trim() || undefined,
      active: true,
      dryRunOnly: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.management.accessSession.created"],
  };
}
