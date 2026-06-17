/*
 * 文件定位：Runtime foundation / tool-call read surface。
 * 核心目的：把 session store 中已有的 BaseTool invocation、policy、sandbox、rollback、dependency 和 approval 事实归一成 public-safe 工具调用报告。
 * 边界：只做只读检查视图，不执行工具、不改变 BaseTool 语义、不替代 governance/timeline plane。
 */

import type { MainLoopStepRecord } from "../../executionEngine/coreLogic/mainLoop.js";
import type {
  RuntimeApprovalRecord,
  RuntimeEventRecord,
  RuntimeInvocationRecord,
  RuntimePublicSafeErrorRecord,
  RuntimeSessionSnapshot,
} from "../runtimeSessionStateEventStore.js";

export type RuntimeToolCallSourceKind = "in-memory" | "sqlite" | "snapshot" | (string & {});

export type RuntimeToolCallRecord = {
  callId: string;
  sessionId: string;
  toolId: string;
  createdAt: string;
  ok: boolean;
  status: "completed" | "failed" | "waitingApproval" | "unknown";
  decisionId: string | undefined;
  providerToolName: string | undefined;
  turnIndex: number | undefined;
  stepIndex: number | undefined;
  policy: {
    status: string | undefined;
    action: string | undefined;
    riskLevel: string | undefined;
    policyProfile: string | undefined;
    policyMatrixId: string | undefined;
    approvalScopeKey: string | undefined;
    humanApprovalRequired: boolean | undefined;
    publicSafe: true;
  };
  sandbox: {
    effectiveMode: string | undefined;
    status: string | undefined;
    sandboxRequired: boolean | undefined;
    sandboxStrength: string | undefined;
    commandProviderFamily: string | undefined;
    commandMode: string | undefined;
    commandApplied: boolean | undefined;
    publicSafe: true;
  };
  dependency: {
    status: string | undefined;
    decision: string | undefined;
    missingDependencies: readonly string[];
    installableDependencies: readonly string[];
    publicSafe: true;
  };
  workspaceRollback: {
    required: boolean;
    status: string | undefined;
    restored: boolean | undefined;
    changedFiles: number | undefined;
    publicSafe: true;
  };
  approval: {
    approvalId: string | undefined;
    status: string | undefined;
    riskLevel: string | undefined;
    requestedScopes: readonly string[];
    publicSafe: true;
  };
  refs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeToolCallReport = {
  kind: "praxis.runtime.toolCall.report";
  publicSafe: true;
  sourceKind: RuntimeToolCallSourceKind;
  session: {
    sessionId: string | undefined;
    runtimeId: string | undefined;
    status: string | undefined;
  };
  counts: {
    toolInvocations: number;
    completed: number;
    failed: number;
    waitingApproval: number;
    policyDecisions: number;
    dependencyPreflights: number;
    sandboxPreparedEvents: number;
    workspaceRollbackRequired: number;
    workspaceRollbackRestored: number;
    approvals: number;
    errors: number;
  };
  coverage: {
    hasSession: boolean;
    hasToolInvocations: boolean;
    hasPolicyDecisions: boolean;
    hasDependencyPreflights: boolean;
    hasSandboxEvidence: boolean;
    hasWorkspaceRollbackEvidence: boolean;
    hasApprovals: boolean;
    hasToolErrors: boolean;
  };
  toolIds: readonly string[];
  policyProfiles: readonly string[];
  sandboxModes: readonly string[];
  dependencyStatuses: readonly string[];
  approvalIds: readonly string[];
  errorCodes: readonly string[];
  toolCalls: readonly RuntimeToolCallRecord[];
};

export type RuntimeToolCallIndex = {
  kind: "praxis.runtime.toolCall.index";
  publicSafe: true;
  sourceKind: RuntimeToolCallSourceKind;
  totalToolCalls: number;
  byToolId: Readonly<Record<string, number>>;
  byStatus: Readonly<Record<string, number>>;
  byPolicyProfile: Readonly<Record<string, number>>;
  bySandboxMode: Readonly<Record<string, number>>;
  byApprovalStatus: Readonly<Record<string, number>>;
  byDependencyStatus: Readonly<Record<string, number>>;
  approvalIds: readonly string[];
};

export type RuntimeToolCallQuery = {
  toolId?: string;
  status?: RuntimeToolCallRecord["status"];
  policyProfile?: string;
  sandboxMode?: string;
  approvalStatus?: string;
  dependencyStatus?: string;
  ref?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  limit?: number;
};

export type RuntimeToolCallQueryResult = {
  kind: "praxis.runtime.toolCall.queryResult";
  publicSafe: true;
  sourceKind: RuntimeToolCallSourceKind;
  query: RuntimeToolCallQuery;
  totalToolCalls: number;
  matchedToolCalls: number;
  returnedToolCalls: number;
  toolCalls: readonly RuntimeToolCallRecord[];
};

export type CreateRuntimeToolCallReportInput = {
  sourceKind?: RuntimeToolCallSourceKind;
  snapshot: RuntimeSessionSnapshot;
};

export type QueryRuntimeToolCallsInput = {
  report: RuntimeToolCallReport;
  query?: RuntimeToolCallQuery;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

function payload(record: RuntimeEventRecord | undefined): Readonly<Record<string, unknown>> {
  return isRecord(record?.payload) ? record.payload : {};
}

function metadata(record: MainLoopStepRecord | RuntimePublicSafeErrorRecord | undefined): Readonly<Record<string, unknown>> {
  return isRecord(record?.metadata) ? record.metadata : {};
}

function nested(record: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function eventsForCall(snapshot: RuntimeSessionSnapshot, callId: string): readonly RuntimeEventRecord[] {
  return snapshot.events.filter((item) => item.eventId.includes(callId) || stringValue(item.payload.toolCallId) === callId);
}

function policyEvent(events: readonly RuntimeEventRecord[]): RuntimeEventRecord | undefined {
  return events.find((item) => item.type === "runtime.baseTool.policy.adjudicated");
}

function dependencyEvent(events: readonly RuntimeEventRecord[]): RuntimeEventRecord | undefined {
  return events.find((item) => item.type === "runtime.baseTool.dependencies.preflight" || item.type === "runtime.baseTool.dependencies.prepared");
}

function sandboxPreparedEvents(snapshot: RuntimeSessionSnapshot): readonly RuntimeEventRecord[] {
  return snapshot.events.filter((item) => item.type === "runtime.sandboxPlane.prepared");
}

function approvalsForCall(snapshot: RuntimeSessionSnapshot, callId: string, toolId: string): readonly RuntimeApprovalRecord[] {
  return snapshot.approvals.filter((approval) =>
    stringValue(approval.metadata.toolCallId) === callId ||
    stringValue(approval.metadata.toolId) === toolId ||
    approval.requestedScopes.includes(`tool.${toolId}`) ||
    approval.approvalId.includes(callId)
  );
}

function errorsForCall(snapshot: RuntimeSessionSnapshot, callId: string, toolId: string): readonly RuntimePublicSafeErrorRecord[] {
  return snapshot.errors.filter((error) =>
    stringValue(error.metadata.toolCallId) === callId ||
    stringValue(error.metadata.toolId) === toolId ||
    error.errorId.includes(callId)
  );
}

function stepForCall(snapshot: RuntimeSessionSnapshot, callId: string): MainLoopStepRecord | undefined {
  return snapshot.mainLoopSteps.find((step) => step.toolCallId === callId || step.outputRefs.includes(callId));
}

function statusFor(input: {
  invocation: RuntimeInvocationRecord;
  step: MainLoopStepRecord | undefined;
  errors: readonly RuntimePublicSafeErrorRecord[];
  approvals: readonly RuntimeApprovalRecord[];
}): RuntimeToolCallRecord["status"] {
  if (input.step?.status === "waitingApproval" || input.errors.some((error) => error.code === "APPROVAL_REQUIRED")) {
    return "waitingApproval";
  }
  if (input.invocation.ok) return "completed";
  if (input.approvals.some((approval) => approval.status === "pending")) return "waitingApproval";
  return "failed";
}

function commandSandboxRecord(summary: Readonly<Record<string, unknown>>, eventPayload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = nested(summary, "commandSandbox");
  if (Object.keys(direct).length > 0) return direct;
  return nested(eventPayload, "commandSandbox");
}

function workspaceRollbackDiff(summary: Readonly<Record<string, unknown>>, policyPayload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = nested(summary, "workspaceRollbackDiff");
  if (Object.keys(direct).length > 0) return direct;
  const metadataValue = nested(summary, "metadata");
  const nestedDiff = nested(metadataValue, "workspaceRollbackDiff");
  if (Object.keys(nestedDiff).length > 0) return nestedDiff;
  return nested(policyPayload, "workspaceRollbackDiff");
}

function workspaceRollbackPlan(summary: Readonly<Record<string, unknown>>, policyPayload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const direct = nested(summary, "workspaceRollback");
  if (Object.keys(direct).length > 0) return direct;
  return nested(policyPayload, "workspaceRollback");
}

function toolCallRecord(input: {
  snapshot: RuntimeSessionSnapshot;
  invocation: RuntimeInvocationRecord;
}): RuntimeToolCallRecord {
  const callEvents = eventsForCall(input.snapshot, input.invocation.invocationId);
  const policy = policyEvent(callEvents);
  const dependency = dependencyEvent(callEvents);
  const step = stepForCall(input.snapshot, input.invocation.invocationId);
  const approvals = approvalsForCall(input.snapshot, input.invocation.invocationId, input.invocation.target);
  const errors = errorsForCall(input.snapshot, input.invocation.invocationId, input.invocation.target);
  const summary = input.invocation.summary;
  const policyPayload = payload(policy);
  const policyAdjudication = nested(policyPayload, "policyAdjudication");
  const sandboxPlan = nested(policyPayload, "sandboxPlan");
  const dependencyPreflight = nested(payload(dependency), "dependencyPreflight");
  const rollbackPlan = workspaceRollbackPlan(summary, policyPayload);
  const rollbackDiff = workspaceRollbackDiff(summary, policyPayload);
  const commandSandbox = commandSandboxRecord(summary, policyPayload);
  const approval = approvals[0];
  const status = statusFor({ invocation: input.invocation, step, errors, approvals });
  const policyProfile = stringValue(policyAdjudication.profile) ?? stringValue(nested(summary, "governance").policyProfile);
  const policyMatrixId = stringValue(policyPayload.policyMatrixId) ?? stringValue(nested(summary, "governance").policyMatrixId);
  const sandboxMode = stringValue(sandboxPlan.effectiveMode) ?? stringValue(summary.sandboxMode);
  const dependencyStatus = stringValue(dependencyPreflight.status) ?? stringValue(nested(summary, "dependencyRuntime").status);
  const dependencyDecision = stringValue(dependencyPreflight.decision) ?? stringValue(nested(summary, "dependencyRuntime").decision);
  return {
    callId: input.invocation.invocationId,
    sessionId: input.invocation.sessionId,
    toolId: input.invocation.target,
    createdAt: input.invocation.createdAt,
    ok: input.invocation.ok,
    status,
    decisionId: stringValue(summary.decisionId),
    providerToolName: stringValue(metadata(step).providerToolName) ?? stringValue(summary.providerToolName),
    turnIndex: step?.turnIndex,
    stepIndex: step?.stepIndex,
    policy: {
      status: stringValue(nested(summary, "governance").status),
      action: stringValue(policyAdjudication.action),
      riskLevel: stringValue(policyAdjudication.risk) ?? stringValue(approval?.riskLevel),
      policyProfile,
      policyMatrixId,
      approvalScopeKey: stringValue(policyAdjudication.humanApprovalScopeKey) ?? stringValue(nested(policyPayload, "approvalScope").scopeKey) ?? stringValue(approval?.metadata.approvalScopeKey),
      humanApprovalRequired: booleanValue(policyAdjudication.humanApprovalRequired),
      publicSafe: true,
    },
    sandbox: {
      effectiveMode: sandboxMode,
      status: stringValue(sandboxPlan.status) ?? stringValue(summary.sandboxPlanStatus),
      sandboxRequired: booleanValue(policyAdjudication.sandboxRequired),
      sandboxStrength: stringValue(policyAdjudication.sandboxStrength),
      commandProviderFamily: stringValue(commandSandbox.providerFamily) ?? stringValue(summary.commandSandboxProviderFamily),
      commandMode: stringValue(commandSandbox.mode) ?? stringValue(summary.commandSandboxMode),
      commandApplied: booleanValue(commandSandbox.applied) ?? booleanValue(summary.commandSandboxApplied),
      publicSafe: true,
    },
    dependency: {
      status: dependencyStatus,
      decision: dependencyDecision,
      missingDependencies: stringArray(dependencyPreflight.missingDependencies),
      installableDependencies: stringArray(dependencyPreflight.installableDependencies),
      publicSafe: true,
    },
    workspaceRollback: {
      required: Object.keys(rollbackPlan).length > 0 || Object.keys(rollbackDiff).length > 0,
      status: stringValue(rollbackDiff.status) ?? stringValue(rollbackPlan.status),
      restored: booleanValue(rollbackDiff.restored),
      changedFiles: numberValue(rollbackDiff.changedFiles),
      publicSafe: true,
    },
    approval: {
      approvalId: approval?.approvalId,
      status: approval?.status,
      riskLevel: approval?.riskLevel,
      requestedScopes: approval?.requestedScopes ?? [],
      publicSafe: true,
    },
    refs: refs([
      input.invocation.invocationId,
      input.invocation.target,
      stringValue(summary.decisionId),
      step?.stepId,
      ...(step?.inputRefs ?? []),
      ...(step?.outputRefs ?? []),
      ...(step?.observationRefs ?? []),
      policy?.eventId,
      dependency?.eventId,
      approval?.approvalId,
      ...errors.map((error) => error.errorId),
    ]),
    metadata: publicSafeMetadata({
      invocation: {
        decisionId: stringValue(summary.decisionId),
        duplicateOfToolCallId: stringValue(summary.duplicateOfToolCallId),
      },
      step: step === undefined
        ? undefined
        : {
            stepId: step.stepId,
            actionPrimitive: step.actionPrimitive,
            status: step.status,
            providerToolName: stringValue(step.metadata.providerToolName),
            duplicateObservationReuse: booleanValue(step.metadata.duplicateObservationReuse),
            duplicateOfToolCallId: stringValue(step.metadata.duplicateOfToolCallId),
          },
      policy: {
        eventId: policy?.eventId,
        action: stringValue(policyAdjudication.action),
        riskLevel: stringValue(policyAdjudication.risk),
        policyProfile,
        policyMatrixId,
      },
      dependency: {
        eventId: dependency?.eventId,
        status: dependencyStatus,
        decision: dependencyDecision,
      },
    }),
    publicSafe: true,
  };
}

function orderToolCalls(records: readonly RuntimeToolCallRecord[]): readonly RuntimeToolCallRecord[] {
  return [...records].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    (left.turnIndex ?? -1) - (right.turnIndex ?? -1) ||
    (left.stepIndex ?? -1) - (right.stepIndex ?? -1) ||
    left.callId.localeCompare(right.callId)
  );
}

export function createRuntimeToolCallReport(input: CreateRuntimeToolCallReportInput): RuntimeToolCallReport {
  const toolCalls = orderToolCalls(input.snapshot.invocations
    .filter((invocation) => invocation.kind === "tool")
    .map((invocation) => toolCallRecord({ snapshot: input.snapshot, invocation })));
  const policyEvents = input.snapshot.events.filter((event) => event.type === "runtime.baseTool.policy.adjudicated");
  const dependencyEvents = input.snapshot.events.filter((event) =>
    event.type === "runtime.baseTool.dependencies.preflight" ||
    event.type === "runtime.baseTool.dependencies.prepared"
  );
  const sandboxEvents = sandboxPreparedEvents(input.snapshot);
  const toolErrors = input.snapshot.errors.filter((error) => error.boundary === "tool" || error.boundary === "approval");
  return {
    kind: "praxis.runtime.toolCall.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? "snapshot",
    session: {
      sessionId: input.snapshot.session?.sessionId,
      runtimeId: input.snapshot.session?.runtimeId,
      status: input.snapshot.session?.status,
    },
    counts: {
      toolInvocations: toolCalls.length,
      completed: toolCalls.filter((call) => call.status === "completed").length,
      failed: toolCalls.filter((call) => call.status === "failed").length,
      waitingApproval: toolCalls.filter((call) => call.status === "waitingApproval").length,
      policyDecisions: policyEvents.length,
      dependencyPreflights: dependencyEvents.length,
      sandboxPreparedEvents: sandboxEvents.length,
      workspaceRollbackRequired: toolCalls.filter((call) => call.workspaceRollback.required).length,
      workspaceRollbackRestored: toolCalls.filter((call) => call.workspaceRollback.restored === true).length,
      approvals: input.snapshot.approvals.filter((approval) => approval.source === "baseTool" || approval.requestedScopes.some((scope) => scope.startsWith("tool."))).length,
      errors: toolErrors.length,
    },
    coverage: {
      hasSession: input.snapshot.session !== undefined,
      hasToolInvocations: toolCalls.length > 0,
      hasPolicyDecisions: policyEvents.length > 0,
      hasDependencyPreflights: dependencyEvents.length > 0,
      hasSandboxEvidence: toolCalls.some((call) => call.sandbox.effectiveMode !== undefined || call.sandbox.commandApplied !== undefined) || sandboxEvents.length > 0,
      hasWorkspaceRollbackEvidence: toolCalls.some((call) => call.workspaceRollback.required),
      hasApprovals: input.snapshot.approvals.length > 0,
      hasToolErrors: toolErrors.length > 0,
    },
    toolIds: uniqueSorted(toolCalls.map((call) => call.toolId)),
    policyProfiles: uniqueSorted(toolCalls.map((call) => call.policy.policyProfile)),
    sandboxModes: uniqueSorted(toolCalls.map((call) => call.sandbox.effectiveMode)),
    dependencyStatuses: uniqueSorted(toolCalls.map((call) => call.dependency.status)),
    approvalIds: uniqueSorted(toolCalls.map((call) => call.approval.approvalId)),
    errorCodes: uniqueSorted(toolErrors.map((error) => error.code)),
    toolCalls,
  };
}

export function createRuntimeToolCallIndex(report: RuntimeToolCallReport): RuntimeToolCallIndex {
  const byToolId = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byPolicyProfile = new Map<string, number>();
  const bySandboxMode = new Map<string, number>();
  const byApprovalStatus = new Map<string, number>();
  const byDependencyStatus = new Map<string, number>();
  for (const call of report.toolCalls) {
    increment(byToolId, call.toolId);
    increment(byStatus, call.status);
    increment(byPolicyProfile, call.policy.policyProfile);
    increment(bySandboxMode, call.sandbox.effectiveMode);
    increment(byApprovalStatus, call.approval.status);
    increment(byDependencyStatus, call.dependency.status);
  }
  return {
    kind: "praxis.runtime.toolCall.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalToolCalls: report.toolCalls.length,
    byToolId: sortedRecord(byToolId),
    byStatus: sortedRecord(byStatus),
    byPolicyProfile: sortedRecord(byPolicyProfile),
    bySandboxMode: sortedRecord(bySandboxMode),
    byApprovalStatus: sortedRecord(byApprovalStatus),
    byDependencyStatus: sortedRecord(byDependencyStatus),
    approvalIds: report.approvalIds,
  };
}

function matchesQuery(call: RuntimeToolCallRecord, query: RuntimeToolCallQuery): boolean {
  if (query.toolId !== undefined && call.toolId !== query.toolId) return false;
  if (query.status !== undefined && call.status !== query.status) return false;
  if (query.policyProfile !== undefined && call.policy.policyProfile !== query.policyProfile) return false;
  if (query.sandboxMode !== undefined && call.sandbox.effectiveMode !== query.sandboxMode) return false;
  if (query.approvalStatus !== undefined && call.approval.status !== query.approvalStatus) return false;
  if (query.dependencyStatus !== undefined && call.dependency.status !== query.dependencyStatus) return false;
  if (query.ref !== undefined && !call.refs.includes(query.ref)) return false;
  if (query.createdAtFrom !== undefined && call.createdAt.localeCompare(query.createdAtFrom) < 0) return false;
  if (query.createdAtTo !== undefined && call.createdAt.localeCompare(query.createdAtTo) > 0) return false;
  return true;
}

export function queryRuntimeToolCalls(input: QueryRuntimeToolCallsInput): RuntimeToolCallQueryResult {
  const query = input.query ?? {};
  const matched = input.report.toolCalls.filter((call) => matchesQuery(call, query));
  const limit = numberLimit(query.limit);
  const toolCalls = limit === undefined ? matched : matched.slice(0, limit);
  return {
    kind: "praxis.runtime.toolCall.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalToolCalls: input.report.toolCalls.length,
    matchedToolCalls: matched.length,
    returnedToolCalls: toolCalls.length,
    toolCalls,
  };
}
