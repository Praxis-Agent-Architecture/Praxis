/*
 * Runtime foundation / multiagent read surface.
 * Purpose: normalize existing official-bridge, BaseTool, mesh, and application-event facts into a public-safe report.
 * Boundary: read-only inspection only; does not spawn agents, schedule child runtimes, or replace multiagent strategy.
 */

import type { PraxisApplicationEvent } from "../../applicationLayer/applicationContract.js";

export type RuntimeMultiagentSourceKind =
  | "runtime-smoke"
  | "application-events"
  | "snapshot"
  | (string & {});

export type RuntimeMultiagentApplicationEvent = Pick<
  PraxisApplicationEvent,
  "eventId" | "kind" | "status" | "message" | "createdAt" | "sessionId" | "runtimeId" | "turnId" | "publicSafe" | "metadata"
>;

export type RuntimeMultiagentSmokeFacts = {
  status?: string;
  officialBridge?: {
    ok?: boolean;
    topology?: string;
    runtimeMediatedAccess?: readonly string[];
    unsafeSideEffects?: boolean;
    events?: readonly string[];
  };
  baseTools?: {
    mountedToolIds?: readonly string[];
    invokedToolIds?: readonly string[];
    runtimePortUsed?: boolean;
  };
  mesh?: {
    projectLocal?: boolean;
    rootSessionId?: string;
    childSessionId?: string;
    initialMessage?: {
      messageId?: string;
      fromSessionId?: string;
      toSessionId?: string;
    };
    childInboxBeforeReply?: number;
    waitReplyText?: string;
    rootInboxUnreadAfterWait?: number;
    listedSessionCount?: number;
    inspectStatus?: string;
    stoppedStatus?: string;
    killedStatus?: string;
    publicSafeSession?: boolean;
  };
  guards?: {
    workspaceEscapeRejected?: boolean;
  };
};

export type RuntimeMultiagentBridgeReport = {
  ok: boolean;
  topology: string | undefined;
  runtimeMediatedAccess: readonly string[];
  unsafeSideEffects: boolean | undefined;
  events: readonly string[];
  publicSafe: true;
};

export type RuntimeMultiagentToolReport = {
  mountedToolIds: readonly string[];
  invokedToolIds: readonly string[];
  runtimePortUsed: boolean | undefined;
  publicSafe: true;
};

export type RuntimeMultiagentSessionReport = {
  sessionId: string;
  role: "root" | "child";
  status: string | undefined;
  lifecycle: string | undefined;
  runtimeId: string | undefined;
  agentId: string | undefined;
  projectLocal: boolean | undefined;
  publicSafe: true;
};

export type RuntimeMultiagentMessageReport = {
  messageId: string;
  fromSessionId: string | undefined;
  toSessionId: string | undefined;
  replyToMessageId: string | undefined;
  completesMessageId: string | undefined;
  correlationRole: "initial" | "reply" | "provider-tool-output" | "unknown";
  textPreview: string | undefined;
  publicSafe: true;
};

export type RuntimeMultiagentApplicationReport = {
  toolExposure: {
    expectedProviderName: string | undefined;
    exposesExpectedTool: boolean | undefined;
    exposedProviderNames: readonly string[];
    toolCount: number | undefined;
    publicSafe: true;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean | undefined;
    callId: string | undefined;
    outputIncludesChildSession: boolean | undefined;
    secondProviderInputItems: number | undefined;
    publicSafe: true;
  };
  backgroundRun: {
    childProviderCalled: boolean | undefined;
    childRuntimeId: string | undefined;
    childReplyTextPreview: string | undefined;
    publicSafe: true;
  };
  eventIds: readonly string[];
  publicSafe: true;
};

export type RuntimeMultiagentCoverage = {
  hasOfficialBridge: boolean;
  hasRuntimeMediatedAccess: boolean;
  hasAgentBaseTools: boolean;
  hasRuntimePortEvidence: boolean;
  hasProjectLocalMesh: boolean;
  hasReplyCorrelation: boolean;
  hasPublicSafeSessionRead: boolean;
  hasWorkspaceGuard: boolean;
  hasApplicationToolExposure: boolean;
  hasApplicationEventPath: boolean;
  hasBackgroundRuntime: boolean;
};

