/*
 * 文件定位：Runtime foundation / timeline plane。
 * 核心目的：把 session/state/event store 的 durable snapshot 归一成 framework 可读 timeline 报告。
 * 边界：只做 public-safe 读视图，不替代 application transport、executionMonitor 或最终日志存储。
 */

import type { MainLoopStepRecord } from "../../executionEngine/coreLogic/mainLoop.js";
import type {
  PraxisFoundationSessionSnapshot,
  PraxisSessionRecord,
  PraxisTurnRecord,
} from "../runtime.projectPlane/projectStore.js";
import type {
  RuntimeApprovalRecord,
  RuntimeEventRecord,
  RuntimeInvocationRecord,
  RuntimeProcedureRecord,
  RuntimePublicSafeErrorRecord,
  RuntimeSessionSnapshot,
  RuntimeStateRecord,
} from "../runtimeSessionStateEventStore.js";

export type RuntimeTimelineSourceKind = "in-memory" | "sqlite" | "snapshot" | (string & {});

export type RuntimeTimelineItemKind =
  | "session"
  | "sessionFork"
  | "checkpoint"
  | "state"
  | "event"
  | "invocation"
  | "mainLoopStep"
  | "procedure"
  | "approval"
  | "error";

export type RuntimeTimelineItem = {
  itemId: string;
  itemKind: RuntimeTimelineItemKind;
  sessionId: string;
  createdAt: string;
  label: string;
  status?: string;
  turnIndex?: number;
  stepIndex?: number;
  refs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeTimelineCheckpoint = {
  checkpointId: string;
  sessionId: string;
  projectId: string;
  turnId: string;
  turnIndex: number;
  createdAt: string;
  sourceSessionId: string | undefined;
  sourceTurnId: string | undefined;
  messageCount: number;
  messageIds: readonly string[];
  messageRoles: readonly string[];
  summaryCount: number;
  summaryIds: readonly string[];
  artifactCount: number;
  artifactRefs: readonly string[];
  sourceMessageIds: readonly string[];
  sourceTurnIds: readonly string[];
  publicSafe: true;
};

export type RuntimeTimelineSessionFork = {
  forkId: string;
  sourceSessionId: string;
  targetSessionId: string;
  checkpointTurnId: string | undefined;
  createdAt: string;
  reason: string | undefined;
  forkKind: "rewind" | "fork" | (string & {});
  publicSafe: true;
};

export type RuntimeTimelineReport = {
  kind: "praxis.runtime.timeline.report";
  publicSafe: true;
  sourceKind: RuntimeTimelineSourceKind;
  session: {
    sessionId: string | undefined;
    runtimeId: string | undefined;
    agentId: string | undefined;
    manifestHash: string | undefined;
    status: string | undefined;
    createdAt: string | undefined;
  };
  counts: {
    states: number;
    events: number;
    invocations: number;
    mainLoopSteps: number;
    procedures: number;
    approvals: number;
    errors: number;
    checkpoints: number;
    sessionForks: number;
    timelineItems: number;
  };
  coverage: {
    hasSession: boolean;
    hasRuntimeEvents: boolean;
    hasInvocations: boolean;
    hasMainLoopSteps: boolean;
    hasProcedures: boolean;
    hasApprovals: boolean;
    hasPublicSafeErrors: boolean;
    hasFoundationSession: boolean;
    hasCheckpoints: boolean;
    hasSessionForks: boolean;
  };
  foundation: {
    sessionId: string | undefined;
    projectId: string | undefined;
    parentSessionId: string | undefined;
    forkedFromTurnId: string | undefined;
    status: string | undefined;
    checkpointCount: number;
    messageCount: number;
    summaryCount: number;
    artifactCount: number;
    sessionForkCount: number;
  };
  eventTypes: readonly string[];
  invocationKinds: readonly string[];
  mainLoopActions: readonly string[];
  errorCodes: readonly string[];
  checkpointTurnIds: readonly string[];
  checkpoints: readonly RuntimeTimelineCheckpoint[];
  sessionForks: readonly RuntimeTimelineSessionFork[];
  timelineItems: readonly RuntimeTimelineItem[];
};

export type RuntimeTimelineQuery = {
  itemKinds?: readonly RuntimeTimelineItemKind[];
  sessionId?: string;
  turnId?: string;
  ref?: string;
  status?: string;
  labelIncludes?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  limit?: number;
};

export type RuntimeTimelineQueryResult = {
  kind: "praxis.runtime.timeline.queryResult";
  publicSafe: true;
  sourceKind: RuntimeTimelineSourceKind;
  query: RuntimeTimelineQuery;
  totalItems: number;
  matchedItems: number;
  returnedItems: number;
  timelineItems: readonly RuntimeTimelineItem[];
};

export type RuntimeTimelineIndex = {
  kind: "praxis.runtime.timeline.index";
  publicSafe: true;
  sourceKind: RuntimeTimelineSourceKind;
  totalItems: number;
  byItemKind: Readonly<Record<string, number>>;
  bySessionId: Readonly<Record<string, number>>;
  byStatus: Readonly<Record<string, number>>;
  byTurnId: Readonly<Record<string, number>>;
  byRef: Readonly<Record<string, number>>;
  checkpointTurnIds: readonly string[];
  sessionForkIds: readonly string[];
};

export type RuntimeTimelineReplayPlan = {
  kind: "praxis.runtime.timeline.replayPlan";
  publicSafe: true;
  sourceKind: RuntimeTimelineSourceKind;
  status: "ready" | "unavailable";
  mode: "read-only-plan";
  sourceSessionId: string | undefined;
  targetSessionId: string | undefined;
  checkpointTurnId: string | undefined;
  checkpointItemId: string | undefined;
  sessionForkId: string | undefined;
  replayItemIds: readonly string[];
  requiredPolicy: {
    execution: "none";
    requiresApplicationRewind: boolean;
    requiresConversationPlane: boolean;
    requiresSessionPlane: boolean;
  };
  reason: string | undefined;
};

export type CreateRuntimeTimelineReportInput = {
  sourceKind?: RuntimeTimelineSourceKind;
  snapshot: RuntimeSessionSnapshot;
  foundationSnapshot?: PraxisFoundationSessionSnapshot;
};

export type QueryRuntimeTimelineInput = {
  report: RuntimeTimelineReport;
  query?: RuntimeTimelineQuery;
};

export type CreateRuntimeTimelineReplayPlanInput = {
  report: RuntimeTimelineReport;
  checkpointTurnId?: string;
  targetSessionId?: string;
};

function uniqueSorted(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))].sort();
}

