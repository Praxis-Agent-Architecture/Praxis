/*
 * Runtime foundation / official-adapter read surface.
 * Purpose: normalize application-owned context, MCP, skill, and MCP+ adapter evidence into a public-safe report.
 * Boundary: read-only inspection only; does not execute adapters, manage MCP+ policy, or replace context/skill/MCP strategy.
 */

import type { PraxisApplicationEvent } from "../../applicationLayer/applicationContract.js";
import {
  evaluateBaseToolRuntimeReadiness,
  type BaseToolRuntimeReadinessDecision,
  type BaseToolRuntimeSupportStatus,
} from "../../basetool/supportCatalog.js";
import type { BaseToolExecutorPort } from "../../basetool/types.js";

export type RuntimeOfficialAdapterSourceKind =
  | "application-events"
  | "application-smoke"
  | "snapshot"
  | (string & {});

export type RuntimeOfficialAdapterFamilyKey =
  | "context"
  | "mcp"
  | "skill"
  | "mcpPlus"
  | (string & {});

export type RuntimeOfficialAdapterStatus = "ok" | "failed" | "unknown";

export type RuntimeOfficialAdapterApplicationEvent = Pick<
  PraxisApplicationEvent,
  "eventId" | "kind" | "status" | "message" | "createdAt" | "sessionId" | "runtimeId" | "turnId" | "publicSafe" | "metadata"
>;