export type RuntimeMultiagentReport = {
  kind: "praxis.runtime.multiagent.report";
  publicSafe: true;
  sourceKind: RuntimeMultiagentSourceKind;
  status: "ok" | "failed" | "unknown";
  session: {
    rootSessionId: string | undefined;
    childSessionId: string | undefined;
    childRuntimeId: string | undefined;
  };
  counts: {
    sessions: number;
    childSessions: number;
    mountedTools: number;
    invokedTools: number;
    runtimeMediatedAccess: number;
    applicationEvents: number;
    spawnedEvents: number;
    completedEvents: number;
  };
  coverage: RuntimeMultiagentCoverage;
  bridge: RuntimeMultiagentBridgeReport;
  baseTools: RuntimeMultiagentToolReport;
  application: RuntimeMultiagentApplicationReport;
  sessions: readonly RuntimeMultiagentSessionReport[];
  messages: readonly RuntimeMultiagentMessageReport[];
  guardrails: {
    workspaceEscapeRejected: boolean | undefined;
    publicSafeSession: boolean | undefined;
    unsafeSecretLikeTextRedacted: true;
    publicSafe: true;
  };
  refs: readonly string[];
};

export type RuntimeMultiagentIndex = {
  kind: "praxis.runtime.multiagent.index";
  publicSafe: true;
  sourceKind: RuntimeMultiagentSourceKind;
  totalSessions: number;
  totalMessages: number;
  bySessionStatus: Readonly<Record<string, number>>;
  byToolId: Readonly<Record<string, number>>;
  byEventKind: Readonly<Record<string, number>>;
  childSessionIds: readonly string[];
  runtimeMediatedAccess: readonly string[];
};

export type RuntimeMultiagentQuery = {
  sessionId?: string;
  role?: RuntimeMultiagentSessionReport["role"];
  status?: string;
  toolId?: string;
  eventKind?: "spawned" | "completed" | "tool" | "runtime";
  ref?: string;
  limit?: number;
};

export type RuntimeMultiagentQueryResult = {
  kind: "praxis.runtime.multiagent.queryResult";
  publicSafe: true;
  sourceKind: RuntimeMultiagentSourceKind;
  query: RuntimeMultiagentQuery;
  totalSessions: number;
  totalMessages: number;
  matchedSessions: number;
  matchedMessages: number;
  returnedSessions: number;
  returnedMessages: number;
  sessions: readonly RuntimeMultiagentSessionReport[];
  messages: readonly RuntimeMultiagentMessageReport[];
  refs: readonly string[];
};

export type CreateRuntimeMultiagentReportInput = {
  sourceKind?: RuntimeMultiagentSourceKind;
  smoke?: RuntimeMultiagentSmokeFacts;
  applicationEvents?: readonly RuntimeMultiagentApplicationEvent[];
  applicationFacts?: {
    providerToolExposure?: {
      expectedProviderName?: string;
      exposesExpectedTool?: boolean;
      exposedProviderNames?: readonly string[];
      toolCount?: number;
    };
    providerRoundTrip?: {
      toolOutputFedBack?: boolean;
      callId?: string;
      outputIncludesChildSession?: boolean;
      secondProviderInputItems?: number;
    };
    backgroundRun?: {
      childProviderCalled?: boolean;
      childRuntimeId?: string;
      childReplyText?: string;
      childReplyTextPreview?: string;
    };
    toolEvent?: {
      toolId?: string;
      toolStatus?: string;
      childSessionId?: string;
      familyKey?: string;
    };
  };
};

export type QueryRuntimeMultiagentInput = {
  report: RuntimeMultiagentReport;
  query?: RuntimeMultiagentQuery;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueSorted(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))].sort();
}

function refs(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))];
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

function eventMetadata(event: RuntimeMultiagentApplicationEvent | undefined): Readonly<Record<string, unknown>> {
  return isRecord(event?.metadata) ? event.metadata : {};
}

function eventKind(event: RuntimeMultiagentApplicationEvent): string {
  if (event.kind === "runtime" && event.eventId.includes(".multiagent.spawned")) return "spawned";
  if (event.kind === "runtime" && event.eventId.includes(".multiagent.completed")) return "completed";
  return event.kind;
}

function redactPreview(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const withoutSecretLikeWords = value
    .replace(/secret[^\s,}]*/gi, "[redacted]")
    .replace(/token[^\s,}]*/gi, "[redacted]")
    .replace(/password[^\s,}]*/gi, "[redacted]")
    .replace(/authorization[^\s,}]*/gi, "[redacted]");
  return withoutSecretLikeWords.length > 200 ? `${withoutSecretLikeWords.slice(0, 197)}...` : withoutSecretLikeWords;
}

