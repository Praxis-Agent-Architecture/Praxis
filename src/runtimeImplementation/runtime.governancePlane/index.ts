/*
 * 文件定位：Runtime foundation / governance plane read surface。
 * 核心目的：把 session store 中已有的 approval、policy、interface 事实归一成 public-safe 治理报告。
 * 边界：只做只读检查视图，不执行审批、不改变 policy、不替代 application approval UI。
 */

import type {
  RuntimeApprovalRecord,
  RuntimeEventRecord,
  RuntimeSessionSnapshot,
} from "../runtimeSessionStateEventStore.js";

export type RuntimeGovernanceDecisionKind =
  | "approval"
  | "baseToolPolicy"
  | "interfaceApproval"
  | "dependencyPreflight"
  | "other";

export type RuntimeGovernanceDecision = {
  decisionId: string;
  kind: RuntimeGovernanceDecisionKind;
  sessionId: string;
  createdAt: string;
  status: string;
  source: string | undefined;
  toolId: string | undefined;
  approvalId: string | undefined;
  approvalScopeKey: string | undefined;
  riskLevel: string | undefined;
  policyProfile: string | undefined;
  policyMatrixId: string | undefined;
  requestedScopes: readonly string[];
  refs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeGovernanceReport = {
  kind: "praxis.runtime.governance.report";
  publicSafe: true;
  sourceKind: "snapshot" | "sqlite" | "in-memory" | (string & {});
  session: {
    sessionId: string | undefined;
    runtimeId: string | undefined;
    status: string | undefined;
  };
  counts: {
    approvals: number;
    pendingApprovals: number;
    approvedApprovals: number;
    deniedApprovals: number;
    policyDecisions: number;
    interfaceApprovalEnvelopes: number;
    dependencyPreflights: number;
    decisions: number;
  };
  coverage: {
    hasSession: boolean;
    hasApprovals: boolean;
    hasPendingApprovals: boolean;
    hasPolicyDecisions: boolean;
    hasInterfaceApprovalEnvelopes: boolean;
    hasDependencyPreflights: boolean;
  };
  decisions: readonly RuntimeGovernanceDecision[];
};

export type RuntimeGovernanceIndex = {
  kind: "praxis.runtime.governance.index";
  publicSafe: true;
  sourceKind: RuntimeGovernanceReport["sourceKind"];
  totalDecisions: number;
  byKind: Readonly<Record<string, number>>;
  byStatus: Readonly<Record<string, number>>;
  bySource: Readonly<Record<string, number>>;
  byToolId: Readonly<Record<string, number>>;
  byRiskLevel: Readonly<Record<string, number>>;
  byPolicyProfile: Readonly<Record<string, number>>;
  pendingApprovalIds: readonly string[];
  approvalScopeKeys: readonly string[];
};

export type RuntimeGovernanceQuery = {
  kinds?: readonly RuntimeGovernanceDecisionKind[];
  status?: string;
  source?: string;
  toolId?: string;
  approvalId?: string;
  approvalScopeKey?: string;
  riskLevel?: string;
  policyProfile?: string;
  ref?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  limit?: number;
};

export type RuntimeGovernanceQueryResult = {
  kind: "praxis.runtime.governance.queryResult";
  publicSafe: true;
  sourceKind: RuntimeGovernanceReport["sourceKind"];
  query: RuntimeGovernanceQuery;
  totalDecisions: number;
  matchedDecisions: number;
  returnedDecisions: number;
  decisions: readonly RuntimeGovernanceDecision[];
};

export type CreateRuntimeGovernanceReportInput = {
  sourceKind?: RuntimeGovernanceReport["sourceKind"];
  snapshot: RuntimeSessionSnapshot;
};

export type QueryRuntimeGovernanceInput = {
  report: RuntimeGovernanceReport;
  query?: RuntimeGovernanceQuery;
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

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function refs(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))];
}

function metadataRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function policyAdjudicationFrom(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = metadataRecord(payload.policyAdjudication);
  if (Object.keys(direct).length > 0) return direct;
  const metadata = metadataRecord(payload.metadata);
  return metadataRecord(metadata.policyAdjudication);
}

function sandboxPlanFrom(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = metadataRecord(payload.sandboxPlan);
  if (Object.keys(direct).length > 0) return direct;
  const metadata = metadataRecord(payload.metadata);
  return metadataRecord(metadata.sandboxPlan);
}

function approvalScopeFrom(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = metadataRecord(payload.approvalScope);
  if (Object.keys(direct).length > 0) return direct;
  const metadata = metadataRecord(payload.metadata);
  return metadataRecord(metadata.approvalScope);
}