export type RuntimeOfficialAdapterEvidenceInput = {
  familyKey?: RuntimeOfficialAdapterFamilyKey;
  toolId?: string;
  toolStatus?: string;
  expectedProviderName?: string;
  providerToolExposed?: boolean;
  exposedProviderNames?: readonly string[];
  adapterCalls?: number;
  callId?: string;
  outputFedBack?: boolean;
  outputIncludesEvidence?: boolean;
  resultKind?: string;
  resourceCount?: number;
  itemCount?: number;
  skillName?: string;
  serverId?: string;
  requestName?: string;
  calledToolName?: string;
  humanResultSummary?: string;
  refs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeOfficialAdapterMcpPlusEvidenceInput = {
  serverId?: string;
  initToolId?: string;
  dynamicToolIds?: readonly string[];
  firstCallExposesInit?: boolean;
  secondCallExposesInit?: boolean;
  secondCallExposesPinnedTool?: boolean;
  exposedProviderNamesByCall?: readonly (readonly string[])[];
  profileSaved?: boolean;
  schemaVersion?: string;
  pinnedTools?: readonly string[];
  indexedTools?: readonly string[];
  listToolsCalls?: number;
  callCalls?: number;
  calledServerId?: string;
  calledToolName?: string;
  callIds?: readonly string[];
  initOutputFedBack?: boolean;
  dynamicToolOutputFedBack?: boolean;
  dynamicToolOutputIncludesCallResult?: boolean;
};

export type RuntimeOfficialAdapterCompositionInput = {
  callOrder?: readonly string[];
  expectedCallOrder?: readonly string[];
  providerCalls?: number;
  toolCalls?: number;
  finalEventSeen?: boolean;
  finalOutput?: string;
};

export type RuntimeOfficialAdapterRecord = {
  adapterId: string;
  familyKey: RuntimeOfficialAdapterFamilyKey;
  status: RuntimeOfficialAdapterStatus;
  toolId: string | undefined;
  toolStatus: string | undefined;
  expectedProviderName: string | undefined;
  providerToolExposed: boolean | undefined;
  exposedProviderNames: readonly string[];
  adapterCalls: number | undefined;
  callId: string | undefined;
  outputFedBack: boolean | undefined;
  outputIncludesEvidence: boolean | undefined;
  result: {
    kind: string | undefined;
    resourceCount: number | undefined;
    itemCount: number | undefined;
    skillName: string | undefined;
    serverId: string | undefined;
    requestName: string | undefined;
    calledToolName: string | undefined;
    humanResultSummaryPreview: string | undefined;
    publicSafe: true;
  };
  refs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeOfficialAdapterMcpPlusReport = {
  status: RuntimeOfficialAdapterStatus;
  serverId: string | undefined;
  initToolId: string | undefined;
  dynamicToolIds: readonly string[];
  exposure: {
    firstCallExposesInit: boolean | undefined;
    secondCallExposesInit: boolean | undefined;
    secondCallHidesInit: boolean | undefined;
    secondCallExposesPinnedTool: boolean | undefined;
    exposedProviderNamesByCall: readonly (readonly string[])[];
    publicSafe: true;
  };
  profile: {
    profileSaved: boolean | undefined;
    schemaVersion: string | undefined;
    pinnedTools: readonly string[];
    indexedTools: readonly string[];
    publicSafe: true;
  };
  adapter: {
    listToolsCalls: number | undefined;
    callCalls: number | undefined;
    calledServerId: string | undefined;
    calledToolName: string | undefined;
    publicSafe: true;
  };
  roundTrip: {
    initOutputFedBack: boolean | undefined;
    dynamicToolOutputFedBack: boolean | undefined;
    dynamicToolOutputIncludesCallResult: boolean | undefined;
    callIds: readonly string[];
    publicSafe: true;
  };
  publicSafe: true;
};

export type RuntimeOfficialAdapterCoverage = {
  hasAdapterCalls: boolean;
  hasProviderToolExposure: boolean;
  hasCompletedToolEvents: boolean;
  hasProviderRoundTrip: boolean;
  hasCompositionOrder: boolean;
  compositionOrderMatches: boolean | undefined;
  hasMcpPlusProfileRefresh: boolean;
  hasMcpPlusDynamicTool: boolean;
  hasApplicationEventPath: boolean;
  publicSafeEvidence: boolean;
};

export type RuntimeOfficialAdapterReport = {
  kind: "praxis.runtime.officialAdapter.report";
  publicSafe: true;
  sourceKind: RuntimeOfficialAdapterSourceKind;
  status: RuntimeOfficialAdapterStatus;
  counts: {
    adapters: number;
    adapterCalls: number;
    exposedProviderTools: number;
    completedToolEvents: number;
    providerRoundTrips: number;
    applicationEvents: number;
    mcpPlusProfiles: number;
    dynamicTools: number;
  };
  coverage: RuntimeOfficialAdapterCoverage;
  adapters: readonly RuntimeOfficialAdapterRecord[];
  mcpPlus: RuntimeOfficialAdapterMcpPlusReport;
  composition: {
    callOrder: readonly string[];
    expectedCallOrder: readonly string[];
    orderMatches: boolean | undefined;
    providerCalls: number | undefined;
    toolCalls: number | undefined;
    finalEventSeen: boolean | undefined;
    finalOutputPreview: string | undefined;
    publicSafe: true;
  };
  eventIds: readonly string[];
  refs: readonly string[];
  guardrails: {
    executesAdapters: false;
    ownsContextRetrievalStrategy: false;
    ownsSkillRegistryGovernance: false;
    ownsMcpPlusPolicyGovernance: false;
    unsafeSecretLikeTextRedacted: true;
    publicSafe: true;
  };
};

export type RuntimeOfficialAdapterIndex = {
  kind: "praxis.runtime.officialAdapter.index";
  publicSafe: true;
  sourceKind: RuntimeOfficialAdapterSourceKind;
  totalAdapters: number;
  byFamilyKey: Readonly<Record<string, number>>;
  byToolId: Readonly<Record<string, number>>;
  byStatus: Readonly<Record<string, number>>;
  providerToolNames: readonly string[];
  completedToolIds: readonly string[];
  mcpPlusDynamicToolIds: readonly string[];
};

export type RuntimeOfficialAdapterQuery = {
  familyKey?: RuntimeOfficialAdapterFamilyKey;
  toolId?: string;
  providerToolName?: string;
  callId?: string;
  status?: RuntimeOfficialAdapterStatus;
  ref?: string;
  hasProviderToolExposure?: boolean;
  hasProviderRoundTrip?: boolean;
  limit?: number;
};

export type RuntimeOfficialAdapterQueryResult = {
  kind: "praxis.runtime.officialAdapter.queryResult";
  publicSafe: true;
  sourceKind: RuntimeOfficialAdapterSourceKind;
  query: RuntimeOfficialAdapterQuery;
  totalAdapters: number;
  matchedAdapters: number;
  returnedAdapters: number;
  adapters: readonly RuntimeOfficialAdapterRecord[];
  refs: readonly string[];
};

export type RuntimeOfficialAdapterMountMatrixEvidenceStatus =
  | "executor-backed"
  | "declared-only"
  | "missing";

export type RuntimeOfficialAdapterMountMatrixStatus = "ready" | "degraded";

export type RuntimeOfficialAdapterMountMatrixAdapter = {
  familyKey: RuntimeOfficialAdapterFamilyKey;
  toolId: "context.load" | "mcp.resources" | "skill.load";
  decision: BaseToolRuntimeReadinessDecision;
  readiness: BaseToolRuntimeSupportStatus;
  activeReadiness: "available" | "requires-approval" | "unavailable";
  evidenceStatus: RuntimeOfficialAdapterMountMatrixEvidenceStatus;
  requiredPortPaths: readonly string[];
  missingPortPaths: readonly string[];
  approvalPortPaths: readonly string[];
  portEvidence: readonly {
    portPath: string;
    source: "executor" | "declared" | "missing";
    publicSafe: true;
  }[];
  publicSafe: true;
};

export type RuntimeOfficialAdapterMountMatrix = {
  surface: "runtime.officialAdapterPlane.mountMatrix";
  publicSafe: true;
  status: RuntimeOfficialAdapterMountMatrixStatus;
  adapters: readonly RuntimeOfficialAdapterMountMatrixAdapter[];
  totals: {
    adapters: number;
    readyAdapters: number;
    missingPorts: number;
    executorBackedPorts: number;
    declaredOnlyPorts: number;
  };
  guardrails: {
    executesAdapters: false;
    ownsContextRetrievalStrategy: false;
    ownsSkillRegistryGovernance: false;
    ownsMcpPolicyGovernance: false;
    publicSafe: true;
  };
};

export type CreateRuntimeOfficialAdapterReportInput = {
  sourceKind?: RuntimeOfficialAdapterSourceKind;
  status?: RuntimeOfficialAdapterStatus;
  adapters?: readonly RuntimeOfficialAdapterEvidenceInput[];
  mcpPlus?: RuntimeOfficialAdapterMcpPlusEvidenceInput;
  composition?: RuntimeOfficialAdapterCompositionInput;
  applicationEvents?: readonly RuntimeOfficialAdapterApplicationEvent[];
};

export type QueryRuntimeOfficialAdaptersInput = {
  report: RuntimeOfficialAdapterReport;
  query?: RuntimeOfficialAdapterQuery;
};

export type InspectRuntimeOfficialAdapterMountMatrixInput = {
  executor?: BaseToolExecutorPort;
  implementedPortPaths?: readonly string[];
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

function lookupExecutorPort(executor: BaseToolExecutorPort | undefined, portPath: string): unknown {
  const [namespace, method] = portPath.split(".", 2);
  if (namespace === undefined || method === undefined) return undefined;
  return executor?.[namespace]?.[method];
}

function hasExecutorPort(executor: BaseToolExecutorPort | undefined, portPath: string): boolean {
  const handler = lookupExecutorPort(executor, portPath);
  if (typeof handler !== "function") return false;
  return (handler as { __praxisUnavailablePortFallback?: true }).__praxisUnavailablePortFallback !== true;
}

function activeReadinessFor(decision: BaseToolRuntimeReadinessDecision): RuntimeOfficialAdapterMountMatrixAdapter["activeReadiness"] {
  return decision === "allowed" ? "available" : decision === "requiresApproval" ? "requires-approval" : "unavailable";
}

function evidenceStatusFor(
  portEvidence: RuntimeOfficialAdapterMountMatrixAdapter["portEvidence"],
): RuntimeOfficialAdapterMountMatrixEvidenceStatus {
  if (portEvidence.length === 0 || portEvidence.every((evidence) => evidence.source === "missing")) return "missing";
  if (portEvidence.every((evidence) => evidence.source === "executor")) return "executor-backed";
  if (portEvidence.every((evidence) => evidence.source === "declared")) return "declared-only";
  return portEvidence.some((evidence) => evidence.source === "executor") ? "executor-backed" : "declared-only";
}

function portEvidenceFor(input: {
  portPaths: readonly string[];
  executor?: BaseToolExecutorPort;
  implementedPortPaths?: readonly string[];
}): RuntimeOfficialAdapterMountMatrixAdapter["portEvidence"] {
  const declaredPorts = new Set(input.implementedPortPaths ?? []);
  return [...new Set(input.portPaths)].map((portPath) => ({
    portPath,
    source: hasExecutorPort(input.executor, portPath)
      ? "executor" as const
      : declaredPorts.has(portPath)
        ? "declared" as const
        : "missing" as const,
    publicSafe: true as const,
  }));
}

function sortedRecord(map: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function numberLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
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

function redactPreview(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const withoutSecretLikeWords = value
    .replace(/secret[^\s,}]*/gi, "[redacted]")
    .replace(/token[^\s,}]*/gi, "[redacted]")
    .replace(/password[^\s,}]*/gi, "[redacted]")
    .replace(/authorization[^\s,}]*/gi, "[redacted]");
  return withoutSecretLikeWords.length > 200 ? `${withoutSecretLikeWords.slice(0, 197)}...` : withoutSecretLikeWords;
}

