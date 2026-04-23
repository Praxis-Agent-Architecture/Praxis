/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Module Attachment Probe 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugModuleAttachmentProbeBoundary = "input" | "contract" | "governance" | "runtime-state" | "module";

export type DebugModuleAttachmentProbeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug";

export type DebugModuleAttachmentProbeCaller = {
  kind: DebugModuleAttachmentProbeCallerKind;
  id: string;
  moduleId?: string;
};

export type DebugModuleAttachmentProbeGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugModuleAttachmentKind = "cmp" | "mp" | "tap" | "multiagent" | "custom";

export type DebugModuleAttachmentPhase = "detached" | "attached" | "paused" | "failed";

export type DebugModuleAttachmentSnapshot = {
  moduleId: string;
  moduleKind: DebugModuleAttachmentKind;
  phase: DebugModuleAttachmentPhase;
  mounted?: boolean;
  enabled?: boolean;
  contractAccepted?: boolean;
  governanceAccepted?: boolean;
  requiredScopes?: readonly string[];
  grantedScopes?: readonly string[];
};

export type DebugModuleAttachmentStatus = "attached" | "missing" | "paused" | "failed" | "denied";

export type DebugModuleAttachmentObservation = {
  moduleId: string;
  moduleKind: DebugModuleAttachmentKind;
  phase: DebugModuleAttachmentPhase;
  status: DebugModuleAttachmentStatus;
  mounted: boolean;
  enabled: boolean;
  contractAccepted: boolean;
  governanceAccepted: boolean;
  requiredScopes: readonly string[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  reasons: readonly string[];
};

export type DebugModuleAttachmentProbeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MODULE_NOT_MOUNTED";

export type DebugModuleAttachmentProbeRequest = {
  runtimeId?: string;
  caller?: DebugModuleAttachmentProbeCaller;
  runtimeReady?: boolean;
  contract?: DebugModuleAttachmentProbeGate;
  governance?: DebugModuleAttachmentProbeGate;
  attachments?: readonly DebugModuleAttachmentSnapshot[];
  requiredModuleIds?: readonly string[];
};

export type DebugModuleAttachmentProbeReport = {
  runtimeId: string;
  caller: DebugModuleAttachmentProbeCaller;
  status: "clear" | "needs-attention";
  observations: readonly DebugModuleAttachmentObservation[];
  missingRequiredModuleIds: readonly string[];
  probeSurface: "runtime.debug.debugModuleAttachmentProbe";
  contractChecked: true;
  governanceChecked: true;
  readonly: true;
  unsafeSideEffects: false;
};

export type DebugModuleAttachmentProbeError = {
  code: DebugModuleAttachmentProbeErrorCode;
  message: string;
  boundary: DebugModuleAttachmentProbeBoundary;
  publicSafe: true;
};

export type DebugModuleAttachmentProbeResult =
  | {
      ok: true;
      report: DebugModuleAttachmentProbeReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugModuleAttachmentProbeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugModuleAttachmentProbeCaller): DebugModuleAttachmentProbeCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
  };
}

function resolveStatus(snapshot: DebugModuleAttachmentSnapshot, missingScopes: readonly string[]): DebugModuleAttachmentStatus {
  if (snapshot.phase === "failed") {
    return "failed";
  }

  if (snapshot.phase === "paused") {
    return "paused";
  }

  if (snapshot.mounted === false || snapshot.phase === "detached") {
    return "missing";
  }

  if (snapshot.enabled === false || snapshot.contractAccepted === false || snapshot.governanceAccepted === false || missingScopes.length > 0) {
    return "denied";
  }

  return "attached";
}

function buildReasons(
  snapshot: DebugModuleAttachmentSnapshot,
  missingScopes: readonly string[],
): readonly string[] {
  const reasons: string[] = [];

  if (snapshot.phase === "detached" || snapshot.mounted === false) {
    reasons.push("module is not mounted on this runtime");
  }

  if (snapshot.phase === "paused") {
    reasons.push("module is mounted but paused");
  }

  if (snapshot.phase === "failed") {
    reasons.push("module attachment reports a failed phase");
  }

  if (snapshot.enabled === false) {
    reasons.push("module attachment is disabled");
  }

  if (snapshot.contractAccepted === false) {
    reasons.push("module attachment contract gate rejected the module");
  }

  if (snapshot.governanceAccepted === false) {
    reasons.push("module attachment governance gate rejected the module");
  }

  if (missingScopes.length > 0) {
    reasons.push(`module attachment is missing scope: ${missingScopes.join(", ")}`);
  }

  return reasons;
}

function observeAttachment(snapshot: DebugModuleAttachmentSnapshot): DebugModuleAttachmentObservation {
  const requiredScopes = cleanList(snapshot.requiredScopes);
  const grantedScopes = cleanList(snapshot.grantedScopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
  const mounted = snapshot.mounted ?? (snapshot.phase === "attached" || snapshot.phase === "paused");
  const enabled = snapshot.enabled ?? true;
  const contractAccepted = snapshot.contractAccepted ?? true;
  const governanceAccepted = snapshot.governanceAccepted ?? true;

  return {
    moduleId: snapshot.moduleId.trim(),
    moduleKind: snapshot.moduleKind,
    phase: snapshot.phase,
    status: resolveStatus({ ...snapshot, mounted, enabled, contractAccepted, governanceAccepted }, missingScopes),
    mounted,
    enabled,
    contractAccepted,
    governanceAccepted,
    requiredScopes,
    grantedScopes,
    missingScopes,
    reasons: buildReasons({ ...snapshot, mounted, enabled, contractAccepted, governanceAccepted }, missingScopes),
  };
}

function failure(
  code: DebugModuleAttachmentProbeErrorCode,
  message: string,
  boundary: DebugModuleAttachmentProbeBoundary,
): DebugModuleAttachmentProbeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.debug.moduleAttachmentProbe.rejected"],
  };
}

export function probeDebugModuleAttachment(
  request: DebugModuleAttachmentProbeRequest = {},
): DebugModuleAttachmentProbeResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug module attachment probe requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "debug module attachment probe requires a caller with a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug module attachment probe can only inspect a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "debug module attachment probe was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug module attachment probe was rejected by governance",
      "governance",
    );
  }

  const observations = (request.attachments ?? []).map(observeAttachment);
  const attachedModuleIds = new Set(
    observations
      .filter((observation) => observation.status === "attached")
      .map((observation) => observation.moduleId),
  );
  const missingRequiredModuleIds = cleanList(request.requiredModuleIds).filter(
    (moduleId) => !attachedModuleIds.has(moduleId),
  );

  if (missingRequiredModuleIds.length > 0) {
    return failure(
      "MODULE_NOT_MOUNTED",
      `debug module attachment probe found required modules that are not attached: ${missingRequiredModuleIds.join(", ")}`,
      "module",
    );
  }

  const status = observations.every((observation) => observation.status === "attached") ? "clear" : "needs-attention";

  return {
    ok: true,
    report: {
      runtimeId: (request.runtimeId ?? "").trim(),
      caller: normalizeCaller(request.caller),
      status,
      observations,
      missingRequiredModuleIds,
      probeSurface: "runtime.debug.debugModuleAttachmentProbe",
      contractChecked: true,
      governanceChecked: true,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.debug.moduleAttachmentProbe.${status}`],
  };
}
