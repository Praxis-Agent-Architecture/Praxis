/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 self Repair Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  classifyRuntimeFault,
  type RuntimeFaultClassification,
  type RuntimeFaultSignal,
} from "./faultClassifier.js";
import {
  gateRuntimeRepairAction,
  type RuntimeRepairActionDecision,
} from "./repairActionGate.js";
import {
  createRepairEscalation,
  type RuntimeRepairEscalationCaller,
  type RuntimeRepairEscalationEnvelope,
  type RuntimeRepairEscalationReason,
} from "./repairEscalationPort.js";
import {
  buildRuntimeRepairPlan,
  type RuntimeRepairPlan,
  type RuntimeRepairPlanStepKind,
} from "./repairPlanBuilder.js";

export type SelfRepairRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "fault-signal"
  | "approval"
  | "classification"
  | "repair-plan"
  | "action-gate"
  | "escalation";

export type SelfRepairRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_FAULT_SIGNAL"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "FAULT_CLASSIFICATION_FAILED"
  | "REPAIR_PLAN_FAILED"
  | "REPAIR_ACTION_GATE_FAILED"
  | "REPAIR_ESCALATION_FAILED";

export type SelfRepairRuntimeStatus = "plan-ready" | "approval-required" | "escalated";

export type SelfRepairRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type SelfRepairRuntimeRequest = {
  runtimeId?: string;
  signal?: RuntimeFaultSignal;
  runtimeReady?: boolean;
  observedAt?: string;
  allowedFaultKinds?: readonly string[];
  allowedStepKinds?: readonly RuntimeRepairPlanStepKind[];
  approvedStepIds?: readonly string[];
  allowHighRisk?: boolean;
  caller?: RuntimeRepairEscalationCaller;
  contract?: SelfRepairRuntimeGate;
  governance?: SelfRepairRuntimeGate;
};

export type SelfRepairRuntimeOutcome = {
  runtimeId: string;
  status: SelfRepairRuntimeStatus;
  classification: RuntimeFaultClassification;
  plan?: RuntimeRepairPlan;
  actionDecision?: RuntimeRepairActionDecision;
  escalation?: RuntimeRepairEscalationEnvelope;
  nextStep: "hold-for-approval" | "dry-run-plan-ready" | "manual-review";
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    runtime: "runtime.selfRepair.selfRepairRuntime";
    contractChecked: true;
    governanceChecked: true;
    stages: readonly SelfRepairRuntimeStage[];
  };
};

export type SelfRepairRuntimeStage =
  | "fault-classified"
  | "repair-plan-built"
  | "action-gated"
  | "approval-held"
  | "escalation-created";

export type SelfRepairRuntimeError = {
  code: SelfRepairRuntimeErrorCode;
  message: string;
  boundary: SelfRepairRuntimeBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type SelfRepairRuntimeResult =
  | {
      ok: true;
      outcome: SelfRepairRuntimeOutcome;
      events: readonly string[];
    }
  | {
      ok: false;
      error: SelfRepairRuntimeError;
      events: readonly string[];
    };

export const selfRepairRuntimeDescriptor = {
  surface: "runtime.selfRepair",
  capability: "selfRepairRuntime",
  purpose: "coordinate governed dry-run runtime self-repair classification, planning, gating, and escalation",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: SelfRepairRuntimeErrorCode,
  message: string,
  boundary: SelfRepairRuntimeBoundary,
): SelfRepairRuntimeResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.selfRepairRuntime.rejected"],
  };
}

function escalationReasonForClassification(
  classification: RuntimeFaultClassification,
): RuntimeRepairEscalationReason | undefined {
  if (classification.repairability === "not-repairable") {
    return "not-repairable";
  }

  if (classification.repairability === "requires-escalation") {
    return "high-risk";
  }

  if (classification.repairability === "requires-approval") {
    return "approval-required";
  }

  return undefined;
}

