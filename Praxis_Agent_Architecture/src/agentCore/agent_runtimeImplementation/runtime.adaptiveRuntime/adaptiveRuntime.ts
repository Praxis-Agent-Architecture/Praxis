/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptive Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptiveRuntimeSignalKind =
  | "provider-health"
  | "resource-pressure"
  | "capability-demand"
  | "module-imbalance"
  | "contract-drift";

export type AdaptiveRuntimeSignalSeverity = "info" | "warning" | "critical";

export type AdaptiveRuntimeActionKind =
  | "keep-current"
  | "degrade-capability"
  | "provider-fallback"
  | "tune-resource"
  | "rebalance-module";

export type AdaptiveRuntimeErrorBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type AdaptiveRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSUPPORTED_SIGNAL"
  | "ADAPTATION_SCOPE_REJECTED";

export type AdaptiveRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptiveRuntimeSignal = {
  kind: AdaptiveRuntimeSignalKind | string;
  severity?: AdaptiveRuntimeSignalSeverity | string;
  source?: string;
  target?: string;
  metric?: number;
  message?: string;
  requestedAction?: AdaptiveRuntimeActionKind;
};

export type AdaptiveRuntimeRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  signals?: readonly AdaptiveRuntimeSignal[];
  allowedActions?: readonly AdaptiveRuntimeActionKind[];
  contract?: AdaptiveRuntimeGate;
  governance?: AdaptiveRuntimeGate;
  dryRun?: boolean;
};

export type AdaptiveRuntimeActionPlan = {
  kind: AdaptiveRuntimeActionKind;
  target: string;
  reason: string;
  guardedBy: readonly ["runtime.contractSurface", "runtime.governancePlane"];
  dryRun: true;
};

export type AdaptiveRuntimeDecisionStatus = "stable" | "adjustment-planned";

export type AdaptiveRuntimeDecision = {
  runtimeId: string;
  status: AdaptiveRuntimeDecisionStatus;
  selectedAction: AdaptiveRuntimeActionPlan;
  consideredSignals: readonly AdaptiveRuntimeSignal[];
  auditTrail: readonly string[];
  unsafeSideEffects: false;
};

export type AdaptiveRuntimeError = {
  code: AdaptiveRuntimeErrorCode;
  message: string;
  boundary: AdaptiveRuntimeErrorBoundary;
  publicSafe: true;
};

export type AdaptiveRuntimeResult =
  | {
      ok: true;
      decision: AdaptiveRuntimeDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptiveRuntimeError;
      events: readonly string[];
    };

export const DEFAULT_ADAPTIVE_RUNTIME_ACTIONS = [
  "keep-current",
  "degrade-capability",
  "provider-fallback",
  "tune-resource",
  "rebalance-module",
] as const satisfies readonly AdaptiveRuntimeActionKind[];

const supportedSignalKinds = [
  "provider-health",
  "resource-pressure",
  "capability-demand",
  "module-imbalance",
  "contract-drift",
] as const satisfies readonly AdaptiveRuntimeSignalKind[];

const supportedSeverities = ["info", "warning", "critical"] as const satisfies readonly AdaptiveRuntimeSignalSeverity[];

const signalActionMap = {
  "provider-health": "provider-fallback",
  "resource-pressure": "tune-resource",
  "capability-demand": "degrade-capability",
  "module-imbalance": "rebalance-module",
  "contract-drift": "keep-current",
} as const satisfies Record<AdaptiveRuntimeSignalKind, AdaptiveRuntimeActionKind>;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isAdaptiveRuntimeSignalKind(value: string): value is AdaptiveRuntimeSignalKind {
  return supportedSignalKinds.includes(value as AdaptiveRuntimeSignalKind);
}

function isAdaptiveRuntimeSignalSeverity(value: string): value is AdaptiveRuntimeSignalSeverity {
  return supportedSeverities.includes(value as AdaptiveRuntimeSignalSeverity);
}

