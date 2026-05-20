/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：记录治理相关的通过、拒绝、覆盖、审批、委托和异常行为。
 * 能力要求1：需要给 debug、inspection、managementPlane 提供可回放的治理证据。
 * 能力要求2：审计记录应服务后续安全、调试和运行质量判断。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GovernanceAuditAction = "pass" | "reject" | "override" | "approval" | "delegation" | "exception";

export type GovernanceAuditActorKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "operator"
  | "external-control";

export type GovernanceAuditBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type GovernanceAuditErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTOR"
  | "MISSING_ACTION"
  | "MISSING_SUBJECT"
  | "RUNTIME_NOT_READY";

export type GovernanceAuditActor = {
  kind: GovernanceAuditActorKind;
  id: string;
};

export type GovernanceAuditEntry = {
  auditId: string;
  runtimeId: string;
  actor: GovernanceAuditActor;
  action: GovernanceAuditAction;
  subject: string;
  summary: string;
  evidenceRefs: readonly string[];
  occurredAt: string;
  replayable: true;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type GovernanceAuditTrailRequest = {
  runtimeId?: string;
  actor?: GovernanceAuditActor;
  action?: GovernanceAuditAction;
  subject?: string;
  summary?: string;
  evidenceRefs?: readonly string[];
  previousEntries?: readonly GovernanceAuditEntry[];
  occurredAt?: string;
  runtimeReady?: boolean;
  internalDetail?: unknown;
};

export type GovernanceAuditTrailError = {
  code: GovernanceAuditErrorCode;
  message: string;
  boundary: GovernanceAuditBoundary;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type GovernanceAuditReplay = {
  cursor: string;
  entries: readonly GovernanceAuditEntry[];
};

export type GovernanceAuditTrailResult =
  | {
      ok: true;
      entry: GovernanceAuditEntry;
      trail: readonly GovernanceAuditEntry[];
      replay: GovernanceAuditReplay;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GovernanceAuditTrailError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: GovernanceAuditErrorCode,
  message: string,
  boundary: GovernanceAuditBoundary,
): GovernanceAuditTrailResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.governance.auditTrail.rejected"],
  };
}

function summarize(action: GovernanceAuditAction, subject: string, summary: string | undefined): string {
  const trimmed = summary?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `governance ${action} recorded for ${subject}`;
}

export function recordGovernanceAuditTrail(
  request?: GovernanceAuditTrailRequest,
): GovernanceAuditTrailResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "governance audit trail requires a runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "governance audit trail requires a runtimeId", "input");
  }

  const actor = request.actor;
  if (actor === undefined || isBlank(actor.id)) {
    return failure("MISSING_ACTOR", "governance audit trail requires an actor", "input");
  }

  const action = request.action;
  if (action === undefined) {
    return failure("MISSING_ACTION", "governance audit trail requires an action", "input");
  }

  const subject = request.subject?.trim();
  if (!subject) {
    return failure("MISSING_SUBJECT", "governance audit trail requires a subject", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "governance audit trail can only record a ready runtime", "runtime-state");
  }

  const previousEntries = request.previousEntries ?? [];
  const occurredAt = request.occurredAt?.trim() || "dry-run";
  const auditId = `${runtimeId}:${action}:${subject}:${previousEntries.length + 1}`;
  const entry: GovernanceAuditEntry = {
    auditId,
    runtimeId,
    actor: {
      kind: actor.kind,
      id: actor.id.trim(),
    },
    action,
    subject,
    summary: summarize(action, subject, request.summary),
    evidenceRefs: cleanList(request.evidenceRefs),
    occurredAt,
    replayable: true,
    safeForInspection: true,
    internalDetailExposed: false,
  };
  const trail = [...previousEntries, entry];

  return {
    ok: true,
    entry,
    trail,
    replay: {
      cursor: auditId,
      entries: trail,
    },
    events: ["runtime.governance.auditTrail.recorded"],
  };
}