function firstSpawnedEvent(events: readonly RuntimeMultiagentApplicationEvent[]): RuntimeMultiagentApplicationEvent | undefined {
  return events.find((event) => event.kind === "runtime" && event.eventId.includes(".multiagent.spawned"));
}

function firstCompletedEvent(events: readonly RuntimeMultiagentApplicationEvent[]): RuntimeMultiagentApplicationEvent | undefined {
  return events.find((event) => event.kind === "runtime" && event.eventId.includes(".multiagent.completed"));
}

function completedAgentSpawnEvent(events: readonly RuntimeMultiagentApplicationEvent[]): RuntimeMultiagentApplicationEvent | undefined {
  return events.find((event) => {
    const metadata = eventMetadata(event);
    return event.kind === "tool" && metadata.toolId === "agent.spawn" && metadata.toolStatus === "completed";
  });
}

function childSessionIdFromInput(input: CreateRuntimeMultiagentReportInput): string | undefined {
  const events = input.applicationEvents ?? [];
  const spawnedMetadata = eventMetadata(firstSpawnedEvent(events));
  const completedMetadata = eventMetadata(firstCompletedEvent(events));
  const toolMetadata = eventMetadata(completedAgentSpawnEvent(events));
  const toolResultMetadata = isRecord(toolMetadata.resultMetadata) ? toolMetadata.resultMetadata : {};
  const toolOutput = isRecord(toolMetadata.output) ? toolMetadata.output : {};
  const toolOutputSession = isRecord(toolOutput.session) ? toolOutput.session : {};
  return input.smoke?.mesh?.childSessionId ??
    input.applicationFacts?.toolEvent?.childSessionId ??
    stringValue(spawnedMetadata.childSessionId) ??
    stringValue(completedMetadata.childSessionId) ??
    stringValue(toolResultMetadata.sessionId) ??
    stringValue(toolOutputSession.sessionId);
}

function rootSessionIdFromInput(input: CreateRuntimeMultiagentReportInput): string | undefined {
  const smokeRoot = input.smoke?.mesh?.rootSessionId;
  if (smokeRoot !== undefined) return smokeRoot;
  return (input.applicationEvents ?? []).find((event) => event.sessionId !== undefined)?.sessionId;
}

function bridgeReport(input: CreateRuntimeMultiagentReportInput): RuntimeMultiagentBridgeReport {
  const bridge = input.smoke?.officialBridge;
  return {
    ok: bridge?.ok === true,
    topology: bridge?.topology,
    runtimeMediatedAccess: uniqueSorted(bridge?.runtimeMediatedAccess ?? []),
    unsafeSideEffects: bridge?.unsafeSideEffects,
    events: uniqueSorted(bridge?.events ?? []),
    publicSafe: true,
  };
}

function baseToolReport(input: CreateRuntimeMultiagentReportInput): RuntimeMultiagentToolReport {
  const smokeTools = input.smoke?.baseTools;
  const completedSpawn = completedAgentSpawnEvent(input.applicationEvents ?? []);
  const completedSpawnToolId = stringValue(eventMetadata(completedSpawn).toolId);
  return {
    mountedToolIds: uniqueSorted(smokeTools?.mountedToolIds ?? []),
    invokedToolIds: uniqueSorted([
      ...(smokeTools?.invokedToolIds ?? []),
      completedSpawnToolId,
      input.applicationFacts?.toolEvent?.toolId,
    ]),
    runtimePortUsed: smokeTools?.runtimePortUsed,
    publicSafe: true,
  };
}