function failure(
  code: AdaptiveRuntimeErrorCode,
  message: string,
  boundary: AdaptiveRuntimeErrorBoundary,
): AdaptiveRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.adaptiveRuntime.rejected"],
  };
}

function normalizeSignals(signals: readonly AdaptiveRuntimeSignal[] | undefined): AdaptiveRuntimeSignal[] {
  return (signals ?? []).map((signal) => ({
    kind: signal.kind.trim(),
    severity: signal.severity?.trim() ?? "info",
    source: signal.source?.trim(),
    target: signal.target?.trim(),
    metric: signal.metric,
    message: signal.message?.trim(),
    requestedAction: signal.requestedAction,
  }));
}

function signalPriority(signal: AdaptiveRuntimeSignal): number {
  if (signal.severity === "critical") {
    return 3;
  }

  if (signal.severity === "warning") {
    return 2;
  }

  return 1;
}

function firstImportantSignal(signals: readonly AdaptiveRuntimeSignal[]): AdaptiveRuntimeSignal | undefined {
  return [...signals].sort((left, right) => signalPriority(right) - signalPriority(left))[0];
}

function actionPlanForSignal(runtimeId: string, signal: AdaptiveRuntimeSignal | undefined): AdaptiveRuntimeActionPlan {
  if (signal === undefined) {
    return {
      kind: "keep-current",
      target: runtimeId,
      reason: "no adaptive runtime signal requires a change",
      guardedBy: ["runtime.contractSurface", "runtime.governancePlane"],
      dryRun: true,
    };
  }

  const kind = signal.requestedAction ?? signalActionMap[signal.kind as AdaptiveRuntimeSignalKind];

  return {
    kind,
    target: signal.target ?? runtimeId,
    reason: signal.message ?? `${signal.kind} signal selected ${kind}`,
    guardedBy: ["runtime.contractSurface", "runtime.governancePlane"],
    dryRun: true,
  };
}

function isActionAllowed(action: AdaptiveRuntimeActionKind, allowedActions: readonly AdaptiveRuntimeActionKind[]): boolean {
  return action === "keep-current" || allowedActions.includes(action);
}

export function planAdaptiveRuntimeAdjustment(request?: AdaptiveRuntimeRequest): AdaptiveRuntimeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptive runtime planning requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptive runtime can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptive runtime planning was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptive runtime planning was rejected by governance",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const signals = normalizeSignals(request.signals);
  const unsupportedSignal = signals.find(
    (signal) =>
      !isAdaptiveRuntimeSignalKind(signal.kind) ||
      !isAdaptiveRuntimeSignalSeverity(signal.severity ?? "info"),
  );

  if (unsupportedSignal !== undefined) {
    return failure(
      "UNSUPPORTED_SIGNAL",
      `adaptive runtime signal ${unsupportedSignal.kind} is not supported by this surface`,
      "input",
    );
  }

  const allowedActions = request.allowedActions ?? DEFAULT_ADAPTIVE_RUNTIME_ACTIONS;
  const selectedAction = actionPlanForSignal(runtimeId, firstImportantSignal(signals));

  if (!isActionAllowed(selectedAction.kind, allowedActions)) {
    return failure(
      "ADAPTATION_SCOPE_REJECTED",
      `adaptive action ${selectedAction.kind} is outside the allowed runtime scope`,
      "scope",
    );
  }

  const status: AdaptiveRuntimeDecisionStatus =
    selectedAction.kind === "keep-current" ? "stable" : "adjustment-planned";
  const auditTrail = [
    "runtime.adaptiveRuntime.input.accepted",
    "runtime.adaptiveRuntime.contract.checked",
    "runtime.adaptiveRuntime.governance.checked",
    "runtime.adaptiveRuntime.dryRun.enforced",
  ] as const;

  return {
    ok: true,
    decision: {
      runtimeId,
      status,
      selectedAction,
      consideredSignals: signals,
      auditTrail,
      unsafeSideEffects: false,
    },
    events: [`runtime.adaptiveRuntime.${status}`],
  };
}
