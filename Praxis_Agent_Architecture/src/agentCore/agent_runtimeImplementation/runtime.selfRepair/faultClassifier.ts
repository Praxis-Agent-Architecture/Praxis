/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 fault Classifier 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeFaultClassifierBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "fault-signal";

export type RuntimeFaultCategory =
  | "contract"
  | "governance"
  | "runtime-state"
  | "module-attachment"
  | "provider-adapter"
  | "execution"
  | "unknown";

export type RuntimeFaultSeverity = "notice" | "recoverable" | "degraded" | "critical";

export type RuntimeFaultRepairability =
  | "auto-repairable"
  | "requires-approval"
  | "requires-escalation"
  | "not-repairable";

export type RuntimeFaultClassifierErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_FAULT_SIGNAL"
  | "MISSING_FAULT_KIND"
  | "FAULT_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeFaultClassifierGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeFaultSignal = {
  faultId?: string;
  kind?: string;
  source?: string;
  message?: string;
  severity?: RuntimeFaultSeverity;
  retryable?: boolean;
  contractRejected?: boolean;
  governanceRejected?: boolean;
  runtimeReady?: boolean;
  moduleMounted?: boolean;
  providerAdapter?: string;
  executionPhase?: string;
  externalSideEffect?: boolean;
  tags?: readonly string[];
};

export type RuntimeFaultClassifierRequest = {
  runtimeId?: string;
  signal?: RuntimeFaultSignal;
  allowedFaultKinds?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeFaultClassifierGate;
  governance?: RuntimeFaultClassifierGate;
  observedAt?: string;
};

export type RuntimeFaultClassification = {
  runtimeId: string;
  faultId: string;
  kind: string;
  category: RuntimeFaultCategory;
  severity: RuntimeFaultSeverity;
  repairability: RuntimeFaultRepairability;
  recoverable: boolean;
  reason: string;
  source: string;
  observedAt: string;
  evidenceTags: readonly string[];
  recommendedNextStep: "build-plan" | "request-approval" | "escalate" | "observe-only";
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeFaultClassifierError = {
  code: RuntimeFaultClassifierErrorCode;
  message: string;
  boundary: RuntimeFaultClassifierBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeFaultClassifierResult =
  | {
      ok: true;
      classification: RuntimeFaultClassification;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeFaultClassifierError;
      events: readonly string[];
    };

export const runtimeFaultClassifierDescriptor = {
  surface: "runtime.selfRepair",
  capability: "faultClassifier",
  purpose: "classify runtime fault envelopes and report repairability without executing repair actions",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeFaultClassifierErrorCode,
  message: string,
  boundary: RuntimeFaultClassifierBoundary,
): RuntimeFaultClassifierResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.faultClassifier.rejected"],
  };
}

function categoryFromSignal(signal: RuntimeFaultSignal): RuntimeFaultCategory {
  const kind = signal.kind?.trim().toLowerCase() ?? "";
  const source = signal.source?.trim().toLowerCase() ?? "";

  if (signal.contractRejected || kind.includes("contract") || source.includes("contract")) {
    return "contract";
  }

  if (signal.governanceRejected || kind.includes("governance") || source.includes("governance")) {
    return "governance";
  }

  if (signal.runtimeReady === false || kind.includes("ready") || kind.includes("state")) {
    return "runtime-state";
  }

  if (signal.moduleMounted === false || kind.includes("module")) {
    return "module-attachment";
  }

  if (signal.providerAdapter !== undefined || kind.includes("provider") || kind.includes("adapter")) {
    return "provider-adapter";
  }

  if (signal.executionPhase !== undefined || kind.includes("execution") || kind.includes("invoke")) {
    return "execution";
  }

  return "unknown";
}

function severityFromSignal(signal: RuntimeFaultSignal, category: RuntimeFaultCategory): RuntimeFaultSeverity {
  if (signal.severity !== undefined) {
    return signal.severity;
  }

  if (signal.externalSideEffect === true || category === "contract" || category === "governance") {
    return "critical";
  }

  if (signal.runtimeReady === false || signal.moduleMounted === false) {
    return "degraded";
  }

  return signal.retryable === false ? "degraded" : "recoverable";
}

function repairabilityFromSignal(
  signal: RuntimeFaultSignal,
  category: RuntimeFaultCategory,
  severity: RuntimeFaultSeverity,
): RuntimeFaultRepairability {
  if (signal.externalSideEffect === true || severity === "critical") {
    return "requires-escalation";
  }

  if (category === "contract" || category === "governance") {
    return "requires-approval";
  }

  if (category === "unknown" || signal.retryable === false) {
    return "not-repairable";
  }

  return "auto-repairable";
}

function recommendedNextStep(
  repairability: RuntimeFaultRepairability,
): RuntimeFaultClassification["recommendedNextStep"] {
  if (repairability === "auto-repairable") {
    return "build-plan";
  }

  if (repairability === "requires-approval") {
    return "request-approval";
  }

  if (repairability === "requires-escalation") {
    return "escalate";
  }

  return "observe-only";
}

export function classifyRuntimeFault(request?: RuntimeFaultClassifierRequest): RuntimeFaultClassifierResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "fault classification requires a runtimeId", "input");
  }

  if (request.signal === undefined) {
    return failure("MISSING_FAULT_SIGNAL", "fault classification requires a runtime fault signal", "input");
  }

  if (!hasText(request.signal.kind)) {
    return failure("MISSING_FAULT_KIND", "fault classification requires the signal to declare a fault kind", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "fault classification can only run through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "fault classification was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "fault classification was rejected by governance",
      "governance",
    );
  }

  const kind = request.signal.kind.trim();
  const allowedFaultKinds = cleanList(request.allowedFaultKinds);
  if (allowedFaultKinds.length > 0 && !allowedFaultKinds.includes(kind)) {
    return failure("FAULT_SCOPE_DENIED", `fault kind ${kind} is outside self-repair scope`, "scope");
  }

  const runtimeId = request.runtimeId.trim();
  const category = categoryFromSignal(request.signal);
  const severity = severityFromSignal(request.signal, category);
  const repairability = repairabilityFromSignal(request.signal, category, severity);
  const faultId = request.signal.faultId?.trim() || `${runtimeId}:fault:${kind}`;

  return {
    ok: true,
    classification: {
      runtimeId,
      faultId,
      kind,
      category,
      severity,
      repairability,
      recoverable: repairability === "auto-repairable" || repairability === "requires-approval",
      reason: request.signal.message?.trim() || `${kind} classified as ${category}`,
      source: request.signal.source?.trim() || "runtime.selfRepair",
      observedAt: request.observedAt?.trim() || "dry-run",
      evidenceTags: cleanList(request.signal.tags),
      recommendedNextStep: recommendedNextStep(repairability),
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.selfRepair.faultClassifier.${repairability}`],
  };
}