function refs(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => value !== undefined && value.trim().length > 0);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("credential") ||
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("authorization") ||
    normalized === "auth" ||
    normalized.endsWith("auth");
}

function publicSafeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicSafeValue);
  if (value !== null && typeof value === "object") {
    return publicSafeMetadata(value as Readonly<Record<string, unknown>>);
  }
  return value;
}

function publicSafeMetadata(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    output[key] = isSensitiveKey(key) ? "[redacted]" : publicSafeValue(value);
  }
  return output;
}

function increment(map: Map<string, number>, key: string | undefined): void {
  if (key === undefined || key.trim().length === 0) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function numberLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function metadataTurnId(item: RuntimeTimelineItem): string | undefined {
  return stringValue(item.metadata.turnId) ??
    stringValue(item.metadata.targetTurnId) ??
    stringValue(item.metadata.checkpointTurnId) ??
    (item.itemKind === "checkpoint" ? item.label : undefined);
}

function itemMatchesQuery(item: RuntimeTimelineItem, query: RuntimeTimelineQuery): boolean {
  if (query.itemKinds !== undefined && !query.itemKinds.includes(item.itemKind)) return false;
  if (query.sessionId !== undefined && item.sessionId !== query.sessionId) return false;
  if (query.turnId !== undefined && metadataTurnId(item) !== query.turnId && !item.refs.includes(query.turnId)) return false;
  if (query.ref !== undefined && !item.refs.includes(query.ref)) return false;
  if (query.status !== undefined && item.status !== query.status) return false;
  if (query.labelIncludes !== undefined && !item.label.includes(query.labelIncludes)) return false;
  if (query.createdAtFrom !== undefined && item.createdAt.localeCompare(query.createdAtFrom) < 0) return false;
  if (query.createdAtTo !== undefined && item.createdAt.localeCompare(query.createdAtTo) > 0) return false;
  return true;
}

function sessionCreatedAt(snapshot: RuntimeSessionSnapshot): string {
  return snapshot.session?.createdAt ?? "1970-01-01T00:00:00.000Z";
}

function stateItem(record: RuntimeStateRecord): RuntimeTimelineItem {
  return {
    itemId: `state:${record.stateId}`,
    itemKind: "state",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.phase,
    refs: refs([record.stateId]),
    metadata: publicSafeMetadata(record.metadata),
    publicSafe: true,
  };
}

function eventItem(record: RuntimeEventRecord): RuntimeTimelineItem {
  return {
    itemId: `event:${record.eventId}`,
    itemKind: "event",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.type,
    refs: refs([record.eventId]),
    metadata: publicSafeMetadata(record.payload),
    publicSafe: true,
  };
}

function invocationItem(record: RuntimeInvocationRecord): RuntimeTimelineItem {
  return {
    itemId: `invocation:${record.invocationId}`,
    itemKind: "invocation",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: `${record.kind}: ${record.target}`,
    status: record.ok ? "completed" : "failed",
    refs: refs([record.invocationId]),
    metadata: publicSafeMetadata(record.summary),
    publicSafe: true,
  };
}

function stepCreatedAt(record: MainLoopStepRecord): string {
  return record.timestamps.completedAt ??
    record.timestamps.failedAt ??
    record.timestamps.interruptedAt ??
    record.timestamps.waitingApprovalAt ??
    record.timestamps.startedAt ??
    record.timestamps.plannedAt;
}

function mainLoopStepItem(record: MainLoopStepRecord): RuntimeTimelineItem {
  return {
    itemId: `mainLoopStep:${record.stepId}`,
    itemKind: "mainLoopStep",
    sessionId: record.sessionId,
    createdAt: stepCreatedAt(record),
    label: record.actionPrimitive,
    status: record.status,
    turnIndex: record.turnIndex,
    stepIndex: record.stepIndex,
    refs: refs([
      record.stepId,
      record.modelCallId,
      record.toolCallId,
      record.procedureId,
      record.promptPackRef,
      record.loweredPromptRef,
      ...record.inputRefs,
      ...record.outputRefs,
      ...record.observationRefs,
    ]),
    metadata: publicSafeMetadata(record.metadata),
    publicSafe: true,
  };
}

function procedureItem(record: RuntimeProcedureRecord): RuntimeTimelineItem {
  return {
    itemId: `procedure:${record.procedureId}`,
    itemKind: "procedure",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.procedureId,
    status: record.status,
    refs: refs([record.procedureId]),
    metadata: publicSafeMetadata(record.summary),
    publicSafe: true,
  };
}

function approvalItem(record: RuntimeApprovalRecord): RuntimeTimelineItem {
  return {
    itemId: `approval:${record.approvalId}`,
    itemKind: "approval",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.reason,
    status: record.status,
    refs: refs([record.approvalId, ...record.requestedScopes]),
    metadata: publicSafeMetadata(record.metadata),
    publicSafe: true,
  };
}

function errorItem(record: RuntimePublicSafeErrorRecord): RuntimeTimelineItem {
  return {
    itemId: `error:${record.errorId}`,
    itemKind: "error",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.code,
    status: "failed",
    refs: refs([record.errorId]),
    metadata: publicSafeMetadata(record.metadata),
    publicSafe: true,
  };
}

function sessionItem(snapshot: RuntimeSessionSnapshot): RuntimeTimelineItem[] {
  if (snapshot.session === undefined) return [];
  return [{
    itemId: `session:${snapshot.session.sessionId}`,
    itemKind: "session",
    sessionId: snapshot.session.sessionId,
    createdAt: snapshot.session.createdAt,
    label: snapshot.session.agentId,
    status: snapshot.session.status,
    refs: refs([snapshot.session.runtimeId, snapshot.session.manifestHash]),
    metadata: publicSafeMetadata(snapshot.session.metadata),
    publicSafe: true,
  }];
}

function sourceSessionId(session: PraxisSessionRecord | undefined): string | undefined {
  return session?.parentSessionId ?? stringValue(session?.metadata.forkedFromSessionId);
}

function sourceTurnId(turn: PraxisTurnRecord): string | undefined {
  return stringValue(turn.metadata.sourceTurnId);
}

function sourceMessageIds(messages: PraxisFoundationSessionSnapshot["messages"]): readonly string[] {
  return messages.map((message) => stringValue(message.metadata.sourceMessageId))
    .filter((value): value is string => value !== undefined);
}

function sourceTurnIds(turn: PraxisTurnRecord, messages: PraxisFoundationSessionSnapshot["messages"]): readonly string[] {
  return uniqueSorted([
    sourceTurnId(turn),
    ...messages.map((message) => stringValue(message.metadata.sourceTurnId)),
  ]);
}

function checkpointRecords(snapshot: PraxisFoundationSessionSnapshot | undefined): readonly RuntimeTimelineCheckpoint[] {
  if (snapshot === undefined) return [];
  return snapshot.turns.map((turn) => {
    const messages = snapshot.messages.filter((message) => message.turnId === turn.turnId);
    const summaries = snapshot.summaries.filter((summary) => summary.compactedUntilTurnId === turn.turnId);
    const artifactRefs = messages.flatMap((message) => message.artifactRefs);
    return {
      checkpointId: `checkpoint:${turn.sessionId}:${turn.turnId}`,
      sessionId: turn.sessionId,
      projectId: turn.projectId,
      turnId: turn.turnId,
      turnIndex: turn.turnIndex,
      createdAt: turn.createdAt,
      sourceSessionId: stringValue(turn.metadata.sourceSessionId),
      sourceTurnId: sourceTurnId(turn),
      messageCount: messages.length,
      messageIds: messages.map((message) => message.messageId),
      messageRoles: uniqueSorted(messages.map((message) => message.role)),
      summaryCount: summaries.length,
      summaryIds: summaries.map((summary) => summary.summaryId),
      artifactCount: artifactRefs.length,
      artifactRefs,
      sourceMessageIds: sourceMessageIds(messages),
      sourceTurnIds: sourceTurnIds(turn, messages),
      publicSafe: true,
    };
  });
}

function sessionForkRecords(snapshot: PraxisFoundationSessionSnapshot | undefined): readonly RuntimeTimelineSessionFork[] {
  if (snapshot?.session === undefined) return [];
  const sourceSession = sourceSessionId(snapshot.session);
  if (sourceSession === undefined) return [];
  const reason = stringValue(snapshot.session.metadata.source);
  return [{
    forkId: `sessionFork:${sourceSession}:${snapshot.session.sessionId}`,
    sourceSessionId: sourceSession,
    targetSessionId: snapshot.session.sessionId,
    checkpointTurnId: snapshot.session.forkedFromTurnId ?? stringValue(snapshot.session.metadata.forkedFromTurnId),
    createdAt: snapshot.session.createdAt,
    reason,
    forkKind: reason === "application.rewind" ? "rewind" : "fork",
    publicSafe: true,
  }];
}

function checkpointItem(record: RuntimeTimelineCheckpoint): RuntimeTimelineItem {
  return {
    itemId: record.checkpointId,
    itemKind: "checkpoint",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    label: record.turnId,
    status: "checkpoint",
    turnIndex: record.turnIndex,
    refs: refs([
      record.turnId,
      record.sourceSessionId,
      record.sourceTurnId,
      ...record.messageIds,
      ...record.summaryIds,
      ...record.artifactRefs,
      ...record.sourceMessageIds,
      ...record.sourceTurnIds,
    ]),
    metadata: publicSafeMetadata({
      projectId: record.projectId,
      checkpoint: true,
      relationKind: "checkpoint",
      messageCount: record.messageCount,
      messageIds: record.messageIds,
      messageRoles: record.messageRoles,
      summaryCount: record.summaryCount,
      summaryIds: record.summaryIds,
      artifactCount: record.artifactCount,
      artifactRefs: record.artifactRefs,
      sourceSessionId: record.sourceSessionId,
      sourceTurnId: record.sourceTurnId,
      sourceMessageIds: record.sourceMessageIds,
      sourceTurnIds: record.sourceTurnIds,
    }),
    publicSafe: true,
  };
}

function sessionForkItem(record: RuntimeTimelineSessionFork): RuntimeTimelineItem {
  return {
    itemId: record.forkId,
    itemKind: "sessionFork",
    sessionId: record.targetSessionId,
    createdAt: record.createdAt,
    label: `${record.sourceSessionId} -> ${record.targetSessionId}`,
    status: "forked",
    refs: refs([record.sourceSessionId, record.targetSessionId, record.checkpointTurnId]),
    metadata: {
      sourceSessionId: record.sourceSessionId,
      targetSessionId: record.targetSessionId,
      checkpointTurnId: record.checkpointTurnId,
      reason: record.reason,
      forkKind: record.forkKind,
    },
    publicSafe: true,
  };
}

function orderItems(items: readonly RuntimeTimelineItem[]): readonly RuntimeTimelineItem[] {
  return [...items].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    (left.turnIndex ?? -1) - (right.turnIndex ?? -1) ||
    (left.stepIndex ?? -1) - (right.stepIndex ?? -1) ||
    left.itemKind.localeCompare(right.itemKind) ||
    left.itemId.localeCompare(right.itemId)
  );
}

