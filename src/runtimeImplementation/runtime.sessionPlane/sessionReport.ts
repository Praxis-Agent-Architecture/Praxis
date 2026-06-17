/*
 * 文件定位：Runtime foundation / session read surface。
 * 核心目的：把 project/session/conversation 的 foundation snapshot 归一成 framework 可读的 public-safe session 报告。
 * 边界：只做只读检查视图，不创建 session、不复制消息、不替代 timeline 或 governance plane。
 */

import type {
  PraxisConversationRole,
  PraxisFoundationProjectSnapshot,
  PraxisFoundationSessionSnapshot,
  PraxisSessionRecord,
} from "../runtime.projectPlane/projectStore.js";

export type RuntimeSessionReportSourceKind = "in-memory" | "sqlite" | "snapshot" | (string & {});

export type RuntimeSessionTurnReport = {
  turnId: string;
  projectId: string;
  sessionId: string;
  turnIndex: number;
  createdAt: string;
  checkpoint: true;
  messageCount: number;
  messageIds: readonly string[];
  messageRoles: readonly PraxisConversationRole[];
  artifactRefs: readonly string[];
  sourceSessionId: string | undefined;
  sourceTurnId: string | undefined;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeSessionMessageDigest = {
  messageId: string;
  projectId: string;
  sessionId: string;
  turnId: string;
  role: PraxisConversationRole;
  createdAt: string;
  artifactRefs: readonly string[];
  sourceSessionId: string | undefined;
  sourceMessageId: string | undefined;
  sourceTurnId: string | undefined;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeSessionReport = {
  kind: "praxis.runtime.session.report";
  publicSafe: true;
  sourceKind: RuntimeSessionReportSourceKind;
  session: {
    sessionId: string | undefined;
    projectId: string | undefined;
    workspaceId: string | undefined;
    agentId: string | undefined;
    activeAgentKey: string | undefined;
    parentSessionId: string | undefined;
    forkedFromTurnId: string | undefined;
    status: string | undefined;
    title: string | undefined;
    createdAt: string | undefined;
    updatedAt: string | undefined;
    metadata: Readonly<Record<string, unknown>>;
  };
  project: {
    projectId: string | undefined;
    kind: string | undefined;
    name: string | undefined;
    defaultSessionId: string | undefined;
    sessionCount: number;
    workspaceCount: number;
    activeLeaseCount: number;
  };
  counts: {
    bindings: number;
    turns: number;
    checkpoints: number;
    messages: number;
    summaries: number;
    artifacts: number;
    projectSessions: number;
    projectWorkspaces: number;
    activeLeases: number;
    copiedMessages: number;
    copiedTurns: number;
  };
  coverage: {
    hasSession: boolean;
    hasProject: boolean;
    hasAgentBindings: boolean;
    hasTurns: boolean;
    hasCheckpoints: boolean;
    hasMessages: boolean;
    hasSummaries: boolean;
    hasArtifacts: boolean;
    hasForkRelation: boolean;
    hasCopiedConversation: boolean;
  };
  consistency: {
    sessionMatchesProject: boolean;
    allBindingsBelongToSession: boolean;
    allTurnsBelongToSession: boolean;
    allMessagesBelongToSession: boolean;
    allSummariesBelongToSession: boolean;
    allArtifactsBelongToProject: boolean;
    messageTurnIdsKnown: boolean;
    checkpointTurnIdsMatchTurns: boolean;
    forkSourceRecorded: boolean;
    publicSafe: true;
  };
  fork: {
    sourceSessionId: string | undefined;
    targetSessionId: string | undefined;
    forkedFromTurnId: string | undefined;
    forkKind: "rewind" | "fork" | (string & {}) | undefined;
    copiedTurnIds: readonly string[];
    copiedMessageIds: readonly string[];
    publicSafe: true;
  };
  roleCounts: Readonly<Record<string, number>>;
  turnIds: readonly string[];
  checkpointTurnIds: readonly string[];
  messageIds: readonly string[];
  summaryIds: readonly string[];
  artifactRefs: readonly string[];
  sourceMessageIds: readonly string[];
  sourceTurnIds: readonly string[];
  bindings: readonly {
    bindingId: string;
    agentId: string;
    agentKey: string | undefined;
    reason: string;
    createdAt: string;
    metadata: Readonly<Record<string, unknown>>;
    publicSafe: true;
  }[];
  turns: readonly RuntimeSessionTurnReport[];
  messages: readonly RuntimeSessionMessageDigest[];
};

export type CreateRuntimeSessionReportInput = {
  sourceKind?: RuntimeSessionReportSourceKind;
  foundationSnapshot: PraxisFoundationSessionSnapshot;
  projectSnapshot?: PraxisFoundationProjectSnapshot;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (isRecord(value)) return publicSafeMetadata(value);
  return value;
}

function publicSafeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    output[key] = isSensitiveKey(key) ? "[redacted]" : publicSafeValue(value);
  }
  return output;
}

