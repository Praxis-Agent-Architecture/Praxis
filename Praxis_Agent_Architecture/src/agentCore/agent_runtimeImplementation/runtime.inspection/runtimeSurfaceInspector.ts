/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Surface Inspector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeSurfaceInspectorBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeSurfaceStatus = "ready" | "missing" | "degraded";

export type RuntimeSurfaceInspectorErrorCode =
  | "MISSING_RUNTIME_ID"
  | "EMPTY_SURFACE_SET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeSurfaceInspectorGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeSurfaceAttachment = {
  surfaceId?: string;
  mounted?: boolean;
  ready?: boolean;
  required?: boolean;
  owner?: string;
  exposedCapabilities?: readonly string[];
};

export type RuntimeSurfaceInspectorRequest = {
  runtimeId?: string;
  surfaces?: readonly RuntimeSurfaceAttachment[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeSurfaceInspectorGate;
  governance?: RuntimeSurfaceInspectorGate;
  inspectedAt?: string;
};

export type RuntimeSurfaceInspectionEntry = {
  surfaceId: string;
  status: RuntimeSurfaceStatus;
  mounted: boolean;
  ready: boolean;
  required: boolean;
  owner?: string;
  exposedCapabilities: readonly string[];
};

export type RuntimeSurfaceInspectionSnapshot = {
  runtimeId: string;
  surface: "runtime.inspection.runtimeSurfaceInspector";
  status: RuntimeSurfaceStatus;
  entries: readonly RuntimeSurfaceInspectionEntry[];
  missingRequiredSurfaceIds: readonly string[];
  degradedSurfaceIds: readonly string[];
  acceptedScopes: readonly string[];
  inspectedAt: string;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeSurfaceInspectorError = {
  code: RuntimeSurfaceInspectorErrorCode;
  message: string;
  boundary: RuntimeSurfaceInspectorBoundary;
  safeForRuntimeInspection: true;
};

export type RuntimeSurfaceInspectorResult =
  | {
      ok: true;
      inspection: RuntimeSurfaceInspectionSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeSurfaceInspectorError;
      events: readonly string[];
    };

export const runtimeSurfaceInspectorDescriptor = {
  surface: "runtime.inspection",
  capability: "runtimeSurfaceInspector",
  purpose: "inspect mounted runtime surfaces through a readonly readiness snapshot",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeSurfaceInspectorErrorCode,
  message: string,
  boundary: RuntimeSurfaceInspectorBoundary,
): RuntimeSurfaceInspectorResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["runtime.inspection.surfaceInspector.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeSurfaceInspectorResult {
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
    return failure("SCOPE_DENIED", `runtime surface inspector scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function surfaceStatus(surface: RuntimeSurfaceAttachment): RuntimeSurfaceStatus {
  if (surface.mounted === false) {
    return "missing";
  }

  if (surface.ready === false) {
    return "degraded";
  }

  return "ready";
}

function normalizeEntry(surface: RuntimeSurfaceAttachment, index: number): RuntimeSurfaceInspectionEntry | undefined {
  const surfaceId = surface.surfaceId?.trim() || `surface:${index + 1}`;
  if (isBlank(surfaceId)) {
    return undefined;
  }

  const status = surfaceStatus(surface);

  return {
    surfaceId,
    status,
    mounted: status !== "missing",
    ready: status === "ready",
    required: surface.required !== false,
    owner: surface.owner?.trim() || undefined,
    exposedCapabilities: cleanList(surface.exposedCapabilities),
  };
}

function summarizeStatus(entries: readonly RuntimeSurfaceInspectionEntry[]): RuntimeSurfaceStatus {
  if (entries.some((entry) => entry.required && entry.status === "missing")) {
    return "missing";
  }

  if (entries.some((entry) => entry.status !== "ready")) {
    return "degraded";
  }

  return "ready";
}

export function inspectRuntimeSurfaces(request?: RuntimeSurfaceInspectorRequest): RuntimeSurfaceInspectorResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime surface inspector requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime surfaces can only be inspected on a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime surface inspection was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime surface inspection was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const entries = (request.surfaces ?? [])
    .map((surface, index) => normalizeEntry(surface, index))
    .filter((entry): entry is RuntimeSurfaceInspectionEntry => entry !== undefined);

  if (entries.length === 0) {
    return failure("EMPTY_SURFACE_SET", "runtime surface inspector requires at least one surface attachment", "input");
  }

  const missingRequiredSurfaceIds = entries
    .filter((entry) => entry.required && entry.status === "missing")
    .map((entry) => entry.surfaceId);
  const degradedSurfaceIds = entries
    .filter((entry) => entry.status === "degraded" || (!entry.required && entry.status === "missing"))
    .map((entry) => entry.surfaceId);
  const status = summarizeStatus(entries);

  return {
    ok: true,
    inspection: {
      runtimeId: (request.runtimeId ?? "").trim(),
      surface: "runtime.inspection.runtimeSurfaceInspector",
      status,
      entries,
      missingRequiredSurfaceIds,
      degradedSurfaceIds,
      acceptedScopes,
      inspectedAt: request.inspectedAt?.trim() || "dry-run",
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.surfaceInspector.${status}`],
  };
}
