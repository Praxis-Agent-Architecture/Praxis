/*
 * 文件定位：Agent 执行引擎 / ToolScheduler。
 * 核心目的：用同一种 ToolExecutionUnit 承载普通 tool call 与 EphemeralProcedure step。
 * 边界：只做校验、DAG/wave 调度和状态归档；真实 BaseTool 执行仍由 runtime port 注入。
 */

import type { EphemeralProcedurePlan, EphemeralProcedureStep } from "./ephemeralProcedure.js";
import type { ModelDecisionToolCall } from "./modelDecision.js";

export type ToolExecutionUnitKind = "toolCall" | "procedureStep";

export type ToolExecutionUnit = {
  unitId: string;
  kind: ToolExecutionUnitKind;
  toolId: string;
  input: Readonly<Record<string, unknown>>;
  dependsOn: readonly string[];
  procedureId?: string;
  procedureStepId?: string;
  outputRef?: string;
  riskLevel?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ToolExecutionStatus =
  | "queued"
  | "validating"
  | "awaitingApproval"
  | "scheduled"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type ToolExecutionUnitRecord<TResult = unknown> = {
  unit: ToolExecutionUnit;
  status: ToolExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  result?: TResult;
  error?: {
    code: string;
    message: string;
    publicSafe: true;
  };
  metadata: Readonly<Record<string, unknown>>;
};

export type ToolSchedulerPolicy = {
  executionMode?: "serial" | "parallel" | "mixed";
  continueOnStepFailure?: boolean;
  now?: () => string;
  maxConcurrentUnits?: number;
  signal?: AbortSignal;
};

export type ToolSchedulerExecuteInput = {
  unit: ToolExecutionUnit;
  signal?: AbortSignal;
};

export type ToolSchedulerExecuteResult<TResult = unknown> =
  | { ok: true; result: TResult; metadata?: Readonly<Record<string, unknown>> }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        publicSafe: true;
      };
      metadata?: Readonly<Record<string, unknown>>;
    };

export type ToolSchedulerResult<TResult = unknown> = {
  ok: boolean;
  partial: boolean;
  records: readonly ToolExecutionUnitRecord<TResult>[];
  completedUnitIds: readonly string[];
  failedUnitIds: readonly string[];
  skippedUnitIds: readonly string[];
  events: readonly string[];
};

export function toolExecutionUnitFromToolCall(toolCall: ModelDecisionToolCall): ToolExecutionUnit {
  return {
    unitId: toolCall.callId,
    kind: "toolCall",
    toolId: toolCall.toolId,
    input: toolCall.arguments,
    dependsOn: [],
    metadata: toolCall.providerToolName === undefined ? {} : { providerToolName: toolCall.providerToolName },
  };
}

export function toolExecutionUnitsFromEphemeralProcedure(plan: EphemeralProcedurePlan): readonly ToolExecutionUnit[] {
  return plan.steps.map((step) => toolExecutionUnitFromProcedureStep(plan, step));
}

export function toolExecutionUnitFromProcedureStep(
  plan: EphemeralProcedurePlan,
  step: EphemeralProcedureStep,
): ToolExecutionUnit {
  return {
    unitId: `${plan.procedureId}:${step.stepId}`,
    kind: "procedureStep",
    toolId: step.baseToolId,
    input: step.input,
    dependsOn: step.dependsOn.map((dependency) => `${plan.procedureId}:${dependency}`),
    procedureId: plan.procedureId,
    procedureStepId: step.stepId,
    outputRef: step.outputRef,
    riskLevel: step.riskLevel,
    metadata: {
      procedureId: plan.procedureId,
      procedureStepId: step.stepId,
      outputRef: step.outputRef,
      resourceHints: step.resourceHints,
    },
  };
}