export function createRuntimeTimelineReport(input: CreateRuntimeTimelineReportInput): RuntimeTimelineReport {
  const snapshot = input.snapshot;
  const checkpoints = checkpointRecords(input.foundationSnapshot);
  const sessionForks = sessionForkRecords(input.foundationSnapshot);
  const timelineItems = orderItems([
    ...sessionItem(snapshot),
    ...sessionForks.map(sessionForkItem),
    ...checkpoints.map(checkpointItem),
    ...snapshot.states.map(stateItem),
    ...snapshot.events.map(eventItem),
    ...snapshot.invocations.map(invocationItem),
    ...snapshot.mainLoopSteps.map(mainLoopStepItem),
    ...snapshot.procedures.map(procedureItem),
    ...snapshot.approvals.map(approvalItem),
    ...snapshot.errors.map(errorItem),
  ]);
  return {
    kind: "praxis.runtime.timeline.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? "snapshot",
    session: {
      sessionId: snapshot.session?.sessionId,
      runtimeId: snapshot.session?.runtimeId,
      agentId: snapshot.session?.agentId,
      manifestHash: snapshot.session?.manifestHash,
      status: snapshot.session?.status,
      createdAt: snapshot.session?.createdAt ?? sessionCreatedAt(snapshot),
    },
    counts: {
      states: snapshot.states.length,
      events: snapshot.events.length,
      invocations: snapshot.invocations.length,
      mainLoopSteps: snapshot.mainLoopSteps.length,
      procedures: snapshot.procedures.length,
      approvals: snapshot.approvals.length,
      errors: snapshot.errors.length,
      checkpoints: checkpoints.length,
      sessionForks: sessionForks.length,
      timelineItems: timelineItems.length,
    },
    coverage: {
      hasSession: snapshot.session !== undefined,
      hasRuntimeEvents: snapshot.events.length > 0,
      hasInvocations: snapshot.invocations.length > 0,
      hasMainLoopSteps: snapshot.mainLoopSteps.length > 0,
      hasProcedures: snapshot.procedures.length > 0,
      hasApprovals: snapshot.approvals.length > 0,
      hasPublicSafeErrors: snapshot.errors.length > 0,
      hasFoundationSession: input.foundationSnapshot?.session !== undefined,
      hasCheckpoints: checkpoints.length > 0,
      hasSessionForks: sessionForks.length > 0,
    },
    foundation: {
      sessionId: input.foundationSnapshot?.session?.sessionId,
      projectId: input.foundationSnapshot?.session?.projectId,
      parentSessionId: input.foundationSnapshot?.session?.parentSessionId ?? sourceSessionId(input.foundationSnapshot?.session),
      forkedFromTurnId: input.foundationSnapshot?.session?.forkedFromTurnId ?? stringValue(input.foundationSnapshot?.session?.metadata.forkedFromTurnId),
      status: input.foundationSnapshot?.session?.status,
      checkpointCount: checkpoints.length,
      messageCount: input.foundationSnapshot?.messages.length ?? 0,
      summaryCount: input.foundationSnapshot?.summaries.length ?? 0,
      artifactCount: input.foundationSnapshot?.artifacts.length ?? 0,
      sessionForkCount: sessionForks.length,
    },
    eventTypes: uniqueSorted(snapshot.events.map((event) => event.type)),
    invocationKinds: uniqueSorted(snapshot.invocations.map((invocation) => invocation.kind)),
    mainLoopActions: uniqueSorted(snapshot.mainLoopSteps.map((step) => step.actionPrimitive)),
    errorCodes: uniqueSorted(snapshot.errors.map((error) => error.code)),
    checkpointTurnIds: uniqueSorted(checkpoints.map((checkpoint) => checkpoint.turnId)),
    checkpoints,
    sessionForks,
    timelineItems,
  };
}

