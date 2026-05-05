/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Management Plane 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeManagementBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "management-surface"
  | "scope";

export type RuntimeManagementCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "operator"
  | "inspection"
  | "debug"
  | "test";

export type RuntimeManagementCaller = {
  kind: RuntimeManagementCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type RuntimeManagementGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeManagementSurface =
  | "runtimeManagementPlane"
  | "operatorConsole"
  | "commandRouter"
  | "policyGate"
  | "resourceGovernor"
  | "mutationPlanner"
  | "rollbackController"
  | "governanceBridge"
  | "accessSession"
  | (string & {});

export type RuntimeManagementComponentInput = {
  surface?: RuntimeManagementSurface;
  componentId?: string;
  ready?: boolean;
  capabilities?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeManagementComponent = {
  surface: RuntimeManagementSurface;
  componentId: string;
  ready: true;
  capabilities: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimeManagementErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_COMPONENTS"
  | "MISSING_COMPONENT_SURFACE"
  | "MISSING_COMPONENT_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "COMPONENT_NOT_READY"
  | "SCOPE_DENIED";

export type RuntimeManagementError = {
  code: RuntimeManagementErrorCode;
  message: string;
  boundary: RuntimeManagementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type RuntimeManagementHandle = {
  runtimeId: string;
  caller: RuntimeManagementCaller;
  route: "runtime.managementPlane";
  phase: "ready";
  components: readonly RuntimeManagementComponent[];
  componentIds: readonly string[];
  surfaces: readonly RuntimeManagementSurface[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  governanceChecked: true;
  contractChecked: true;
  auditRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeManagementPlaneRequest = {
  runtimeId?: string;
  caller?: RuntimeManagementCaller;
  components?: readonly RuntimeManagementComponentInput[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeManagementGate;
  governance?: RuntimeManagementGate;
};

export type RuntimeManagementPlaneResult =
  | {
      ok: true;
      managementPlane: RuntimeManagementHandle;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeManagementError;
      events: readonly string[];
    };

export function hasRuntimeManagementText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function cleanRuntimeManagementList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function createRuntimeManagementError(
  code: RuntimeManagementErrorCode,
  message: string,
  boundary: RuntimeManagementBoundary,
): RuntimeManagementError {
  return {
    code,
    message,
    boundary,
    publicSafe: true,
    internalDetailExposed: false,
  };
}

function rejectRuntimeManagementPlane(
  code: RuntimeManagementErrorCode,
  message: string,
  boundary: RuntimeManagementBoundary,
): RuntimeManagementPlaneResult {
  return {
    ok: false,
    error: createRuntimeManagementError(code, message, boundary),
    events: ["runtime.managementPlane.rejected"],
  };
}

function normalizeCaller(caller: RuntimeManagementCaller): RuntimeManagementCaller {
  const normalized: RuntimeManagementCaller = {
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

function normalizeComponent(
  component: RuntimeManagementComponentInput,
): RuntimeManagementComponent | RuntimeManagementPlaneResult {
  const surface = component.surface?.trim();
  const componentId = component.componentId?.trim();

  if (!hasRuntimeManagementText(surface)) {
    return rejectRuntimeManagementPlane(
      "MISSING_COMPONENT_SURFACE",
      "runtime management components require a management surface",
      "management-surface",
    );
  }

  if (!hasRuntimeManagementText(componentId)) {
    return rejectRuntimeManagementPlane(
      "MISSING_COMPONENT_ID",
      "runtime management components require a componentId",
      "management-surface",
    );
  }

  if (component.ready === false) {
    return rejectRuntimeManagementPlane(
      "COMPONENT_NOT_READY",
      `runtime management component ${componentId} is not ready`,
      "runtime-state",
    );
  }

  return {
    surface,
    componentId,
    ready: true,
    capabilities: cleanRuntimeManagementList(component.capabilities),
    metadata: component.metadata ?? {},
  };
}

export function createRuntimeManagementPlane(
  request?: RuntimeManagementPlaneRequest,
): RuntimeManagementPlaneResult {
  if (request === undefined || !hasRuntimeManagementText(request.runtimeId)) {
    return rejectRuntimeManagementPlane("MISSING_RUNTIME_ID", "runtime management plane requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasRuntimeManagementText(request.caller.id)) {
    return rejectRuntimeManagementPlane(
      "MISSING_CALLER",
      "runtime management plane requires an application, module, operator, or runtime caller",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeManagementPlane(
      "RUNTIME_NOT_READY",
      "runtime management plane can only expose controls for a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeManagementPlane(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime management plane was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeManagementPlane(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime management plane was rejected by governance",
      "governance",
    );
  }

  if ((request.components ?? []).length === 0) {
    return rejectRuntimeManagementPlane(
      "MISSING_COMPONENTS",
      "runtime management plane requires at least one narrow management component",
      "input",
    );
  }

  const requestedScopes = cleanRuntimeManagementList(request.requestedScopes);
  const allowedScopes = cleanRuntimeManagementList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return rejectRuntimeManagementPlane(
      "SCOPE_DENIED",
      `runtime management plane includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const components: RuntimeManagementComponent[] = [];
  for (const component of request.components ?? []) {
    const normalized = normalizeComponent(component);
    if ("ok" in normalized) {
      return normalized;
    }

    components.push(normalized);
  }

  return {
    ok: true,
    managementPlane: {
      runtimeId: request.runtimeId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.managementPlane",
      phase: "ready",
      components,
      componentIds: components.map((component) => component.componentId),
      surfaces: components.map((component) => component.surface),
      requestedScopes,
      grantedScopes,
      governanceChecked: true,
      contractChecked: true,
      auditRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.managementPlane.ready"],
  };
}