export async function runToolExecutionUnits<TResult>(
  units: readonly ToolExecutionUnit[],
  execute: (input: ToolSchedulerExecuteInput) => Promise<ToolSchedulerExecuteResult<TResult>>,
  policy: ToolSchedulerPolicy = {},
): Promise<ToolSchedulerResult<TResult>> {
  const now = policy.now ?? (() => new Date().toISOString());
  const executionMode = policy.executionMode ?? "parallel";
  const continueOnFailure = policy.continueOnStepFailure === true;
  const pending = new Map(units.map((unit) => [unit.unitId, unit]));
  const completed = new Set<string>();
  const failed = new Set<string>();
  const skipped = new Set<string>();
  const records: ToolExecutionUnitRecord<TResult>[] = [];
  const events: string[] = ["agentCore.execution.toolScheduler.started"];

  while (pending.size > 0) {
    if (policy.signal?.aborted === true) {
      events.push("agentCore.execution.toolScheduler.cancelled");
      for (const unit of pending.values()) {
        skipped.add(unit.unitId);
        records.push(cancelledRecord(unit, now(), "SCHEDULER_ABORTED", "tool execution scheduler was aborted"));
      }
      pending.clear();
      return finalize(false);
    }
    const ready = [...pending.values()].filter((unit) => unit.dependsOn.every((dependency) => completed.has(dependency)));
    if (ready.length === 0) {
      const blocked = [...pending.values()].filter((unit) => unit.dependsOn.some((dependency) => failed.has(dependency) || skipped.has(dependency)));
      if (blocked.length === 0) {
        events.push("agentCore.execution.toolScheduler.unresolvedDependencies");
        return finalize(false);
      }
      for (const unit of blocked) {
        pending.delete(unit.unitId);
        skipped.add(unit.unitId);
        records.push({
          unit,
          status: "skipped",
          completedAt: now(),
          error: {
            code: "DEPENDENCY_FAILED",
            message: `tool execution unit dependency failed: ${unit.unitId}`,
            publicSafe: true,
          },
          metadata: {},
        });
      }
      continue;
    }

    const maxConcurrent = positiveInteger(policy.maxConcurrentUnits);
    const waveLimit = executionMode === "serial" ? 1 : maxConcurrent > 0 ? maxConcurrent : ready.length;
    const wave = ready.slice(0, waveLimit);
    for (const unit of wave) {
      pending.delete(unit.unitId);
    }
    events.push(`agentCore.execution.toolScheduler.wave.${wave.length}`);
    const waveResults = await Promise.all(wave.map(async (unit) => {
      const startedAt = now();
      if (policy.signal?.aborted === true) {
        return cancelledRecord(unit, startedAt, "SCHEDULER_ABORTED", "tool execution scheduler was aborted");
      }
      const result = await execute({ unit, signal: policy.signal });
      const completedAt = now();
      const record: ToolExecutionUnitRecord<TResult> = result.ok
        ? {
            unit,
            status: "completed",
            startedAt,
            completedAt,
            result: result.result,
            metadata: result.metadata ?? {},
          }
        : {
            unit,
            status: "failed",
            startedAt,
            completedAt,
            error: result.error,
            metadata: result.metadata ?? {},
          };
      return record;
    }));

    for (const record of waveResults) {
      records.push(record);
      if (record.status === "completed") {
        completed.add(record.unit.unitId);
      } else if (record.status === "cancelled") {
        skipped.add(record.unit.unitId);
        if (!continueOnFailure) {
          events.push("agentCore.execution.toolScheduler.cancelled");
          for (const unit of pending.values()) {
            skipped.add(unit.unitId);
            records.push(cancelledRecord(unit, now(), "SCHEDULER_ABORTED", "tool execution scheduler was aborted"));
          }
          pending.clear();
          return finalize(false);
        }
      } else {
        failed.add(record.unit.unitId);
        if (!continueOnFailure) {
          events.push("agentCore.execution.toolScheduler.failedFast");
          for (const unit of pending.values()) {
            skipped.add(unit.unitId);
            records.push({
              unit,
              status: "skipped",
              completedAt: now(),
              error: {
                code: "SCHEDULER_CANCELLED_AFTER_FAILURE",
                message: `tool execution unit skipped after failure: ${unit.unitId}`,
                publicSafe: true,
              },
              metadata: {},
            });
          }
          pending.clear();
          return finalize(false);
        }
      }
    }
  }

  return finalize(failed.size === 0 && skipped.size === 0);

  function finalize(ok: boolean): ToolSchedulerResult<TResult> {
    return {
      ok,
      partial: failed.size > 0 || skipped.size > 0,
      records,
      completedUnitIds: [...completed],
      failedUnitIds: [...failed],
      skippedUnitIds: [...skipped],
      events,
    };
  }

  function cancelledRecord(unit: ToolExecutionUnit, timestamp: string, code: string, message: string): ToolExecutionUnitRecord<TResult> {
    return {
      unit,
      status: "cancelled",
      startedAt: timestamp,
      completedAt: timestamp,
      error: { code, message, publicSafe: true },
      metadata: {},
    };
  }
}

function positiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