function approvalDecision(record: RuntimeApprovalRecord): RuntimeGovernanceDecision {
  return {
    decisionId: `approval:${record.approvalId}`,
    kind: "approval",
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    status: record.status,
    source: record.source,
    toolId: stringValue(record.metadata.toolId),
    approvalId: record.approvalId,
    approvalScopeKey: stringValue(record.metadata.approvalScopeKey),
    riskLevel: record.riskLevel,
    policyProfile: stringValue(record.metadata.policyProfile),
    policyMatrixId: stringValue(record.metadata.policyMatrixId),
    requestedScopes: record.requestedScopes,
    refs: refs([record.approvalId, ...record.requestedScopes, stringValue(record.metadata.toolId)]),
    metadata: publicSafeMetadata({
      reason: record.reason,
      interfaceSurface: record.interfaceSurface,
      resolution: record.resolution,
      ...record.metadata,
    }),
    publicSafe: true,
  };
}

function eventDecision(record: RuntimeEventRecord): RuntimeGovernanceDecision | undefined {
  if (record.type === "runtime.baseTool.policy.adjudicated") {
    const payload = metadataRecord(record.payload);
    const policyAdjudication = policyAdjudicationFrom(payload);
    const sandboxPlan = sandboxPlanFrom(payload);
    const approvalScope = approvalScopeFrom(payload);
    const toolId = stringValue(payload.toolId) ?? stringValue(policyAdjudication.toolId);
    const approvalScopeKey = stringValue(approvalScope.scopeKey) ?? stringValue(policyAdjudication.humanApprovalScopeKey);
    return {
      decisionId: `policy:${record.eventId}`,
      kind: "baseToolPolicy",
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      status: stringValue(policyAdjudication.action) ?? "adjudicated",
      source: "baseTool",
      toolId,
      approvalId: undefined,
      approvalScopeKey,
      riskLevel: stringValue(policyAdjudication.risk),
      policyProfile: stringValue(policyAdjudication.profile),
      policyMatrixId: stringValue(payload.policyMatrixId) ?? stringValue(metadataRecord(record.payload).policyMatrixId),
      requestedScopes: [],
      refs: refs([record.eventId, toolId, approvalScopeKey]),
      metadata: publicSafeMetadata({
        policyAdjudication,
        sandboxPlan,
        approvalScope,
      }),
      publicSafe: true,
    };
  }
  if (record.type === "runtime.interfaceAdapter.approval.envelope") {
    const envelope = metadataRecord(metadataRecord(record.payload).envelope);
    const payload = metadataRecord(envelope.payload);
    const approvalId = stringValue(payload.approvalId) ?? stringValue(envelope.envelopeId);
    return {
      decisionId: `interfaceApproval:${record.eventId}`,
      kind: "interfaceApproval",
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      status: "pending",
      source: stringValue(payload.source),
      toolId: stringValue(metadataRecord(payload.metadata).toolId),
      approvalId,
      approvalScopeKey: stringValue(metadataRecord(payload.metadata).approvalScopeKey),
      riskLevel: stringValue(payload.riskLevel),
      policyProfile: stringValue(metadataRecord(payload.metadata).policyProfile),
      policyMatrixId: stringValue(metadataRecord(payload.metadata).policyMatrixId),
      requestedScopes: stringArray(payload.requestedScopes),
      refs: refs([record.eventId, approvalId, ...stringArray(payload.requestedScopes)]),
      metadata: publicSafeMetadata({ envelope }),
      publicSafe: true,
    };
  }
  if (record.type === "runtime.baseTool.dependencies.preflight" || record.type === "runtime.baseTool.dependencies.prepared") {
    const payload = metadataRecord(record.payload);
    const preflight = metadataRecord(payload.dependencyPreflight);
    const toolId = stringValue(payload.toolId);
    return {
      decisionId: `dependency:${record.eventId}`,
      kind: "dependencyPreflight",
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      status: stringValue(preflight.decision) ?? stringValue(preflight.status) ?? "preflight",
      source: "runtime",
      toolId,
      approvalId: undefined,
      approvalScopeKey: undefined,
      riskLevel: undefined,
      policyProfile: undefined,
      policyMatrixId: undefined,
      requestedScopes: [],
      refs: refs([record.eventId, toolId, ...stringArray(preflight.approvalRequiredDependencies)]),
      metadata: publicSafeMetadata({ dependencyPreflight: preflight }),
      publicSafe: true,
    };
  }
  return undefined;
}

function orderDecisions(decisions: readonly RuntimeGovernanceDecision[]): readonly RuntimeGovernanceDecision[] {
  return [...decisions].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    left.kind.localeCompare(right.kind) ||
    left.decisionId.localeCompare(right.decisionId)
  );
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