function publicSafeValue(value: unknown): unknown {
  if (typeof value === "string") return redactPreview(value);
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

function familyFromToolId(toolId: string | undefined): RuntimeOfficialAdapterFamilyKey | undefined {
  if (toolId === undefined) return undefined;
  if (toolId.startsWith("context.")) return "context";
  if (toolId.startsWith("skill.")) return "skill";
  if (toolId.includes(".mcp_plus.") || toolId.includes("mcp_plus")) return "mcpPlus";
  if (toolId.startsWith("mcp.")) return "mcp";
  const [family] = toolId.split(".");
  return family === undefined || family.length === 0 ? undefined : family;
}

function familyFromProviderName(providerName: string | undefined): RuntimeOfficialAdapterFamilyKey | undefined {
  if (providerName === undefined) return undefined;
  if (providerName.includes("context")) return "context";
  if (providerName.includes("skill")) return "skill";
  if (providerName.includes("mcp_plus")) return "mcpPlus";
  if (providerName.includes("mcp")) return "mcp";
  return undefined;
}

function adapterStatus(input: RuntimeOfficialAdapterEvidenceInput): RuntimeOfficialAdapterStatus {
  if (input.toolStatus === "failed" || input.providerToolExposed === false || input.outputFedBack === false) return "failed";
  if (
    input.toolStatus === "completed" &&
    (input.providerToolExposed === true || input.outputFedBack === true || (input.adapterCalls ?? 0) > 0)
  ) {
    return "ok";
  }
  if ((input.adapterCalls ?? 0) > 0 && input.outputFedBack === true) return "ok";
  return "unknown";
}

function adapterIdFor(input: RuntimeOfficialAdapterEvidenceInput, index: number): string {
  const familyKey = input.familyKey ?? familyFromToolId(input.toolId) ?? familyFromProviderName(input.expectedProviderName) ?? "adapter";
  return refs([familyKey, input.toolId, input.expectedProviderName, input.callId]).join(":") || `adapter:${index}`;
}

function normalizeAdapter(input: RuntimeOfficialAdapterEvidenceInput, index: number): RuntimeOfficialAdapterRecord {
  const familyKey = input.familyKey ?? familyFromToolId(input.toolId) ?? familyFromProviderName(input.expectedProviderName) ?? "unknown";
  return {
    adapterId: adapterIdFor(input, index),
    familyKey,
    status: adapterStatus(input),
    toolId: input.toolId,
    toolStatus: input.toolStatus,
    expectedProviderName: input.expectedProviderName,
    providerToolExposed: input.providerToolExposed,
    exposedProviderNames: uniqueSorted(input.exposedProviderNames ?? []),
    adapterCalls: numberLimit(input.adapterCalls),
    callId: input.callId,
    outputFedBack: input.outputFedBack,
    outputIncludesEvidence: input.outputIncludesEvidence,
    result: {
      kind: input.resultKind,
      resourceCount: numberLimit(input.resourceCount),
      itemCount: numberLimit(input.itemCount),
      skillName: input.skillName,
      serverId: input.serverId,
      requestName: input.requestName,
      calledToolName: input.calledToolName,
      humanResultSummaryPreview: redactPreview(input.humanResultSummary),
      publicSafe: true,
    },
    refs: refs([
      input.familyKey,
      input.toolId,
      input.expectedProviderName,
      input.callId,
      input.skillName,
      input.serverId,
      input.requestName,
      input.calledToolName,
      ...(input.refs ?? []),
    ]),
    metadata: publicSafeMetadata(input.metadata),
    publicSafe: true,
  };
}

function eventMetadata(event: RuntimeOfficialAdapterApplicationEvent): Readonly<Record<string, unknown>> {
  return isRecord(event.metadata) ? event.metadata : {};
}

function adapterInputsFromEvents(events: readonly RuntimeOfficialAdapterApplicationEvent[]): readonly RuntimeOfficialAdapterEvidenceInput[] {
  const inputs: RuntimeOfficialAdapterEvidenceInput[] = [];
  for (const event of events) {
    if (event.kind !== "tool") continue;
    const metadata = eventMetadata(event);
    const toolId = stringValue(metadata.toolId);
    if (toolId === undefined) continue;
    const resultMetadata = isRecord(metadata.resultMetadata) ? metadata.resultMetadata : {};
    inputs.push({
      familyKey: stringValue(metadata.familyKey) ?? familyFromToolId(toolId),
      toolId,
      toolStatus: stringValue(metadata.toolStatus) ?? event.status,
      resultKind: stringValue(metadata.contextKind),
      resourceCount: numberValue(metadata.resourceCount),
      itemCount: numberValue(metadata.itemCount),
      skillName: stringValue(metadata.skillName),
      serverId: stringValue(metadata.serverId),
      humanResultSummary: stringValue(resultMetadata.humanResultSummary),
      refs: refs([event.eventId, event.turnId, event.sessionId]),
    });
  }
  return inputs;
}

function mergeAdapterEvidence(input: CreateRuntimeOfficialAdapterReportInput): readonly RuntimeOfficialAdapterRecord[] {
  const explicit = [...(input.adapters ?? [])];
  const fromEvents = adapterInputsFromEvents(input.applicationEvents ?? []);
  const records = explicit.map((item, index) => normalizeAdapter(item, index));
  for (const eventInput of fromEvents) {
    const eventRecord = normalizeAdapter(eventInput, records.length);
    const existingIndex = records.findIndex((record) => record.toolId === eventRecord.toolId);
    if (existingIndex === -1) {
      records.push(eventRecord);
      continue;
    }
    const existing = records[existingIndex];
    records[existingIndex] = {
      ...existing,
      familyKey: existing.familyKey === "unknown" ? eventRecord.familyKey : existing.familyKey,
      toolStatus: existing.toolStatus ?? eventRecord.toolStatus,
      refs: refs([...existing.refs, ...eventRecord.refs]),
      metadata: publicSafeMetadata({ ...eventRecord.metadata, ...existing.metadata }),
    };
  }
  return records;
}

function mcpPlusReport(input: RuntimeOfficialAdapterMcpPlusEvidenceInput | undefined): RuntimeOfficialAdapterMcpPlusReport {
  const dynamicToolIds = uniqueSorted(input?.dynamicToolIds ?? []);
  const callIds = refs(input?.callIds ?? []);
  const status: RuntimeOfficialAdapterStatus = input === undefined
    ? "unknown"
    : input.profileSaved === false || input.secondCallExposesPinnedTool === false || input.dynamicToolOutputFedBack === false
    ? "failed"
    : input.profileSaved === true &&
        input.firstCallExposesInit === true &&
        input.secondCallExposesInit === false &&
        input.secondCallExposesPinnedTool === true &&
        input.dynamicToolOutputFedBack === true
    ? "ok"
    : "unknown";
  return {
    status,
    serverId: input?.serverId,
    initToolId: input?.initToolId,
    dynamicToolIds,
    exposure: {
      firstCallExposesInit: input?.firstCallExposesInit,
      secondCallExposesInit: input?.secondCallExposesInit,
      secondCallHidesInit: input?.secondCallExposesInit === undefined ? undefined : !input.secondCallExposesInit,
      secondCallExposesPinnedTool: input?.secondCallExposesPinnedTool,
      exposedProviderNamesByCall: (input?.exposedProviderNamesByCall ?? []).map((names) => uniqueSorted(names)),
      publicSafe: true,
    },
    profile: {
      profileSaved: input?.profileSaved,
      schemaVersion: input?.schemaVersion,
      pinnedTools: uniqueSorted(input?.pinnedTools ?? []),
      indexedTools: uniqueSorted(input?.indexedTools ?? []),
      publicSafe: true,
    },
    adapter: {
      listToolsCalls: numberLimit(input?.listToolsCalls),
      callCalls: numberLimit(input?.callCalls),
      calledServerId: input?.calledServerId,
      calledToolName: input?.calledToolName,
      publicSafe: true,
    },
    roundTrip: {
      initOutputFedBack: input?.initOutputFedBack,
      dynamicToolOutputFedBack: input?.dynamicToolOutputFedBack,
      dynamicToolOutputIncludesCallResult: input?.dynamicToolOutputIncludesCallResult,
      callIds,
      publicSafe: true,
    },
    publicSafe: true,
  };
}

function compositionReport(input: RuntimeOfficialAdapterCompositionInput | undefined): RuntimeOfficialAdapterReport["composition"] {
  const callOrder = refs(input?.callOrder ?? []);
  const expectedCallOrder = refs(input?.expectedCallOrder ?? []);
  const orderMatches = expectedCallOrder.length === 0
    ? undefined
    : callOrder.join(",") === expectedCallOrder.join(",");
  return {
    callOrder,
    expectedCallOrder,
    orderMatches,
    providerCalls: numberLimit(input?.providerCalls),
    toolCalls: numberLimit(input?.toolCalls),
    finalEventSeen: input?.finalEventSeen,
    finalOutputPreview: redactPreview(input?.finalOutput),
    publicSafe: true,
  };
}

function coverageFor(input: {
  adapters: readonly RuntimeOfficialAdapterRecord[];
  mcpPlus: RuntimeOfficialAdapterMcpPlusReport;
  composition: RuntimeOfficialAdapterReport["composition"];
  applicationEvents: readonly RuntimeOfficialAdapterApplicationEvent[];
}): RuntimeOfficialAdapterCoverage {
  return {
    hasAdapterCalls: input.adapters.some((adapter) => (adapter.adapterCalls ?? 0) > 0) ||
      (input.mcpPlus.adapter.listToolsCalls ?? 0) > 0 ||
      (input.mcpPlus.adapter.callCalls ?? 0) > 0,
    hasProviderToolExposure: input.adapters.some((adapter) => adapter.providerToolExposed === true) ||
      input.mcpPlus.exposure.firstCallExposesInit === true ||
      input.mcpPlus.exposure.secondCallExposesPinnedTool === true,
    hasCompletedToolEvents: input.adapters.some((adapter) => adapter.toolStatus === "completed"),
    hasProviderRoundTrip: input.adapters.some((adapter) => adapter.outputFedBack === true) ||
      input.mcpPlus.roundTrip.initOutputFedBack === true ||
      input.mcpPlus.roundTrip.dynamicToolOutputFedBack === true,
    hasCompositionOrder: input.composition.callOrder.length > 0,
    compositionOrderMatches: input.composition.orderMatches,
    hasMcpPlusProfileRefresh: input.mcpPlus.profile.profileSaved === true &&
      input.mcpPlus.profile.pinnedTools.length > 0,
    hasMcpPlusDynamicTool: input.mcpPlus.exposure.secondCallExposesPinnedTool === true &&
      input.mcpPlus.roundTrip.dynamicToolOutputFedBack === true,
    hasApplicationEventPath: input.applicationEvents.length > 0 ||
      input.adapters.some((adapter) => adapter.refs.some((ref) => ref.includes("event") || ref.includes("tool:"))),
    publicSafeEvidence: input.adapters.every((adapter) => adapter.publicSafe) && input.mcpPlus.publicSafe,
  };
}

function statusFor(
  input: CreateRuntimeOfficialAdapterReportInput,
  adapters: readonly RuntimeOfficialAdapterRecord[],
  mcpPlus: RuntimeOfficialAdapterMcpPlusReport,
  coverage: RuntimeOfficialAdapterCoverage,
): RuntimeOfficialAdapterStatus {
  if (input.status !== undefined) return input.status;
  if (adapters.some((adapter) => adapter.status === "failed") || mcpPlus.status === "failed") return "failed";
  if (
    adapters.length > 0 &&
    adapters.every((adapter) => adapter.status === "ok") &&
    coverage.hasProviderToolExposure &&
    coverage.hasProviderRoundTrip &&
    coverage.hasCompletedToolEvents
  ) {
    return "ok";
  }
  if (mcpPlus.status === "ok" && coverage.hasMcpPlusProfileRefresh && coverage.hasMcpPlusDynamicTool) return "ok";
  return "unknown";
}

export function createRuntimeOfficialAdapterReport(
  input: CreateRuntimeOfficialAdapterReportInput = {},
): RuntimeOfficialAdapterReport {
  const adapters = mergeAdapterEvidence(input);
  const mcpPlus = mcpPlusReport(input.mcpPlus);
  const composition = compositionReport(input.composition);
  const applicationEvents = input.applicationEvents ?? [];
  const coverage = coverageFor({ adapters, mcpPlus, composition, applicationEvents });
  const status = statusFor(input, adapters, mcpPlus, coverage);
  const eventIds = refs(applicationEvents.map((event) => event.eventId));
  return {
    kind: "praxis.runtime.officialAdapter.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? (applicationEvents.length > 0 ? "application-events" : "application-smoke"),
    status,
    counts: {
      adapters: adapters.length,
      adapterCalls: adapters.reduce((total, adapter) => total + (adapter.adapterCalls ?? 0), 0) +
        (mcpPlus.adapter.listToolsCalls ?? 0) + (mcpPlus.adapter.callCalls ?? 0),
      exposedProviderTools: uniqueSorted([
        ...adapters.flatMap((adapter) => adapter.exposedProviderNames),
        ...mcpPlus.exposure.exposedProviderNamesByCall.flatMap((names) => names),
      ]).length,
      completedToolEvents: adapters.filter((adapter) => adapter.toolStatus === "completed").length,
      providerRoundTrips: adapters.filter((adapter) => adapter.outputFedBack === true).length +
        (mcpPlus.roundTrip.initOutputFedBack === true ? 1 : 0) +
        (mcpPlus.roundTrip.dynamicToolOutputFedBack === true ? 1 : 0),
      applicationEvents: applicationEvents.length,
      mcpPlusProfiles: mcpPlus.profile.profileSaved === true ? 1 : 0,
      dynamicTools: mcpPlus.dynamicToolIds.length,
    },
    coverage,
    adapters,
    mcpPlus,
    composition,
    eventIds,
    refs: refs([
      ...adapters.flatMap((adapter) => adapter.refs),
      ...eventIds,
      mcpPlus.serverId,
      mcpPlus.initToolId,
      ...mcpPlus.dynamicToolIds,
      ...mcpPlus.roundTrip.callIds,
      ...mcpPlus.profile.pinnedTools,
      ...mcpPlus.profile.indexedTools,
      mcpPlus.adapter.calledServerId,
      mcpPlus.adapter.calledToolName,
    ]),
    guardrails: {
      executesAdapters: false,
      ownsContextRetrievalStrategy: false,
      ownsSkillRegistryGovernance: false,
      ownsMcpPlusPolicyGovernance: false,
      unsafeSecretLikeTextRedacted: true,
      publicSafe: true,
    },
  };
}

export function createRuntimeOfficialAdapterIndex(report: RuntimeOfficialAdapterReport): RuntimeOfficialAdapterIndex {
  const byFamilyKey = new Map<string, number>();
  const byToolId = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const adapter of report.adapters) {
    increment(byFamilyKey, adapter.familyKey);
    increment(byToolId, adapter.toolId);
    increment(byStatus, adapter.status);
  }
  return {
    kind: "praxis.runtime.officialAdapter.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalAdapters: report.adapters.length,
    byFamilyKey: sortedRecord(byFamilyKey),
    byToolId: sortedRecord(byToolId),
    byStatus: sortedRecord(byStatus),
    providerToolNames: uniqueSorted([
      ...report.adapters.flatMap((adapter) => adapter.exposedProviderNames),
      ...report.mcpPlus.exposure.exposedProviderNamesByCall.flatMap((names) => names),
    ]),
    completedToolIds: uniqueSorted(report.adapters
      .filter((adapter) => adapter.toolStatus === "completed")
      .map((adapter) => adapter.toolId)),
    mcpPlusDynamicToolIds: report.mcpPlus.dynamicToolIds,
  };
}