function applicationReport(input: CreateRuntimeMultiagentReportInput): RuntimeMultiagentApplicationReport {
  const events = input.applicationEvents ?? [];
  const background = input.applicationFacts?.backgroundRun;
  return {
    toolExposure: {
      expectedProviderName: input.applicationFacts?.providerToolExposure?.expectedProviderName,
      exposesExpectedTool: input.applicationFacts?.providerToolExposure?.exposesExpectedTool,
      exposedProviderNames: uniqueSorted(input.applicationFacts?.providerToolExposure?.exposedProviderNames ?? []),
      toolCount: input.applicationFacts?.providerToolExposure?.toolCount,
      publicSafe: true,
    },
    providerRoundTrip: {
      toolOutputFedBack: input.applicationFacts?.providerRoundTrip?.toolOutputFedBack,
      callId: input.applicationFacts?.providerRoundTrip?.callId,
      outputIncludesChildSession: input.applicationFacts?.providerRoundTrip?.outputIncludesChildSession,
      secondProviderInputItems: input.applicationFacts?.providerRoundTrip?.secondProviderInputItems,
      publicSafe: true,
    },
    backgroundRun: {
      childProviderCalled: background?.childProviderCalled,
      childRuntimeId: background?.childRuntimeId,
      childReplyTextPreview: redactPreview(background?.childReplyTextPreview ?? background?.childReplyText),
      publicSafe: true,
    },
    eventIds: refs(events.map((event) => event.eventId)),
    publicSafe: true,
  };
}

function sessionReports(input: CreateRuntimeMultiagentReportInput): readonly RuntimeMultiagentSessionReport[] {
  const rootSessionId = rootSessionIdFromInput(input);
  const childSessionId = childSessionIdFromInput(input);
  const events = input.applicationEvents ?? [];
  const spawnedMetadata = eventMetadata(firstSpawnedEvent(events));
  const completedMetadata = eventMetadata(firstCompletedEvent(events));
  const sessions: RuntimeMultiagentSessionReport[] = [];
  if (rootSessionId !== undefined) {
    sessions.push({
      sessionId: rootSessionId,
      role: "root",
      status: undefined,
      lifecycle: undefined,
      runtimeId: events.find((event) => event.sessionId === rootSessionId)?.runtimeId,
      agentId: undefined,
      projectLocal: input.smoke?.mesh?.projectLocal,
      publicSafe: true,
    });
  }
  if (childSessionId !== undefined) {
    sessions.push({
      sessionId: childSessionId,
      role: "child",
      status: input.smoke?.mesh?.killedStatus ?? input.smoke?.mesh?.stoppedStatus ?? input.smoke?.mesh?.inspectStatus,
      lifecycle: stringValue(spawnedMetadata.childLifecycle) ?? stringValue(completedMetadata.childLifecycle),
      runtimeId: input.applicationFacts?.backgroundRun?.childRuntimeId,
      agentId: stringValue(spawnedMetadata.childAgentId) ?? stringValue(completedMetadata.childAgentId),
      projectLocal: input.smoke?.mesh?.projectLocal,
      publicSafe: true,
    });
  }
  return sessions;
}

function messageReports(input: CreateRuntimeMultiagentReportInput): readonly RuntimeMultiagentMessageReport[] {
  const messages: RuntimeMultiagentMessageReport[] = [];
  const initial = input.smoke?.mesh?.initialMessage;
  if (initial?.messageId !== undefined) {
    messages.push({
      messageId: initial.messageId,
      fromSessionId: initial.fromSessionId,
      toSessionId: initial.toSessionId,
      replyToMessageId: undefined,
      completesMessageId: undefined,
      correlationRole: "initial",
      textPreview: undefined,
      publicSafe: true,
    });
  }
  if (input.smoke?.mesh?.waitReplyText !== undefined) {
    messages.push({
      messageId: `${initial?.messageId ?? "agent-message"}.reply`,
      fromSessionId: input.smoke.mesh.childSessionId,
      toSessionId: input.smoke.mesh.rootSessionId,
      replyToMessageId: initial?.messageId,
      completesMessageId: initial?.messageId,
      correlationRole: "reply",
      textPreview: redactPreview(input.smoke.mesh.waitReplyText),
      publicSafe: true,
    });
  }
  if (input.applicationFacts?.providerRoundTrip?.callId !== undefined) {
    messages.push({
      messageId: input.applicationFacts.providerRoundTrip.callId,
      fromSessionId: undefined,
      toSessionId: childSessionIdFromInput(input),
      replyToMessageId: undefined,
      completesMessageId: undefined,
      correlationRole: "provider-tool-output",
      textPreview: undefined,
      publicSafe: true,
    });
  }
  return messages;
}

function statusFor(input: CreateRuntimeMultiagentReportInput, coverage: RuntimeMultiagentCoverage): RuntimeMultiagentReport["status"] {
  if (input.smoke?.status === "failed") return "failed";
  if (input.smoke?.status === "ok") return "ok";
  if (
    coverage.hasApplicationToolExposure &&
    coverage.hasApplicationEventPath &&
    coverage.hasBackgroundRuntime &&
    coverage.hasReplyCorrelation
  ) {
    return "ok";
  }
  return "unknown";
}