export function createRuntimeTimelineIndex(report: RuntimeTimelineReport): RuntimeTimelineIndex {
  const byItemKind = new Map<string, number>();
  const bySessionId = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byTurnId = new Map<string, number>();
  const byRef = new Map<string, number>();
  for (const item of report.timelineItems) {
    increment(byItemKind, item.itemKind);
    increment(bySessionId, item.sessionId);
    increment(byStatus, item.status);
    increment(byTurnId, metadataTurnId(item));
    for (const ref of item.refs) increment(byRef, ref);
  }
  return {
    kind: "praxis.runtime.timeline.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalItems: report.timelineItems.length,
    byItemKind: sortedRecord(byItemKind),
    bySessionId: sortedRecord(bySessionId),
    byStatus: sortedRecord(byStatus),
    byTurnId: sortedRecord(byTurnId),
    byRef: sortedRecord(byRef),
    checkpointTurnIds: report.checkpointTurnIds,
    sessionForkIds: report.sessionForks.map((fork) => fork.forkId).sort(),
  };
}

export function queryRuntimeTimeline(input: QueryRuntimeTimelineInput): RuntimeTimelineQueryResult {
  const query = input.query ?? {};
  const matched = input.report.timelineItems.filter((item) => itemMatchesQuery(item, query));
  const limit = numberLimit(query.limit);
  const timelineItems = limit === undefined ? matched : matched.slice(0, limit);
  return {
    kind: "praxis.runtime.timeline.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalItems: input.report.timelineItems.length,
    matchedItems: matched.length,
    returnedItems: timelineItems.length,
    timelineItems,
  };
}