function matchesAdapter(adapter: RuntimeOfficialAdapterRecord, query: RuntimeOfficialAdapterQuery): boolean {
  if (query.familyKey !== undefined && adapter.familyKey !== query.familyKey) return false;
  if (query.toolId !== undefined && adapter.toolId !== query.toolId) return false;
  if (query.providerToolName !== undefined && !adapter.exposedProviderNames.includes(query.providerToolName)) return false;
  if (query.callId !== undefined && adapter.callId !== query.callId) return false;
  if (query.status !== undefined && adapter.status !== query.status) return false;
  if (query.hasProviderToolExposure !== undefined && (adapter.providerToolExposed === true) !== query.hasProviderToolExposure) return false;
  if (query.hasProviderRoundTrip !== undefined && (adapter.outputFedBack === true) !== query.hasProviderRoundTrip) return false;
  if (query.ref !== undefined && !adapter.refs.includes(query.ref)) return false;
  return true;
}

function queryRefs(input: {
  report: RuntimeOfficialAdapterReport;
  adapters: readonly RuntimeOfficialAdapterRecord[];
  query: RuntimeOfficialAdapterQuery;
}): readonly string[] {
  return refs([
    input.query.familyKey,
    input.query.toolId,
    input.query.providerToolName,
    input.query.callId,
    input.query.ref,
    ...input.adapters.flatMap((adapter) => adapter.refs),
    ...input.report.mcpPlus.dynamicToolIds,
    ...input.report.mcpPlus.roundTrip.callIds,
  ]);
}