function coverageFor(input: {
  bridge: RuntimeMultiagentBridgeReport;
  baseTools: RuntimeMultiagentToolReport;
  application: RuntimeMultiagentApplicationReport;
  sessions: readonly RuntimeMultiagentSessionReport[];
  messages: readonly RuntimeMultiagentMessageReport[];
  smoke?: RuntimeMultiagentSmokeFacts;
  applicationEvents: readonly RuntimeMultiagentApplicationEvent[];
}): RuntimeMultiagentCoverage {
  const spawnedEvents = input.applicationEvents.filter((event) => eventKind(event) === "spawned");
  const completedEvents = input.applicationEvents.filter((event) => eventKind(event) === "completed");
  return {
    hasOfficialBridge: input.bridge.ok,
    hasRuntimeMediatedAccess: input.bridge.runtimeMediatedAccess.length > 0,
    hasAgentBaseTools: input.baseTools.invokedToolIds.some((toolId) => toolId.startsWith("agent.")),
    hasRuntimePortEvidence: input.baseTools.runtimePortUsed === true,
    hasProjectLocalMesh: input.smoke?.mesh?.projectLocal === true ||
      input.sessions.some((session) => session.sessionId.startsWith("agent-session.")),
    hasReplyCorrelation: input.messages.some((message) =>
      message.correlationRole === "reply" || message.correlationRole === "provider-tool-output"
    ) || input.application.providerRoundTrip.toolOutputFedBack === true,
    hasPublicSafeSessionRead: input.smoke?.mesh?.publicSafeSession === true,
    hasWorkspaceGuard: input.smoke?.guards?.workspaceEscapeRejected === true,
    hasApplicationToolExposure: input.application.toolExposure.exposesExpectedTool === true,
    hasApplicationEventPath: spawnedEvents.length > 0 && completedEvents.length > 0,
    hasBackgroundRuntime: input.application.backgroundRun.childProviderCalled === true ||
      input.application.backgroundRun.childRuntimeId !== undefined,
  };
}

export function createRuntimeMultiagentReport(input: CreateRuntimeMultiagentReportInput = {}): RuntimeMultiagentReport {
  const bridge = bridgeReport(input);
  const baseTools = baseToolReport(input);
  const application = applicationReport(input);
  const sessions = sessionReports(input);
  const messages = messageReports(input);
  const applicationEvents = input.applicationEvents ?? [];
  const spawnedEvents = applicationEvents.filter((event) => eventKind(event) === "spawned");
  const completedEvents = applicationEvents.filter((event) => eventKind(event) === "completed");
  const childSessionId = childSessionIdFromInput(input);
  const coverage = coverageFor({
    bridge,
    baseTools,
    application,
    sessions,
    messages,
    smoke: input.smoke,
    applicationEvents,
  });
  return {
    kind: "praxis.runtime.multiagent.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? (applicationEvents.length > 0 ? "application-events" : "runtime-smoke"),
    status: statusFor(input, coverage),
    session: {
      rootSessionId: rootSessionIdFromInput(input),
      childSessionId,
      childRuntimeId: application.backgroundRun.childRuntimeId,
    },
    counts: {
      sessions: sessions.length,
      childSessions: sessions.filter((session) => session.role === "child").length,
      mountedTools: baseTools.mountedToolIds.length,
      invokedTools: baseTools.invokedToolIds.length,
      runtimeMediatedAccess: bridge.runtimeMediatedAccess.length,
      applicationEvents: applicationEvents.length,
      spawnedEvents: spawnedEvents.length,
      completedEvents: completedEvents.length,
    },
    coverage,
    bridge,
    baseTools,
    application,
    sessions,
    messages,
    guardrails: {
      workspaceEscapeRejected: input.smoke?.guards?.workspaceEscapeRejected,
      publicSafeSession: input.smoke?.mesh?.publicSafeSession,
      unsafeSecretLikeTextRedacted: true,
      publicSafe: true,
    },
    refs: refs([
      input.smoke?.mesh?.rootSessionId,
      childSessionId,
      input.smoke?.mesh?.initialMessage?.messageId,
      input.applicationFacts?.providerRoundTrip?.callId,
      input.applicationFacts?.backgroundRun?.childRuntimeId,
      ...bridge.events,
      ...baseTools.invokedToolIds,
      ...application.eventIds,
    ]),
  };
}

