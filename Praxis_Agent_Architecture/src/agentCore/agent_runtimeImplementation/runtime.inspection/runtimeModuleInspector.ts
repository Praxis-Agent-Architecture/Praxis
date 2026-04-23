/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Module Inspector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeModuleInspectorBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeModuleStatus = "mounted" | "unmounted" | "degraded";

export type RuntimeModuleInspectorErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODULE_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeModuleInspectorGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeModuleAttachment = {
  moduleId?: string;
  kind?: string;
  mounted?: boolean;
  required?: boolean;
  health?: "ready" | "degraded" | "failed";
  surfaces?: readonly string[];
  capabilities?: readonly string[];
};

export type RuntimeModuleInspectorRequest = {
  runtimeId?: string;
  moduleId?: string;
  modules?: readonly RuntimeModuleAttachment[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeModuleInspectorGate;
  governance?: RuntimeModuleInspectorGate;
  inspectedAt?: string;
};

export type RuntimeModuleInspection = {
  runtimeId: string;
  moduleId: string;
  kind?: string;
  status: RuntimeModuleStatus;
  mounted: boolean;
  required: boolean;
  health: "ready" | "degraded" | "failed" | "unknown";
  surfaces: readonly string[];
  capabilities: readonly string[];
  missingRequiredModule: boolean;
  acceptedScopes: readonly string[];
  inspectedAt: string;
  surface: "runtime.inspection.runtimeModuleInspector";
  unsafeSideEffects: false;
};

export type RuntimeModuleInspectorError = {
  code: RuntimeModuleInspectorErrorCode;
  message: string;
  boundary: RuntimeModuleInspectorBoundary;
  safeForRuntimeInspection: true;
};

export type RuntimeModuleInspectorResult =
  | {
      ok: true;
      inspection: RuntimeModuleInspection;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeModuleInspectorError;
      events: readonly string[];
    };

export const runtimeModuleInspectorDescriptor = {
  surface: "runtime.inspection",
  capability: "runtimeModuleInspector",
  purpose: "inspect a mounted runtime module through a readonly attachment snapshot",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeModuleInspectorErrorCode,
  message: string,
  boundary: RuntimeModuleInspectorBoundary,
): RuntimeModuleInspectorResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["runtime.inspection.moduleInspector.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeModuleInspectorResult {
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
    return failure("SCOPE_DENIED", `runtime module inspector scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function findAttachment(
  modules: readonly RuntimeModuleAttachment[] | undefined,
  moduleId: string,
): RuntimeModuleAttachment | undefined {
  return (modules ?? []).find((module) => module.moduleId?.trim() === moduleId);
}

function moduleStatus(attachment: RuntimeModuleAttachment | undefined): RuntimeModuleStatus {
  if (attachment === undefined || attachment.mounted === false) {
    return "unmounted";
  }

  if (attachment.health === "degraded" || attachment.health === "failed") {
    return "degraded";
  }

  return "mounted";
}

export function inspectRuntimeModule(request?: RuntimeModuleInspectorRequest): RuntimeModuleInspectorResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime module inspector requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "runtime module inspector requires a moduleId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime modules can only be inspected on a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime module inspection was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime module inspection was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const moduleId = (request.moduleId ?? "").trim();
  const attachment = findAttachment(request.modules, moduleId);
  const status = moduleStatus(attachment);
  const mounted = status !== "unmounted";
  const required = attachment?.required === true;

  return {
    ok: true,
    inspection: {
      runtimeId,
      moduleId,
      kind: attachment?.kind?.trim() || undefined,
      status,
      mounted,
      required,
      health: attachment?.health ?? "unknown",
      surfaces: cleanList(attachment?.surfaces),
      capabilities: cleanList(attachment?.capabilities),
      missingRequiredModule: required && !mounted,
      acceptedScopes,
      inspectedAt: request.inspectedAt?.trim() || "dry-run",
      surface: "runtime.inspection.runtimeModuleInspector",
      unsafeSideEffects: false,
    },
    events: [`runtime.inspection.moduleInspector.${status}`],
  };
}
