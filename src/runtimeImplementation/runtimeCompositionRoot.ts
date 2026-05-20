/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Composition Root 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const runtimeCompositionRootSurface = "runtime.compositionRoot" as const;

export type RuntimeCompositionRootBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "composition"
  | "scope";

export type RuntimeCompositionRootCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type RuntimeCompositionRootCaller = {
  kind: RuntimeCompositionRootCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type RuntimeCompositionRootGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeCompositionSurfaceName =
  | "runtime.applicationSurface"
  | "runtime.officialModuleSurface"
  | "runtime.contractSurface"
  | "runtime.governancePlane"
  | "runtime.invocationMethod"
  | "runtime.inspection"
  | "runtime.debug"
  | "runtime.execEngine"
  | "runtime.modelAdapter"
  | "runtime.interfaceAdapter"
  | (string & {});

export type RuntimeCompositionSurfaceInput = {
  surface?: RuntimeCompositionSurfaceName;
  bindingId?: string;
  ready?: boolean;
  capabilities?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeCompositionRootRequest = {
  runtimeId?: string;
  caller?: RuntimeCompositionRootCaller;
  surfaces?: readonly RuntimeCompositionSurfaceInput[];
  requiredSurfaces?: readonly RuntimeCompositionSurfaceName[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeCompositionRootGate;
  governance?: RuntimeCompositionRootGate;
};

export type RuntimeCompositionRootErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CALLER_ID"
  | "MISSING_SURFACES"
  | "MISSING_SURFACE_NAME"
  | "MISSING_SURFACE_BINDING_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SURFACE_NOT_READY"
  | "REQUIRED_SURFACE_MISSING"
  | "SCOPE_DENIED";

export type RuntimeCompositionRootError = {
  code: RuntimeCompositionRootErrorCode;
  message: string;
  boundary: RuntimeCompositionRootBoundary;
  publicSafe: true;
};

export type RuntimeCompositionSurfaceBinding = {
  surface: RuntimeCompositionSurfaceName;
  bindingId: string;
  ready: true;
  capabilities: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimeCompositionRootSnapshot = {
  runtimeId: string;
  caller: RuntimeCompositionRootCaller;
  surface: typeof runtimeCompositionRootSurface;
  phase: "composed";
  surfaces: readonly RuntimeCompositionSurfaceBinding[];
  surfaceNames: readonly RuntimeCompositionSurfaceName[];
  bindingIds: readonly string[];
  requiredSurfaces: readonly RuntimeCompositionSurfaceName[];
  acceptedScopes: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeCompositionRootResult =
  | {
      ok: true;
      composition: RuntimeCompositionRootSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeCompositionRootError;
      events: readonly string[];
    };

const defaultRequiredSurfaces = [
  "runtime.contractSurface",
  "runtime.governancePlane",
  "runtime.invocationMethod",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function requireTrimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value): value is T => value.length > 0))];
}

function failure(
  code: RuntimeCompositionRootErrorCode,
  message: string,
  boundary: RuntimeCompositionRootBoundary,
): RuntimeCompositionRootResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.compositionRoot.rejected"],
  };
}

function normalizeCaller(caller: RuntimeCompositionRootCaller): RuntimeCompositionRootCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

function normalizeSurface(
  surfaceInput: RuntimeCompositionSurfaceInput,
): RuntimeCompositionSurfaceBinding | RuntimeCompositionRootResult {
  const surfaceText = requireTrimmed(surfaceInput.surface);
  const bindingId = requireTrimmed(surfaceInput.bindingId);

  if (surfaceText.length === 0) {
    return failure("MISSING_SURFACE_NAME", "runtime composition root requires every binding to name a surface", "composition");
  }

  const surface = surfaceText as RuntimeCompositionSurfaceName;

  if (bindingId.length === 0) {
    return failure(
      "MISSING_SURFACE_BINDING_ID",
      `runtime composition root requires a bindingId for ${surface}`,
      "composition",
    );
  }

  if (surfaceInput.ready === false) {
    return failure("SURFACE_NOT_READY", `runtime composition surface ${surface} is not ready`, "runtime-state");
  }

  return {
    surface,
    bindingId,
    ready: true,
    capabilities: cleanList(surfaceInput.capabilities),
    metadata: surfaceInput.metadata ?? {},
  };
}

function acceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeCompositionRootResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `runtime composition root scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

export function createRuntimeCompositionRoot(request?: RuntimeCompositionRootRequest): RuntimeCompositionRootResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime composition root requires a runtimeId", "input");
  }

  const runtimeId = requireTrimmed(request.runtimeId);

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "runtime composition root requires a caller surface", "input");
  }

  if (isBlank(request.caller.id)) {
    return failure("MISSING_CALLER_ID", "runtime composition root caller requires a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime composition root can only compose a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime composition root was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime composition root was rejected by governance",
      "governance",
    );
  }

  if ((request.surfaces ?? []).length === 0) {
    return failure("MISSING_SURFACES", "runtime composition root requires explicitly injected runtime surfaces", "input");
  }

  const scopes = acceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in scopes) {
    return scopes;
  }

  const surfaces: RuntimeCompositionSurfaceBinding[] = [];
  for (const surfaceInput of request.surfaces ?? []) {
    const normalized = normalizeSurface(surfaceInput);
    if ("ok" in normalized) {
      return normalized;
    }

    surfaces.push(normalized);
  }

  const surfaceNames = surfaces.map((surface) => surface.surface);
  const requiredSurfaces = cleanList(request.requiredSurfaces);
  const effectiveRequiredSurfaces =
    requiredSurfaces.length > 0 ? requiredSurfaces : defaultRequiredSurfaces;
  const missingRequiredSurfaces = effectiveRequiredSurfaces.filter((surface) => !surfaceNames.includes(surface));

  if (missingRequiredSurfaces.length > 0) {
    return failure(
      "REQUIRED_SURFACE_MISSING",
      `runtime composition root is missing required surfaces: ${missingRequiredSurfaces.join(", ")}`,
      "composition",
    );
  }

  return {
    ok: true,
    composition: {
      runtimeId,
      caller: normalizeCaller(request.caller),
      surface: runtimeCompositionRootSurface,
      phase: "composed",
      surfaces,
      surfaceNames,
      bindingIds: surfaces.map((surface) => surface.bindingId),
      requiredSurfaces: effectiveRequiredSurfaces,
      acceptedScopes: scopes,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.compositionRoot.composed"],
  };
}
