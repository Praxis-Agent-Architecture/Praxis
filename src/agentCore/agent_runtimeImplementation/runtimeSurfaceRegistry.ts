/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Surface Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeSurfaceRegistryCaller =
  | "application"
  | "official-module"
  | "runtime"
  | "management"
  | "inspection"
  | "debug";

export type RuntimeSurfaceKind =
  | "applicationSurface"
  | "officialModuleSurface"
  | "contractSurface"
  | "governancePlane"
  | "invocationMethod"
  | "inspection"
  | "debug"
  | "selfRepair"
  | "adaptiveRuntime"
  | "managementPlane"
  | "behaviorExposure"
  | "capabilityExposure"
  | "modeExposure"
  | "externalControl"
  | "execEngine"
  | "modelAdapter"
  | "interfaceAdapter"
  | (string & {});

export type RuntimeSurfaceRegistryBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "registry"
  | "scope";

export type RuntimeSurfaceRegistryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SURFACES"
  | "MISSING_SURFACE_ID"
  | "DUPLICATE_SURFACE_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SURFACE_NOT_REGISTERED"
  | "SURFACE_NOT_MOUNTED"
  | "SURFACE_NOT_READY"
  | "SURFACE_SCOPE_DENIED"
  | "CALLER_NOT_ALLOWED";

export type RuntimeSurfaceRegistryGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeSurfaceDescriptor = {
  surfaceId?: string;
  kind?: RuntimeSurfaceKind;
  owner?: string;
  mounted?: boolean;
  ready?: boolean;
  required?: boolean;
  capabilities?: readonly string[];
  scopes?: readonly string[];
  callers?: readonly RuntimeSurfaceRegistryCaller[];
  contract?: RuntimeSurfaceRegistryGate;
  governance?: RuntimeSurfaceRegistryGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RegisteredRuntimeSurface = {
  surfaceId: string;
  kind: RuntimeSurfaceKind;
  owner?: string;
  mounted: boolean;
  ready: boolean;
  required: boolean;
  capabilities: readonly string[];
  scopes: readonly string[];
  callers: readonly RuntimeSurfaceRegistryCaller[];
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimeSurfaceRegistryError = {
  code: RuntimeSurfaceRegistryErrorCode;
  message: string;
  boundary: RuntimeSurfaceRegistryBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeSurfaceResolveRequest = {
  surfaceId?: string;
  caller?: RuntimeSurfaceRegistryCaller;
  requestedScopes?: readonly string[];
};

export type RuntimeSurfaceResolveResult =
  | {
      ok: true;
      surface: RegisteredRuntimeSurface;
      grantedScopes: readonly string[];
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeSurfaceRegistryError;
      events: readonly string[];
    };

export type RuntimeSurfaceRegistry = {
  runtimeId: string;
  registrySurface: "runtimeSurfaceRegistry";
  surfaces: readonly RegisteredRuntimeSurface[];
  requiredSurfaceIds: readonly string[];
  readySurfaceIds: readonly string[];
  missingRequiredSurfaceIds: readonly string[];
  degradedSurfaceIds: readonly string[];
  dryRun: true;
  unsafeSideEffects: false;
  contractChecked: true;
  governanceChecked: true;
  has: (surfaceId: string) => boolean;
  resolve: (request: RuntimeSurfaceResolveRequest) => RuntimeSurfaceResolveResult;
};

export type RuntimeSurfaceRegistryRequest = {
  runtimeId?: string;
  surfaces?: readonly RuntimeSurfaceDescriptor[];
  runtimeReady?: boolean;
  contract?: RuntimeSurfaceRegistryGate;
  governance?: RuntimeSurfaceRegistryGate;
};

export type RuntimeSurfaceRegistryResult =
  | {
      ok: true;
      registry: RuntimeSurfaceRegistry;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeSurfaceRegistryError;
      events: readonly string[];
    };

export const runtimeSurfaceRegistryCapability = {
  surface: "agent_runtimeImplementation",
  capability: "runtimeSurfaceRegistry",
  purpose: "register and resolve runtime surfaces without touching execution, model, or interface internals",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanCallers(
  callers: readonly RuntimeSurfaceRegistryCaller[] | undefined,
): readonly RuntimeSurfaceRegistryCaller[] {
  return [...new Set(callers ?? [])];
}

function registryError(
  code: RuntimeSurfaceRegistryErrorCode,
  message: string,
  boundary: RuntimeSurfaceRegistryBoundary,
): RuntimeSurfaceRegistryError {
  return {
    code,
    message,
    boundary,
    safeForRuntimeInspection: true,
    internalDetailExposed: false,
  };
}

function failure(
  code: RuntimeSurfaceRegistryErrorCode,
  message: string,
  boundary: RuntimeSurfaceRegistryBoundary,
  event = "runtime.surfaceRegistry.rejected",
): RuntimeSurfaceRegistryResult {
  return {
    ok: false,
    error: registryError(code, message, boundary),
    events: [event],
  };
}

function resolveFailure(
  code: RuntimeSurfaceRegistryErrorCode,
  message: string,
  boundary: RuntimeSurfaceRegistryBoundary,
): RuntimeSurfaceResolveResult {
  return {
    ok: false,
    error: registryError(code, message, boundary),
    events: ["runtime.surfaceRegistry.resolve.rejected"],
  };
}

function normalizeSurface(descriptor: RuntimeSurfaceDescriptor): RegisteredRuntimeSurface | RuntimeSurfaceRegistryResult {
  const surfaceId = descriptor.surfaceId?.trim();

  if (isBlank(surfaceId)) {
    return failure("MISSING_SURFACE_ID", "runtime surface registry entries require a surfaceId", "input");
  }

  if (descriptor.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      descriptor.contract.reason ?? `runtime surface ${surfaceId} was rejected by contract surface`,
      "contract",
    );
  }

  if (descriptor.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      descriptor.governance.reason ?? `runtime surface ${surfaceId} was rejected by governance`,
      "governance",
    );
  }

  return {
    surfaceId: surfaceId ?? "",
    kind: descriptor.kind ?? "runtime",
    owner: descriptor.owner?.trim() || undefined,
    mounted: descriptor.mounted !== false,
    ready: descriptor.ready !== false,
    required: descriptor.required !== false,
    capabilities: cleanList(descriptor.capabilities),
    scopes: cleanList(descriptor.scopes),
    callers: cleanCallers(descriptor.callers),
    metadata: descriptor.metadata ?? {},
  };
}

function grantedScopes(
  requestedScopes: readonly string[] | undefined,
  surfaceScopes: readonly string[],
): readonly string[] | RuntimeSurfaceResolveResult {
  const requested = cleanList(requestedScopes);
  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !surfaceScopes.includes(scope));
  if (denied.length > 0) {
    return resolveFailure("SURFACE_SCOPE_DENIED", `runtime surface scope ${denied[0]} is not registered`, "scope");
  }

  return requested;
}

function callerAllowed(
  caller: RuntimeSurfaceRegistryCaller | undefined,
  allowedCallers: readonly RuntimeSurfaceRegistryCaller[],
): boolean {
  return caller === undefined || allowedCallers.length === 0 || allowedCallers.includes(caller);
}

export function createRuntimeSurfaceRegistry(
  request: RuntimeSurfaceRegistryRequest = {},
): RuntimeSurfaceRegistryResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime surface registry requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime surface registry requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime surface registry was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime surface registry was rejected by governance",
      "governance",
    );
  }

  if ((request.surfaces ?? []).length === 0) {
    return failure("MISSING_SURFACES", "runtime surface registry requires at least one surface descriptor", "input");
  }

  const surfaces: RegisteredRuntimeSurface[] = [];
  const seenSurfaceIds = new Set<string>();

  for (const descriptor of request.surfaces ?? []) {
    const normalized = normalizeSurface(descriptor);
    if ("ok" in normalized) {
      return normalized;
    }

    if (seenSurfaceIds.has(normalized.surfaceId)) {
      return failure(
        "DUPLICATE_SURFACE_ID",
        `runtime surface ${normalized.surfaceId} is registered more than once`,
        "registry",
      );
    }

    seenSurfaceIds.add(normalized.surfaceId);
    surfaces.push(normalized);
  }

  const requiredSurfaceIds = surfaces.filter((surface) => surface.required).map((surface) => surface.surfaceId);
  const readySurfaceIds = surfaces
    .filter((surface) => surface.mounted && surface.ready)
    .map((surface) => surface.surfaceId);
  const missingRequiredSurfaceIds = surfaces
    .filter((surface) => surface.required && !surface.mounted)
    .map((surface) => surface.surfaceId);
  const degradedSurfaceIds = surfaces
    .filter((surface) => surface.mounted && !surface.ready)
    .map((surface) => surface.surfaceId);

  const registry: RuntimeSurfaceRegistry = {
    runtimeId: (request.runtimeId ?? "").trim(),
    registrySurface: "runtimeSurfaceRegistry",
    surfaces,
    requiredSurfaceIds,
    readySurfaceIds,
    missingRequiredSurfaceIds,
    degradedSurfaceIds,
    dryRun: true,
    unsafeSideEffects: false,
    contractChecked: true,
    governanceChecked: true,
    has(surfaceId: string): boolean {
      const cleanSurfaceId = surfaceId.trim();
      return surfaces.some((surface) => surface.surfaceId === cleanSurfaceId);
    },
    resolve(resolveRequest: RuntimeSurfaceResolveRequest): RuntimeSurfaceResolveResult {
      const surfaceId = resolveRequest.surfaceId?.trim();
      if (isBlank(surfaceId)) {
        return resolveFailure("MISSING_SURFACE_ID", "runtime surface registry resolve requires a surfaceId", "input");
      }

      const surface = surfaces.find((candidate) => candidate.surfaceId === surfaceId);
      if (surface === undefined) {
        return resolveFailure("SURFACE_NOT_REGISTERED", `runtime surface ${surfaceId} is not registered`, "registry");
      }

      if (!surface.mounted) {
        return resolveFailure("SURFACE_NOT_MOUNTED", `runtime surface ${surfaceId} is not mounted`, "runtime-state");
      }

      if (!surface.ready) {
        return resolveFailure("SURFACE_NOT_READY", `runtime surface ${surfaceId} is not ready`, "runtime-state");
      }

      if (!callerAllowed(resolveRequest.caller, surface.callers)) {
        return resolveFailure("CALLER_NOT_ALLOWED", `runtime surface ${surfaceId} is not exposed to this caller`, "scope");
      }

      const scopes = grantedScopes(resolveRequest.requestedScopes, surface.scopes);
      if ("ok" in scopes) {
        return scopes;
      }

      return {
        ok: true,
        surface,
        grantedScopes: scopes,
        events: ["runtime.surfaceRegistry.resolved"],
      };
    },
  };

  return {
    ok: true,
    registry,
    events: ["runtime.surfaceRegistry.ready"],
  };
}