function escalatedOutcome(
  request: SelfRepairRuntimeRequest,
  runtimeId: string,
  classification: RuntimeFaultClassification,
  reason: RuntimeRepairEscalationReason,
  events: readonly string[],
  plan?: RuntimeRepairPlan,
): SelfRepairRuntimeResult {
  const escalation = createRepairEscalation({
    runtimeId,
    classification,
    plan,
    reason,
    caller: request.caller,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
  });

  if (!escalation.ok) {
    return failure("REPAIR_ESCALATION_FAILED", escalation.error.message, escalation.error.boundary);
  }

  return {
    ok: true,
    outcome: {
      runtimeId,
      status: "escalated",
      classification,
      plan,
      escalation: escalation.escalation,
      nextStep: "manual-review",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        runtime: "runtime.selfRepair.selfRepairRuntime",
        contractChecked: true,
        governanceChecked: true,
        stages: plan === undefined
          ? ["fault-classified", "escalation-created"]
          : ["fault-classified", "repair-plan-built", "escalation-created"],
      },
    },
    events: [...events, ...escalation.events, "runtime.selfRepair.selfRepairRuntime.escalated"],
  };
}

export function runSelfRepairRuntime(request?: SelfRepairRuntimeRequest): SelfRepairRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "self repair runtime requires a runtimeId", "input");
  }

  if (request.signal === undefined) {
    return failure("MISSING_FAULT_SIGNAL", "self repair runtime requires a runtime fault signal", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "self repair runtime can only coordinate through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "self repair runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "self repair runtime was rejected by governance",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const classification = classifyRuntimeFault({
    runtimeId,
    signal: request.signal,
    runtimeReady: request.runtimeReady,
    observedAt: request.observedAt,
    allowedFaultKinds: request.allowedFaultKinds,
    contract: request.contract,
    governance: request.governance,
  });

  if (!classification.ok) {
    return failure("FAULT_CLASSIFICATION_FAILED", classification.error.message, classification.error.boundary);
  }

  const classificationEvents = [...classification.events, "runtime.selfRepair.selfRepairRuntime.fault-classified"];
  const directEscalationReason = escalationReasonForClassification(classification.classification);

  if (classification.classification.repairability === "not-repairable") {
    return escalatedOutcome(
      request,
      runtimeId,
      classification.classification,
      directEscalationReason ?? "not-repairable",
      classificationEvents,
    );
  }

  const plan = buildRuntimeRepairPlan({
    runtimeId,
    classification: classification.classification,
    allowedStepKinds: request.allowedStepKinds,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
  });

  if (!plan.ok) {
    return failure("REPAIR_PLAN_FAILED", plan.error.message, plan.error.boundary);
  }

  const firstStep = plan.plan.steps[0];
  if (firstStep === undefined) {
    return failure("REPAIR_PLAN_FAILED", "self repair runtime requires the repair plan to contain at least one step", "repair-plan");
  }

  const gated = gateRuntimeRepairAction({
    runtimeId,
    plan: plan.plan,
    stepId: firstStep.stepId,
    allowedStepKinds: request.allowedStepKinds,
    approvedStepIds: request.approvedStepIds,
    allowHighRisk: request.allowHighRisk,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
  });

  const events = [
    ...classificationEvents,
    ...plan.events,
    "runtime.selfRepair.selfRepairRuntime.repair-plan-built",
  ];

  if (!gated.ok) {
    if (gated.error.code === "HIGH_RISK_REPAIR_DENIED" && directEscalationReason !== undefined) {
      return escalatedOutcome(request, runtimeId, classification.classification, directEscalationReason, events, plan.plan);
    }

    return failure("REPAIR_ACTION_GATE_FAILED", gated.error.message, gated.error.boundary);
  }

  const approvalRequired = gated.decision.status === "requires-approval";

  return {
    ok: true,
    outcome: {
      runtimeId,
      status: approvalRequired ? "approval-required" : "plan-ready",
      classification: classification.classification,
      plan: plan.plan,
      actionDecision: gated.decision,
      nextStep: approvalRequired ? "hold-for-approval" : "dry-run-plan-ready",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        runtime: "runtime.selfRepair.selfRepairRuntime",
        contractChecked: true,
        governanceChecked: true,
        stages: approvalRequired
          ? ["fault-classified", "repair-plan-built", "action-gated", "approval-held"]
          : ["fault-classified", "repair-plan-built", "action-gated"],
      },
    },
    events: [
      ...events,
      ...gated.events,
      approvalRequired
        ? "runtime.selfRepair.selfRepairRuntime.approval-required"
        : "runtime.selfRepair.selfRepairRuntime.plan-ready",
    ],
  };
}