export function createRuntimeTimelineReplayPlan(input: CreateRuntimeTimelineReplayPlanInput): RuntimeTimelineReplayPlan {
  const checkpoint = input.checkpointTurnId === undefined
    ? input.report.checkpoints.at(-1)
    : input.report.checkpoints.find((item) => item.turnId === input.checkpointTurnId);
  const fork = input.targetSessionId === undefined
    ? input.report.sessionForks.find((item) => item.checkpointTurnId === checkpoint?.turnId) ?? input.report.sessionForks[0]
    : input.report.sessionForks.find((item) => item.targetSessionId === input.targetSessionId);
  const checkpointTurnId = checkpoint?.turnId ?? input.checkpointTurnId ?? fork?.checkpointTurnId;
  const sourceSessionId = fork?.sourceSessionId ?? checkpoint?.sourceSessionId;
  const targetSessionId = fork?.targetSessionId ?? input.targetSessionId ?? input.report.foundation.sessionId;
  const replayItems = checkpointTurnId === undefined
    ? []
    : queryRuntimeTimeline({
      report: input.report,
      query: { turnId: checkpointTurnId },
    }).timelineItems;
  const ready = checkpoint !== undefined && checkpointTurnId !== undefined;
  return {
    kind: "praxis.runtime.timeline.replayPlan",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    status: ready ? "ready" : "unavailable",
    mode: "read-only-plan",
    sourceSessionId,
    targetSessionId,
    checkpointTurnId,
    checkpointItemId: checkpoint?.checkpointId,
    sessionForkId: fork?.forkId,
    replayItemIds: replayItems.map((item) => item.itemId),
    requiredPolicy: {
      execution: "none",
      requiresApplicationRewind: true,
      requiresConversationPlane: true,
      requiresSessionPlane: true,
    },
    reason: ready ? "checkpoint selected for application-managed replay" : "checkpoint was not found in timeline report",
  };
}