export function queryRuntimeOfficialAdapters(input: QueryRuntimeOfficialAdaptersInput): RuntimeOfficialAdapterQueryResult {
  const query = input.query ?? {};
  const matched = input.report.adapters.filter((adapter) => matchesAdapter(adapter, query));
  const limit = numberLimit(query.limit) ?? matched.length;
  const adapters = matched.slice(0, limit);
  return {
    kind: "praxis.runtime.officialAdapter.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalAdapters: input.report.adapters.length,
    matchedAdapters: matched.length,
    returnedAdapters: adapters.length,
    adapters,
    refs: queryRefs({ report: input.report, adapters, query }),
  };
}

const officialAdapterMountInputs = [
  {
    familyKey: "context" as const,
    toolId: "context.load" as const,
    toolInput: { kind: "workspaceIndex", query: "readiness", limit: 1 },
  },
  {
    familyKey: "mcp" as const,
    toolId: "mcp.resources" as const,
    toolInput: { operation: "list" },
  },
  {
    familyKey: "skill" as const,
    toolId: "skill.load" as const,
    toolInput: { name: "readiness" },
  },
] as const;

export function inspectRuntimeOfficialAdapterMountMatrix(
  input: InspectRuntimeOfficialAdapterMountMatrixInput = {},
): RuntimeOfficialAdapterMountMatrix {
  const adapters = officialAdapterMountInputs.map((adapter): RuntimeOfficialAdapterMountMatrixAdapter => {
    const preflight = evaluateBaseToolRuntimeReadiness({
      toolId: adapter.toolId,
      toolInput: adapter.toolInput,
      executor: input.executor,
      implementedPortPaths: input.implementedPortPaths,
    });
    const requiredPortPaths = [
      ...preflight.blockingSupports,
      ...preflight.approvalSupports,
      ...preflight.advisorySupports,
    ].flatMap((support) => support.portPath ?? []);
    const portEvidence = portEvidenceFor({
      portPaths: requiredPortPaths,
      executor: input.executor,
      implementedPortPaths: input.implementedPortPaths,
    });
    return {
      familyKey: adapter.familyKey,
      toolId: adapter.toolId,
      decision: preflight.decision,
      readiness: preflight.readiness,
      activeReadiness: activeReadinessFor(preflight.decision),
      evidenceStatus: evidenceStatusFor(portEvidence),
      requiredPortPaths,
      missingPortPaths: preflight.blockingSupports.flatMap((support) => support.portPath ?? []),
      approvalPortPaths: preflight.approvalSupports.flatMap((support) => support.portPath ?? []),
      portEvidence,
      publicSafe: true,
    };
  });
  const uniquePortEvidence = new Map<string, RuntimeOfficialAdapterMountMatrixAdapter["portEvidence"][number]>();
  for (const adapter of adapters) {
    for (const evidence of adapter.portEvidence) {
      const existing = uniquePortEvidence.get(evidence.portPath);
      if (existing?.source === "executor") continue;
      if (existing?.source === "declared" && evidence.source === "missing") continue;
      uniquePortEvidence.set(evidence.portPath, evidence);
    }
  }
  const missingPorts = adapters.reduce((sum, adapter) => sum + adapter.missingPortPaths.length, 0);
  const declaredOnlyPorts = [...uniquePortEvidence.values()].filter((evidence) => evidence.source === "declared").length;
  const executorBackedPorts = [...uniquePortEvidence.values()].filter((evidence) => evidence.source === "executor").length;
  return {
    surface: "runtime.officialAdapterPlane.mountMatrix",
    publicSafe: true,
    status: missingPorts === 0 && declaredOnlyPorts === 0 ? "ready" : "degraded",
    adapters,
    totals: {
      adapters: adapters.length,
      readyAdapters: adapters.filter((adapter) => adapter.activeReadiness === "available" && adapter.evidenceStatus === "executor-backed").length,
      missingPorts,
      executorBackedPorts,
      declaredOnlyPorts,
    },
    guardrails: {
      executesAdapters: false,
      ownsContextRetrievalStrategy: false,
      ownsSkillRegistryGovernance: false,
      ownsMcpPolicyGovernance: false,
      publicSafe: true,
    },
  };
}