function decisionMatchesQuery(decision: RuntimeGovernanceDecision, query: RuntimeGovernanceQuery): boolean {
  if (query.kinds !== undefined && !query.kinds.includes(decision.kind)) return false;
  if (query.status !== undefined && decision.status !== query.status) return false;
  if (query.source !== undefined && decision.source !== query.source) return false;
  if (query.toolId !== undefined && decision.toolId !== query.toolId) return false;
  if (query.approvalId !== undefined && decision.approvalId !== query.approvalId) return false;
  if (query.approvalScopeKey !== undefined && decision.approvalScopeKey !== query.approvalScopeKey) return false;
  if (query.riskLevel !== undefined && decision.riskLevel !== query.riskLevel) return false;
  if (query.policyProfile !== undefined && decision.policyProfile !== query.policyProfile) return false;
  if (query.ref !== undefined && !decision.refs.includes(query.ref)) return false;
  if (query.createdAtFrom !== undefined && decision.createdAt < query.createdAtFrom) return false;
  if (query.createdAtTo !== undefined && decision.createdAt > query.createdAtTo) return false;
  return true;
}

export function createRuntimeGovernanceReport(input: CreateRuntimeGovernanceReportInput): RuntimeGovernanceReport {
  const decisions = orderDecisions([
    ...input.snapshot.approvals.map(approvalDecision),
    ...input.snapshot.events.map(eventDecision).filter((item): item is RuntimeGovernanceDecision => item !== undefined),
  ]);
  const pendingApprovals = input.snapshot.approvals.filter((record) => record.status === "pending");
  const approvedApprovals = input.snapshot.approvals.filter((record) => record.status === "approved");
  const deniedApprovals = input.snapshot.approvals.filter((record) => record.status === "denied");
  const policyDecisions = decisions.filter((decision) => decision.kind === "baseToolPolicy");
  const interfaceApprovalEnvelopes = decisions.filter((decision) => decision.kind === "interfaceApproval");
  const dependencyPreflights = decisions.filter((decision) => decision.kind === "dependencyPreflight");
  return {
    kind: "praxis.runtime.governance.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? "snapshot",
    session: {
      sessionId: input.snapshot.session?.sessionId,
      runtimeId: input.snapshot.session?.runtimeId,
      status: input.snapshot.session?.status,
    },
    counts: {
      approvals: input.snapshot.approvals.length,
      pendingApprovals: pendingApprovals.length,
      approvedApprovals: approvedApprovals.length,
      deniedApprovals: deniedApprovals.length,
      policyDecisions: policyDecisions.length,
      interfaceApprovalEnvelopes: interfaceApprovalEnvelopes.length,
      dependencyPreflights: dependencyPreflights.length,
      decisions: decisions.length,
    },
    coverage: {
      hasSession: input.snapshot.session !== undefined,
      hasApprovals: input.snapshot.approvals.length > 0,
      hasPendingApprovals: pendingApprovals.length > 0,
      hasPolicyDecisions: policyDecisions.length > 0,
      hasInterfaceApprovalEnvelopes: interfaceApprovalEnvelopes.length > 0,
      hasDependencyPreflights: dependencyPreflights.length > 0,
    },
    decisions,
  };
}

export function createRuntimeGovernanceIndex(report: RuntimeGovernanceReport): RuntimeGovernanceIndex {
  const byKind = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byToolId = new Map<string, number>();
  const byRiskLevel = new Map<string, number>();
  const byPolicyProfile = new Map<string, number>();
  const pendingApprovalIds: string[] = [];
  const approvalScopeKeys: string[] = [];
  for (const decision of report.decisions) {
    increment(byKind, decision.kind);
    increment(byStatus, decision.status);
    increment(bySource, decision.source);
    increment(byToolId, decision.toolId);
    increment(byRiskLevel, decision.riskLevel);
    increment(byPolicyProfile, decision.policyProfile);
    if (decision.kind === "approval" && decision.status === "pending" && decision.approvalId !== undefined) {
      pendingApprovalIds.push(decision.approvalId);
    }
    if (decision.approvalScopeKey !== undefined && !approvalScopeKeys.includes(decision.approvalScopeKey)) {
      approvalScopeKeys.push(decision.approvalScopeKey);
    }
  }
  return {
    kind: "praxis.runtime.governance.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalDecisions: report.decisions.length,
    byKind: sortedRecord(byKind),
    byStatus: sortedRecord(byStatus),
    bySource: sortedRecord(bySource),
    byToolId: sortedRecord(byToolId),
    byRiskLevel: sortedRecord(byRiskLevel),
    byPolicyProfile: sortedRecord(byPolicyProfile),
    pendingApprovalIds: pendingApprovalIds.sort(),
    approvalScopeKeys: approvalScopeKeys.sort(),
  };
}

export function queryRuntimeGovernance(input: QueryRuntimeGovernanceInput): RuntimeGovernanceQueryResult {
  const query = input.query ?? {};
  const matched = input.report.decisions.filter((decision) => decisionMatchesQuery(decision, query));
  const limit = numberLimit(query.limit);
  const decisions = limit === undefined ? matched : matched.slice(0, limit);
  return {
    kind: "praxis.runtime.governance.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalDecisions: input.report.decisions.length,
    matchedDecisions: matched.length,
    returnedDecisions: decisions.length,
    decisions,
  };
}