function uniqueSorted(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))].sort();
}

function refs(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => value !== undefined && value.trim().length > 0);
}

function increment(map: Map<string, number>, key: string | undefined): void {
  if (key === undefined || key.trim().length === 0) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function sourceSessionId(session: PraxisSessionRecord | undefined): string | undefined {
  return session?.parentSessionId ?? stringValue(session?.metadata.forkedFromSessionId);
}

function sourceTurnIdFromMetadata(metadata: Readonly<Record<string, unknown>>): string | undefined {
  return stringValue(metadata.sourceTurnId);
}

function sourceSessionIdFromMetadata(metadata: Readonly<Record<string, unknown>>): string | undefined {
  return stringValue(metadata.sourceSessionId);
}

function forkKind(session: PraxisSessionRecord | undefined): RuntimeSessionReport["fork"]["forkKind"] {
  const source = stringValue(session?.metadata.source);
  if (source === "application.rewind") return "rewind";
  if (source !== undefined) return source;
  return sourceSessionId(session) === undefined ? undefined : "fork";
}

function orderTurnIds(snapshot: PraxisFoundationSessionSnapshot): readonly string[] {
  return [...snapshot.turns]
    .sort((left, right) => left.turnIndex - right.turnIndex || left.turnId.localeCompare(right.turnId))
    .map((turn) => turn.turnId);
}

function artifactRefs(snapshot: PraxisFoundationSessionSnapshot): readonly string[] {
  return uniqueSorted([
    ...snapshot.messages.flatMap((message) => message.artifactRefs),
    ...snapshot.artifacts.map((artifact) => artifact.artifactId),
    ...snapshot.artifacts.map((artifact) => artifact.uri),
  ]);
}

export function createRuntimeSessionReport(input: CreateRuntimeSessionReportInput): RuntimeSessionReport {
  const snapshot = input.foundationSnapshot;
  const session = snapshot.session;
  const turnIds = orderTurnIds(snapshot);
  const turnIdSet = new Set(turnIds);
  const checkpointTurnIds = uniqueSorted(snapshot.turns.filter((turn) => turn.checkpoint).map((turn) => turn.turnId));
  const roleCounts = new Map<string, number>();
  for (const message of snapshot.messages) increment(roleCounts, message.role);
  const copiedTurnIds = uniqueSorted(snapshot.turns
    .filter((turn) => sourceTurnIdFromMetadata(turn.metadata) !== undefined)
    .map((turn) => turn.turnId));
  const copiedMessageIds = uniqueSorted(snapshot.messages
    .filter((message) => stringValue(message.metadata.sourceMessageId) !== undefined)
    .map((message) => message.messageId));
  const turns = snapshot.turns.map((turn): RuntimeSessionTurnReport => {
    const messages = snapshot.messages.filter((message) => message.turnId === turn.turnId);
    return {
      turnId: turn.turnId,
      projectId: turn.projectId,
      sessionId: turn.sessionId,
      turnIndex: turn.turnIndex,
      createdAt: turn.createdAt,
      checkpoint: true,
      messageCount: messages.length,
      messageIds: messages.map((message) => message.messageId),
      messageRoles: uniqueSorted(messages.map((message) => message.role)) as readonly PraxisConversationRole[],
      artifactRefs: uniqueSorted(messages.flatMap((message) => message.artifactRefs)),
      sourceSessionId: sourceSessionIdFromMetadata(turn.metadata),
      sourceTurnId: sourceTurnIdFromMetadata(turn.metadata),
      metadata: publicSafeMetadata(turn.metadata),
      publicSafe: true,
    };
  });
  const messages = snapshot.messages.map((message): RuntimeSessionMessageDigest => ({
    messageId: message.messageId,
    projectId: message.projectId,
    sessionId: message.sessionId,
    turnId: message.turnId,
    role: message.role,
    createdAt: message.createdAt,
    artifactRefs: message.artifactRefs,
    sourceSessionId: sourceSessionIdFromMetadata(message.metadata),
    sourceMessageId: stringValue(message.metadata.sourceMessageId),
    sourceTurnId: sourceTurnIdFromMetadata(message.metadata),
    metadata: publicSafeMetadata(message.metadata),
    publicSafe: true,
  }));
  const forkSourceSessionId = sourceSessionId(session);
  const projectSessions = input.projectSnapshot?.sessions ?? [];
  const projectWorkspaces = input.projectSnapshot?.workspaces ?? [];
  const activeLeases = (input.projectSnapshot?.leases ?? []).filter((lease) => lease.status === "active");
  const sourceMessageIds = uniqueSorted(snapshot.messages.map((message) => stringValue(message.metadata.sourceMessageId)));
  const sourceTurnIds = uniqueSorted([
    ...snapshot.turns.map((turn) => sourceTurnIdFromMetadata(turn.metadata)),
    ...snapshot.messages.map((message) => sourceTurnIdFromMetadata(message.metadata)),
    ...snapshot.summaries.map((summary) => summary.sourceTurnId),
  ]);
  const sessionId = session?.sessionId;
  const projectId = session?.projectId ?? input.projectSnapshot?.project?.projectId;
  return {
    kind: "praxis.runtime.session.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? "snapshot",
    session: {
      sessionId,
      projectId: session?.projectId,
      workspaceId: session?.workspaceId,
      agentId: session?.agentId,
      activeAgentKey: session?.activeAgentKey,
      parentSessionId: session?.parentSessionId,
      forkedFromTurnId: session?.forkedFromTurnId ?? stringValue(session?.metadata.forkedFromTurnId),
      status: session?.status,
      title: session?.title,
      createdAt: session?.createdAt,
      updatedAt: session?.updatedAt,
      metadata: publicSafeMetadata(session?.metadata),
    },
    project: {
      projectId: input.projectSnapshot?.project?.projectId,
      kind: input.projectSnapshot?.project?.kind,
      name: input.projectSnapshot?.project?.name,
      defaultSessionId: input.projectSnapshot?.project?.defaultSessionId,
      sessionCount: projectSessions.length,
      workspaceCount: projectWorkspaces.length,
      activeLeaseCount: activeLeases.length,
    },
    counts: {
      bindings: snapshot.bindings.length,
      turns: snapshot.turns.length,
      checkpoints: checkpointTurnIds.length,
      messages: snapshot.messages.length,
      summaries: snapshot.summaries.length,
      artifacts: snapshot.artifacts.length,
      projectSessions: projectSessions.length,
      projectWorkspaces: projectWorkspaces.length,
      activeLeases: activeLeases.length,
      copiedMessages: copiedMessageIds.length,
      copiedTurns: copiedTurnIds.length,
    },
    coverage: {
      hasSession: session !== undefined,
      hasProject: input.projectSnapshot?.project !== undefined,
      hasAgentBindings: snapshot.bindings.length > 0,
      hasTurns: snapshot.turns.length > 0,
      hasCheckpoints: checkpointTurnIds.length > 0,
      hasMessages: snapshot.messages.length > 0,
      hasSummaries: snapshot.summaries.length > 0,
      hasArtifacts: snapshot.artifacts.length > 0,
      hasForkRelation: forkSourceSessionId !== undefined,
      hasCopiedConversation: copiedTurnIds.length > 0 || copiedMessageIds.length > 0,
    },
    consistency: {
      sessionMatchesProject: input.projectSnapshot === undefined ||
        session === undefined ||
        input.projectSnapshot.project === undefined ||
        input.projectSnapshot.project.projectId === session.projectId,
      allBindingsBelongToSession: sessionId === undefined || snapshot.bindings.every((binding) => binding.sessionId === sessionId),
      allTurnsBelongToSession: sessionId === undefined || snapshot.turns.every((turn) => turn.sessionId === sessionId),
      allMessagesBelongToSession: sessionId === undefined || snapshot.messages.every((message) => message.sessionId === sessionId),
      allSummariesBelongToSession: sessionId === undefined || snapshot.summaries.every((summary) => summary.sessionId === sessionId),
      allArtifactsBelongToProject: projectId === undefined || snapshot.artifacts.every((artifact) => artifact.projectId === projectId),
      messageTurnIdsKnown: snapshot.messages.every((message) => turnIdSet.has(message.turnId)),
      checkpointTurnIdsMatchTurns: checkpointTurnIds.every((turnId) => turnIdSet.has(turnId)),
      forkSourceRecorded: forkSourceSessionId === undefined ||
        snapshot.turns.some((turn) => sourceSessionIdFromMetadata(turn.metadata) === forkSourceSessionId) ||
        snapshot.messages.some((message) => sourceSessionIdFromMetadata(message.metadata) === forkSourceSessionId) ||
        snapshot.summaries.some((summary) => summary.sourceSessionId === forkSourceSessionId),
      publicSafe: true,
    },
    fork: {
      sourceSessionId: forkSourceSessionId,
      targetSessionId: sessionId,
      forkedFromTurnId: session?.forkedFromTurnId ?? stringValue(session?.metadata.forkedFromTurnId),
      forkKind: forkKind(session),
      copiedTurnIds,
      copiedMessageIds,
      publicSafe: true,
    },
    roleCounts: sortedRecord(roleCounts),
    turnIds,
    checkpointTurnIds,
    messageIds: snapshot.messages.map((message) => message.messageId),
    summaryIds: snapshot.summaries.map((summary) => summary.summaryId),
    artifactRefs: artifactRefs(snapshot),
    sourceMessageIds,
    sourceTurnIds,
    bindings: snapshot.bindings.map((binding) => ({
      bindingId: binding.bindingId,
      agentId: binding.agentId,
      agentKey: binding.agentKey,
      reason: binding.reason,
      createdAt: binding.createdAt,
      metadata: publicSafeMetadata(binding.metadata),
      publicSafe: true,
    })),
    turns,
    messages,
  };
}
