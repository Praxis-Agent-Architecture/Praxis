/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Sandbox Runner 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeRepairActionDecision } from "./repairActionGate.js";
import type { RuntimeRepairPlan, RuntimeRepairPlanStepKind } from "./repairPlanBuilder.js";

export type RuntimeRepairSandboxBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "sandbox";

export type RuntimeRepairSandboxIsolation = "memory" | "process" | "container" | "mock";

export type RuntimeRepairSandboxStatus = "passed" | "blocked";

export type RuntimeRepairSandboxErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPAIR_PLAN"
  | "MISSING_REPAIR_STEP"
  | "REPAIR_STEP_NOT_FOUND"
  | "REPAIR_NOT_ALLOWED"
  | "SANDBOX_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairSandboxGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairSandboxEnvelope = {
  sandboxId?: string;
  isolation?: RuntimeRepairSandboxIsolation;
  allowedStepKinds?: readonly RuntimeRepairPlanStepKind[];
  expectedSignals?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeRepairSandboxRequest = {
  runtimeId?: string;
  plan?: RuntimeRepairPlan;
  stepId?: string;
  gateDecision?: RuntimeRepairActionDecision;
  sandbox?: RuntimeRepairSandboxEnvelope;
  runtimeReady?: boolean;
  contract?: RuntimeRepairSandboxGate;
  governance?: RuntimeRepairSandboxGate;
};

export type RuntimeRepairSandboxRun = {
  runId: string;
  runtimeId: string;
  planId: string;
  stepId: string;
  stepKind: RuntimeRepairPlanStepKind;
  sandboxId: string;
  isolation: RuntimeRepairSandboxIsolation;
  status: RuntimeRepairSandboxStatus;
  expectedEvent: string;
  observedSignals: readonly string[];
  rollbackPoint: string;
  metadata: Readonly<Record<string, unknown>>;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    runner: "runtime.selfRepair.repairSandboxRunner";
    isolated: true;
    executedRealAction: false;
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairSandboxError = {
  code: RuntimeRepairSandboxErrorCode;
  message: string;
  boundary: RuntimeRepairSandboxBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairSandboxResult =
  | {
      ok: true;
      run: RuntimeRepairSandboxRun;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairSandboxError;
      events: readonly string[];
    };

export const runtimeRepairSandboxRunnerDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairSandboxRunner",
  purpose: "simulate self-repair steps inside an injected dry-run sandbox envelope",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as unknown as readonly T[];
}

function failure(
  code: RuntimeRepairSandboxErrorCode,
  message: string,
  boundary: RuntimeRepairSandboxBoundary,
): RuntimeRepairSandboxResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairSandboxRunner.rejected"],
  };
}

export function runRepairSandbox(request?: RuntimeRepairSandboxRequest): RuntimeRepairSandboxResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair sandbox runner requires a runtimeId", "input");
  }

  if (request.plan === undefined) {
    return failure("MISSING_REPAIR_PLAN", "repair sandbox runner requires a repair plan", "input");
  }

  if (!hasText(request.stepId)) {
    return failure("MISSING_REPAIR_STEP", "repair sandbox runner requires a target repair stepId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair sandbox can only run through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair sandbox run was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair sandbox run was rejected by governance",
      "governance",
    );
  }

  const stepId = request.stepId.trim();
  const step = request.plan.steps.find((candidate) => candidate.stepId === stepId);
  if (step === undefined) {
    return failure("REPAIR_STEP_NOT_FOUND", `repair step ${stepId} was not found in the plan`, "input");
  }

  if (request.gateDecision !== undefined && request.gateDecision.status !== "allow") {
    return failure("REPAIR_NOT_ALLOWED", "repair sandbox requires an allow decision from the action gate", "governance");
  }

  const allowedStepKinds = cleanList(request.sandbox?.allowedStepKinds);
  if (allowedStepKinds.length > 0 && !allowedStepKinds.includes(step.kind)) {
    return failure("SANDBOX_SCOPE_DENIED", `repair step ${step.kind} is outside the sandbox scope`, "scope");
  }

  const runtimeId = request.runtimeId.trim();
  const sandboxId = request.sandbox?.sandboxId?.trim() || `${runtimeId}:repairSandbox:${request.plan.planId}`;
  const isolation = request.sandbox?.isolation ?? "mock";
  const observedSignals = cleanList(request.sandbox?.expectedSignals);

  return {
    ok: true,
    run: {
      runId: `${sandboxId}:run:${step.stepId}`,
      runtimeId,
      planId: request.plan.planId,
      stepId: step.stepId,
      stepKind: step.kind,
      sandboxId,
      isolation,
      status: "passed",
      expectedEvent: step.expectedEvent,
      observedSignals,
      rollbackPoint: step.rollbackPoint,
      metadata: request.sandbox?.metadata ?? {},
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        runner: "runtime.selfRepair.repairSandboxRunner",
        isolated: true,
        executedRealAction: false,
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: [`runtime.selfRepair.repairSandboxRunner.${isolation}.passed`],
  };
}
