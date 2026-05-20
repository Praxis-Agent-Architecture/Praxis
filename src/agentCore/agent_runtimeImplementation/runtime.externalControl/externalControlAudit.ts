/*
 * 文件定位：Agent 运行态实现层 / 外部调控面。
 * 核心目的：承载 external Control Audit 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ExternalCommandEnvelope, ExternalControlBoundary, ExternalControlCaller } from "./externalCommandReceiver.js";
import type { ExternalControlGuardDecision, ExternalControlGuardError } from "./externalControlGuard.js";

export type ExternalControlAuditOutcome = "received" | "allowed" | "rejected" | "blocked";

export type ExternalControlAuditErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTOR"
  | "MISSING_SUBJECT"
  | "RUNTIME_NOT_READY";

export type ExternalControlAuditActor = ExternalControlCaller;

export type ExternalControlAuditEntry = {
  auditId: string;
  runtimeId: string;
  actor: ExternalControlAuditActor;
  outcome: ExternalControlAuditOutcome;
  subject: string;
  commandId?: string;
  commandName?: string;
  targetSurface?: string;
  decisionStatus?: "allow";
  rejectionCode?: string;
  evidenceRefs: readonly string[];
  summary: string;
  occurredAt: string;
  replayable: true;
  safeForInspection: true;
  internalDetailExposed: false;
  unsafeSideEffects: false;
};

export type ExternalControlAuditRequest = {
  runtimeId?: string;
  actor?: ExternalControlAuditActor;
  outcome?: ExternalControlAuditOutcome;
  subject?: string;
  command?: ExternalCommandEnvelope;
  guardDecision?: ExternalControlGuardDecision;
  guardError?: ExternalControlGuardError;
  evidenceRefs?: readonly string[];
  previousEntries?: readonly ExternalControlAuditEntry[];
  occurredAt?: string;
  runtimeReady?: boolean;
  internalDetail?: unknown;
};

export type ExternalControlAuditError = {
  code: ExternalControlAuditErrorCode;
  message: string;
  boundary: ExternalControlBoundary;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type ExternalControlAuditReplay = {
  cursor: string;
  entries: readonly ExternalControlAuditEntry[];
};

export type ExternalControlAuditResult =
  | {
      ok: true;
      entry: ExternalControlAuditEntry;
      trail: readonly ExternalControlAuditEntry[];
      replay: ExternalControlAuditReplay;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExternalControlAuditError;
      events: readonly string[];
    };

export const externalControlAuditDescriptor = {
  surface: "runtime.externalControl",
  capability: "externalControlAudit",
  purpose: "record replayable inspection-safe evidence for external runtime control",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ExternalControlAuditErrorCode,
  message: string,
  boundary: ExternalControlBoundary,
): ExternalControlAuditResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.externalControl.audit.rejected"],
  };
}

function normalizeActor(actor: ExternalControlAuditActor): ExternalControlAuditActor {
  return {
    kind: actor.kind,
    id: actor.id.trim(),
    moduleId: actor.moduleId?.trim() || undefined,
    sessionId: actor.sessionId?.trim() || undefined,
  };
}

function resolveOutcome(request: ExternalControlAuditRequest): ExternalControlAuditOutcome {
  if (request.outcome !== undefined) {
    return request.outcome;
  }

  if (request.guardDecision !== undefined) {
    return "allowed";
  }

  if (request.guardError !== undefined) {
    return "rejected";
  }

  return "received";
}

function summarize(entry: {
  outcome: ExternalControlAuditOutcome;
  subject: string;
  commandName?: string;
  rejectionCode?: string;
}): string {
  if (entry.rejectionCode !== undefined) {
    return `external control ${entry.outcome} for ${entry.subject}: ${entry.rejectionCode}`;
  }

  if (entry.commandName !== undefined) {
    return `external control ${entry.outcome} for ${entry.commandName}`;
  }

  return `external control ${entry.outcome} for ${entry.subject}`;
}

export function recordExternalControlAudit(request: ExternalControlAuditRequest = {}): ExternalControlAuditResult {
  const runtimeId = request.runtimeId?.trim() || request.command?.runtimeId;
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "external control audit requires runtimeId", "input");
  }

  const actor = request.actor ?? request.command?.caller;
  if (actor === undefined || isBlank(actor.id)) {
    return failure("MISSING_ACTOR", "external control audit requires an actor", "input");
  }

  const subject = request.subject?.trim() || request.command?.target.operation || request.command?.commandName;
  if (isBlank(subject)) {
    return failure("MISSING_SUBJECT", "external control audit requires a subject", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "external control audit requires a ready runtime", "runtime-state");
  }

  const previousEntries = request.previousEntries ?? [];
  const outcome = resolveOutcome(request);
  const occurredAt = request.occurredAt?.trim() || request.command?.trace.receivedAt || "dry-run";
  const rejectionCode = request.guardError?.code;
  const entry: ExternalControlAuditEntry = {
    auditId: `${runtimeId}:external-control:${subject}:${previousEntries.length + 1}`,
    runtimeId: runtimeId ?? "",
    actor: normalizeActor(actor),
    outcome,
    subject: subject ?? "",
    commandId: request.command?.commandId,
    commandName: request.command?.commandName,
    targetSurface: request.command?.target.surface,
    decisionStatus: request.guardDecision?.status,
    rejectionCode,
    evidenceRefs: cleanList(request.evidenceRefs),
    summary: summarize({
      outcome,
      subject: subject ?? "",
      commandName: request.command?.commandName,
      rejectionCode,
    }),
    occurredAt,
    replayable: true,
    safeForInspection: true,
    internalDetailExposed: false,
    unsafeSideEffects: false,
  };
  const trail = [...previousEntries, entry];

  return {
    ok: true,
    entry,
    trail,
    replay: {
      cursor: entry.auditId,
      entries: trail,
    },
    events: ["runtime.externalControl.audit.recorded"],
  };
}
