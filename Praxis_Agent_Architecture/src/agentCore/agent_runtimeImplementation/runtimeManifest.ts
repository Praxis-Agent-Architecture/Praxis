/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Manifest 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const runtimeManifestSurface = "runtime.manifest" as const;

export type RuntimeManifestBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "manifest"
  | "scope";

export type RuntimeManifestCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "management"
  | "inspection"
  | "debug"
  | "test";

export type RuntimeManifestSurfaceKind =
  | "application-surface"
  | "official-module-surface"
  | "contract-surface"
  | "governance-plane"
  | "invocation-method"
  | "inspection-surface"
  | "debug-surface"
  | "runtime-quality-surface"
  | "runtime-binding"
  | "runtime-extension"
  | (string & {});

export type RuntimeManifestErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CALLER_ID"
  | "MISSING_SURFACES"
  | "MISSING_SURFACE_ID"
  | "MISSING_SURFACE_KIND"
  | "DUPLICATE_SURFACE_ID"
  | "REQUIRED_SURFACE_MISSING"
  | "SURFACE_NOT_READY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "MODULE_NOT_MOUNTED"
  | "CAPABILITY_SURFACE_MISSING";

export type RuntimeManifestGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeManifestCaller = {
  kind: RuntimeManifestCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type RuntimeManifestSurfaceDescriptor = {
  surfaceId?: string;
  kind?: RuntimeManifestSurfaceKind;
  ready?: boolean;
  mounted?: boolean;
  required?: boolean;
  contractId?: string;
  capabilities?: readonly string[];
  scopes?: readonly string[];
  exposesTo?: readonly RuntimeManifestCallerKind[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeManifestModuleDescriptor = {
  moduleId?: string;
  kind?: "CMP" | "MP" | "TAP" | "multiagent" | (string & {});
  surfaceId?: string;
  mounted?: boolean;
  ready?: boolean;
  contractId?: string;
};

export type RuntimeManifestCapabilityDescriptor = {
  capabilityId?: string;
  surfaceId?: string;
  contractId?: string;
  scopes?: readonly string[];
  ready?: boolean;
};

export type RuntimeManifestRequest = {
  runtimeId?: string;
  caller?: RuntimeManifestCaller;
  runtimeReady?: boolean;
  manifestVersion?: string;
  generatedAt?: string;
  requiredSurfaceIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  surfaces?: readonly RuntimeManifestSurfaceDescriptor[];
  modules?: readonly RuntimeManifestModuleDescriptor[];
  capabilities?: readonly RuntimeManifestCapabilityDescriptor[];
  eventTopics?: readonly string[];
  contract?: RuntimeManifestGate;
  governance?: RuntimeManifestGate;
};

export type RuntimeManifestError = {
  code: RuntimeManifestErrorCode;
  message: string;
  boundary: RuntimeManifestBoundary;
  safeForApplication: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeManifestSurfaceEntry = {
  surfaceId: string;
  kind: RuntimeManifestSurfaceKind;
  ready: boolean;
  mounted: boolean;
  required: boolean;
  contractId?: string;
  capabilities: readonly string[];
  scopes: readonly string[];
  exposesTo: readonly RuntimeManifestCallerKind[];
};

export type RuntimeManifestModuleEntry = {
  moduleId: string;
  kind?: string;
  surfaceId?: string;
  mounted: boolean;
  ready: boolean;
  contractId?: string;
};

export type RuntimeManifestCapabilityEntry = {
  capabilityId: string;
  surfaceId: string;
  contractId?: string;
  scopes: readonly string[];
  ready: boolean;
};

export type RuntimeManifestBlockingIssue = {
  code: Extract<
    RuntimeManifestErrorCode,
    "SURFACE_NOT_READY" | "MODULE_NOT_MOUNTED" | "CAPABILITY_SURFACE_MISSING"
  >;
  targetId: string;
  boundary: Extract<RuntimeManifestBoundary, "runtime-state" | "manifest">;
  message: string;
};

export type RuntimeManifestSnapshot = {
  runtimeId: string;
  caller: RuntimeManifestCaller;
  manifestSurface: typeof runtimeManifestSurface;
  manifestVersion: string;
  generatedAt: string;
  ready: boolean;
  surfaces: readonly RuntimeManifestSurfaceEntry[];
  surfaceIds: readonly string[];
  requiredSurfaceIds: readonly string[];
  modules: readonly RuntimeManifestModuleEntry[];
  capabilities: readonly RuntimeManifestCapabilityEntry[];
  eventTopics: readonly string[];
  acceptedScopes: readonly string[];
  blockingIssues: readonly RuntimeManifestBlockingIssue[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
  schemaFrozen: false;
};

export type RuntimeManifestResult =
  | {
      ok: true;
      manifest: RuntimeManifestSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeManifestError;
      events: readonly string[];
    };

export const runtimeManifestDescriptor = {
  surface: runtimeManifestSurface,
  capability: "runtimeManifest",
  purpose: "publish a readonly runtime manifest for applications, official modules, governance, and inspection surfaces",
  unsafeSideEffects: false,
  schemaFrozen: false,
} as const;

const defaultRequiredSurfaceIds = [
  "runtime.contractSurface",
  "runtime.governancePlane",
  "runtime.invocationMethod",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeManifestErrorCode,
  message: string,
  boundary: RuntimeManifestBoundary,
): RuntimeManifestResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForApplication: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.manifest.rejected"],
  };
}

function normalizeCaller(caller: RuntimeManifestCaller): RuntimeManifestCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

function acceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeManifestResult {
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
    return failure("SCOPE_DENIED", `runtime manifest scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function normalizeSurface(
  descriptor: RuntimeManifestSurfaceDescriptor,
): RuntimeManifestSurfaceEntry | RuntimeManifestResult {
  if (isBlank(descriptor.surfaceId)) {
    return failure("MISSING_SURFACE_ID", "runtime manifest surfaces require a surfaceId", "input");
  }

  if (descriptor.kind === undefined) {
    return failure("MISSING_SURFACE_KIND", "runtime manifest surfaces require an explicit surface kind", "input");
  }

  return {
    surfaceId: cleanText(descriptor.surfaceId),
    kind: descriptor.kind,
    ready: descriptor.ready !== false,
    mounted: descriptor.mounted !== false,
    required: descriptor.required === true,
    contractId: descriptor.contractId?.trim() || undefined,
    capabilities: cleanList(descriptor.capabilities),
    scopes: cleanList(descriptor.scopes),
    exposesTo: descriptor.exposesTo ?? ["application", "official-module", "management", "inspection", "debug"],
  };
}

function normalizeModule(descriptor: RuntimeManifestModuleDescriptor): RuntimeManifestModuleEntry | RuntimeManifestResult {
  if (isBlank(descriptor.moduleId)) {
    return failure("MODULE_NOT_MOUNTED", "runtime manifest modules require a moduleId before exposure", "manifest");
  }

  return {
    moduleId: cleanText(descriptor.moduleId),
    kind: descriptor.kind,
    surfaceId: descriptor.surfaceId?.trim() || undefined,
    mounted: descriptor.mounted !== false,
    ready: descriptor.ready !== false,
    contractId: descriptor.contractId?.trim() || undefined,
  };
}

function normalizeCapability(
  descriptor: RuntimeManifestCapabilityDescriptor,
  surfaceIds: ReadonlySet<string>,
): RuntimeManifestCapabilityEntry | RuntimeManifestResult {
  const capabilityId = cleanText(descriptor.capabilityId);
  const surfaceId = cleanText(descriptor.surfaceId);

  if (capabilityId.length === 0) {
    return failure("CAPABILITY_SURFACE_MISSING", "runtime manifest capabilities require a capabilityId", "manifest");
  }

  if (surfaceId.length === 0 || !surfaceIds.has(surfaceId)) {
    return failure(
      "CAPABILITY_SURFACE_MISSING",
      `runtime manifest capability ${capabilityId} must point at a mounted runtime surface`,
      "manifest",
    );
  }

  return {
    capabilityId,
    surfaceId,
    contractId: descriptor.contractId?.trim() || undefined,
    scopes: cleanList(descriptor.scopes),
    ready: descriptor.ready !== false,
  };
}

function buildBlockingIssues(
  surfaces: readonly RuntimeManifestSurfaceEntry[],
  modules: readonly RuntimeManifestModuleEntry[],
  capabilities: readonly RuntimeManifestCapabilityEntry[],
): readonly RuntimeManifestBlockingIssue[] {
  const surfaceIssues = surfaces
    .filter((surface) => surface.required && (!surface.ready || !surface.mounted))
    .map((surface) => ({
      code: "SURFACE_NOT_READY" as const,
      targetId: surface.surfaceId,
      boundary: "runtime-state" as const,
      message: `required runtime manifest surface ${surface.surfaceId} is not ready`,
    }));

  const moduleIssues = modules
    .filter((module) => !module.mounted || !module.ready)
    .map((module) => ({
      code: "MODULE_NOT_MOUNTED" as const,
      targetId: module.moduleId,
      boundary: "manifest" as const,
      message: `runtime manifest module ${module.moduleId} is not mounted and ready`,
    }));

  const capabilityIssues = capabilities
    .filter((capability) => !capability.ready)
    .map((capability) => ({
      code: "CAPABILITY_SURFACE_MISSING" as const,
      targetId: capability.capabilityId,
      boundary: "manifest" as const,
      message: `runtime manifest capability ${capability.capabilityId} is not ready`,
    }));

  return [...surfaceIssues, ...moduleIssues, ...capabilityIssues];
}

export function buildRuntimeManifest(request: RuntimeManifestRequest = {}): RuntimeManifestResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime manifest requires a runtimeId", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "runtime manifest requires a caller for governance and audit", "input");
  }

  if (isBlank(request.caller.id)) {
    return failure("MISSING_CALLER_ID", "runtime manifest caller requires a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime manifest can only expose a ready runtime envelope", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime manifest was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime manifest was rejected by governance",
      "governance",
    );
  }

  if ((request.surfaces ?? []).length === 0) {
    return failure("MISSING_SURFACES", "runtime manifest requires explicitly injected runtime surfaces", "input");
  }

  const scopes = acceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in scopes) {
    return scopes;
  }

  const seenSurfaceIds = new Set<string>();
  const surfaces: RuntimeManifestSurfaceEntry[] = [];

  for (const surfaceDescriptor of request.surfaces ?? []) {
    const surface = normalizeSurface(surfaceDescriptor);
    if ("ok" in surface) {
      return surface;
    }

    if (seenSurfaceIds.has(surface.surfaceId)) {
      return failure(
        "DUPLICATE_SURFACE_ID",
        `runtime manifest received duplicate surfaceId: ${surface.surfaceId}`,
        "manifest",
      );
    }

    seenSurfaceIds.add(surface.surfaceId);
    surfaces.push(surface);
  }

  const requestedRequiredSurfaceIds = cleanList(request.requiredSurfaceIds);
  const requiredSurfaceIds =
    requestedRequiredSurfaceIds.length > 0 ? requestedRequiredSurfaceIds : defaultRequiredSurfaceIds;
  const surfaceIds = surfaces.map((surface) => surface.surfaceId);
  const missingRequiredSurfaceIds = requiredSurfaceIds.filter((surfaceId) => !seenSurfaceIds.has(surfaceId));

  if (missingRequiredSurfaceIds.length > 0) {
    return failure(
      "REQUIRED_SURFACE_MISSING",
      `runtime manifest is missing required surfaces: ${missingRequiredSurfaceIds.join(", ")}`,
      "manifest",
    );
  }

  const modules: RuntimeManifestModuleEntry[] = [];
  for (const moduleDescriptor of request.modules ?? []) {
    const module = normalizeModule(moduleDescriptor);
    if ("ok" in module) {
      return module;
    }

    modules.push(module);
  }

  const capabilities: RuntimeManifestCapabilityEntry[] = [];
  for (const capabilityDescriptor of request.capabilities ?? []) {
    const capability = normalizeCapability(capabilityDescriptor, seenSurfaceIds);
    if ("ok" in capability) {
      return capability;
    }

    capabilities.push(capability);
  }

  const blockingIssues = buildBlockingIssues(surfaces, modules, capabilities);
  const ready = blockingIssues.length === 0;

  return {
    ok: true,
    manifest: {
      runtimeId: cleanText(request.runtimeId),
      caller: normalizeCaller(request.caller),
      manifestSurface: runtimeManifestSurface,
      manifestVersion: request.manifestVersion?.trim() || "draft",
      generatedAt: request.generatedAt?.trim() || "dry-run",
      ready,
      surfaces,
      surfaceIds,
      requiredSurfaceIds,
      modules,
      capabilities,
      eventTopics: cleanList(request.eventTopics),
      acceptedScopes: scopes,
      blockingIssues,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
      schemaFrozen: false,
    },
    events: [ready ? "runtime.manifest.ready" : "runtime.manifest.blocked"],
  };
}
