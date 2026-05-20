/*
 * 文件定位：Agent 运行态实现层 / 外部调控面。
 * 核心目的：承载 external Control Port 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  receiveExternalCommand,
  type ExternalCommandEffect,
  type ExternalCommandEnvelope,
  type ExternalCommandReceiverRequest,
  type ExternalControlBoundary,
  type ExternalControlGate,
} from "./externalCommandReceiver.js";
import { guardExternalControl, type ExternalControlGuardDecision, type ExternalControlGuardError } from "./externalControlGuard.js";
import {
  recordExternalControlAudit,
  type ExternalControlAuditEntry,
  type ExternalControlAuditResult,
} from "./externalControlAudit.js";

export type ExternalControlPortErrorCode =
  | "COMMAND_REJECTED"
  | "GUARD_REJECTED"
  | "AUDIT_REJECTED"
  | "REAL_CONTROL_BLOCKED";

export type ExternalControlPortRequest = ExternalCommandReceiverRequest & {
  grantedScopes?: readonly string[];
  allowedEffects?: readonly ExternalCommandEffect[];
  previousAuditEntries?: readonly ExternalControlAuditEntry[];
  execute?: boolean;
  portContract?: ExternalControlGate;
  portGovernance?: ExternalControlGate;
};

export type ExternalControlDispatchPlan = {
  mode: "dry-run";
  commandId: string;
  runtimeId: string;
  targetSurface: string;
  route: readonly string[];
  guardStatus: "allow";
  auditCursor: string;
  actualRuntimeMutationStarted: false;
  actualToolOrModelInvocationStarted: false;
  unsafeSideEffects: false;
};

export type ExternalControlPortError = {
  code: ExternalControlPortErrorCode;
  message: string;
  boundary: ExternalControlBoundary;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type ExternalControlPortResult =
  | {
      ok: true;
      command: ExternalCommandEnvelope;
      guard: ExternalControlGuardDecision;
      audit: ExternalControlAuditEntry;
      dispatch: ExternalControlDispatchPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExternalControlPortError;
      command?: ExternalCommandEnvelope;
      guardError?: ExternalControlGuardError;
      audit?: ExternalControlAuditResult;
      events: readonly string[];
    };

export const externalControlPortDescriptor = {
  surface: "runtime.externalControl",
  capability: "externalControlPort",
  purpose: "receive, guard, audit, and dry-run route external runtime control commands",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function portFailure(
  code: ExternalControlPortErrorCode,
  message: string,
  boundary: ExternalControlBoundary,
  events: readonly string[],
  detail?: {
    command?: ExternalCommandEnvelope;
    guardError?: ExternalControlGuardError;
    audit?: ExternalControlAuditResult;
  },
): ExternalControlPortResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
      internalDetailExposed: false,
    },
    command: detail?.command,
    guardError: detail?.guardError,
    audit: detail?.audit,
    events,
  };
}

export function routeExternalControlCommand(request: ExternalControlPortRequest = {}): ExternalControlPortResult {
  if (request.execute === true) {
    return portFailure(
      "REAL_CONTROL_BLOCKED",
      "external control port blocks real runtime mutation in the first implementation",
      "governance",
      ["runtime.externalControl.port.rejected"],
    );
  }

  const received = receiveExternalCommand(request);
  if (!received.ok) {
    return portFailure(
      "COMMAND_REJECTED",
      received.error.message,
      received.error.boundary,
      [...received.events, "runtime.externalControl.port.rejected"],
    );
  }

  const guarded = guardExternalControl({
    command: received.command,
    grantedScopes: request.grantedScopes,
    allowedEffects: request.allowedEffects,
    runtimeReady: request.runtimeReady,
    contract: request.portContract,
    governance: request.portGovernance,
  });

  if (!guarded.ok) {
    const audit = recordExternalControlAudit({
      command: received.command,
      guardError: guarded.error,
      previousEntries: request.previousAuditEntries,
      evidenceRefs: [guarded.error.code],
      runtimeReady: request.runtimeReady,
    });

    return portFailure(
      "GUARD_REJECTED",
      guarded.error.message,
      guarded.error.boundary,
      [...received.events, ...guarded.events, ...audit.events, "runtime.externalControl.port.rejected"],
      { command: received.command, guardError: guarded.error, audit },
    );
  }

  const audit = recordExternalControlAudit({
    command: received.command,
    guardDecision: guarded.decision,
    previousEntries: request.previousAuditEntries,
    evidenceRefs: guarded.decision.requiredScopes,
    runtimeReady: request.runtimeReady,
  });

  if (!audit.ok) {
    return portFailure(
      "AUDIT_REJECTED",
      audit.error.message,
      audit.error.boundary,
      [...received.events, ...guarded.events, ...audit.events, "runtime.externalControl.port.rejected"],
      { command: received.command, audit },
    );
  }

  return {
    ok: true,
    command: received.command,
    guard: guarded.decision,
    audit: audit.entry,
    dispatch: {
      mode: "dry-run",
      commandId: received.command.commandId,
      runtimeId: received.command.runtimeId,
      targetSurface: received.command.target.surface,
      route: [
        "runtime.externalControl.externalCommandReceiver",
        "runtime.externalControl.externalControlGuard",
        "runtime.externalControl.externalControlAudit",
        "runtime.invocationMethod",
      ],
      guardStatus: guarded.decision.status,
      auditCursor: audit.replay.cursor,
      actualRuntimeMutationStarted: false,
      actualToolOrModelInvocationStarted: false,
      unsafeSideEffects: false,
    },
    events: [
      ...received.events,
      ...guarded.events,
      ...audit.events,
      "runtime.externalControl.port.routed",
    ],
  };
}