export function createRuntimeMultiagentIndex(report: RuntimeMultiagentReport): RuntimeMultiagentIndex {
  const bySessionStatus = new Map<string, number>();
  const byToolId = new Map<string, number>();
  const byEventKind = new Map<string, number>();
  for (const session of report.sessions) increment(bySessionStatus, session.status);
  for (const toolId of report.baseTools.invokedToolIds) increment(byToolId, toolId);
  for (const eventId of report.application.eventIds) {
    if (eventId.includes(".multiagent.spawned")) increment(byEventKind, "spawned");
    else if (eventId.includes(".multiagent.completed")) increment(byEventKind, "completed");
    else increment(byEventKind, "other");
  }
  return {
    kind: "praxis.runtime.multiagent.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalSessions: report.sessions.length,
    totalMessages: report.messages.length,
    bySessionStatus: sortedRecord(bySessionStatus),
    byToolId: sortedRecord(byToolId),
    byEventKind: sortedRecord(byEventKind),
    childSessionIds: report.sessions.filter((session) => session.role === "child").map((session) => session.sessionId),
    runtimeMediatedAccess: report.bridge.runtimeMediatedAccess,
  };
}

function matchesSession(session: RuntimeMultiagentSessionReport, query: RuntimeMultiagentQuery): boolean {
  if (query.sessionId !== undefined && session.sessionId !== query.sessionId) return false;
  if (query.role !== undefined && session.role !== query.role) return false;
  if (query.status !== undefined && session.status !== query.status) return false;
  return true;
}

function matchesMessage(message: RuntimeMultiagentMessageReport, query: RuntimeMultiagentQuery): boolean {
  if (query.sessionId !== undefined && message.fromSessionId !== query.sessionId && message.toSessionId !== query.sessionId) return false;
  if (query.ref !== undefined && ![
    message.messageId,
    message.fromSessionId,
    message.toSessionId,
    message.replyToMessageId,
    message.completesMessageId,
  ].includes(query.ref)) {
    return false;
  }
  return true;
}

function queryRefs(input: {
  report: RuntimeMultiagentReport;
  query: RuntimeMultiagentQuery;
  sessions: readonly RuntimeMultiagentSessionReport[];
  messages: readonly RuntimeMultiagentMessageReport[];
}): readonly string[] {
  const { query } = input;
  const values = [
    ...input.sessions.map((session) => session.sessionId),
    ...input.messages.flatMap((message) => [
      message.messageId,
      message.fromSessionId,
      message.toSessionId,
      message.replyToMessageId,
      message.completesMessageId,
    ]),
    query.toolId !== undefined && input.report.baseTools.invokedToolIds.includes(query.toolId) ? query.toolId : undefined,
    query.eventKind === "spawned" ? input.report.application.eventIds.find((eventId) => eventId.includes(".multiagent.spawned")) : undefined,
    query.eventKind === "completed" ? input.report.application.eventIds.find((eventId) => eventId.includes(".multiagent.completed")) : undefined,
    query.eventKind === "tool" ? input.report.application.eventIds.find((eventId) => eventId.includes(".tool.")) : undefined,
    query.eventKind === "runtime" ? input.report.application.eventIds.find((eventId) => eventId.includes(".multiagent.")) : undefined,
    query.ref !== undefined && input.report.refs.includes(query.ref) ? query.ref : undefined,
  ];
  return refs(values);
}

export function queryRuntimeMultiagent(input: QueryRuntimeMultiagentInput): RuntimeMultiagentQueryResult {
  const query = input.query ?? {};
  const sessionMatched = input.report.sessions.filter((session) => matchesSession(session, query));
  const messageMatched = input.report.messages.filter((message) => matchesMessage(message, query));
  const limit = numberLimit(query.limit);
  const sessions = limit === undefined ? sessionMatched : sessionMatched.slice(0, limit);
  const messages = limit === undefined ? messageMatched : messageMatched.slice(0, limit);
  return {
    kind: "praxis.runtime.multiagent.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalSessions: input.report.sessions.length,
    totalMessages: input.report.messages.length,
    matchedSessions: sessionMatched.length,
    matchedMessages: messageMatched.length,
    returnedSessions: sessions.length,
    returnedMessages: messages.length,
    sessions,
    messages,
    refs: queryRefs({ report: input.report, query, sessions, messages }),
  };
}
