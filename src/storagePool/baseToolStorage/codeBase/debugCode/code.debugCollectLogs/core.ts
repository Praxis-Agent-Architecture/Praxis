import type { BaseToolDebugLogEntry } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeDebugCollectLogsBoundary = "input" | "contract" | "governance" | "scope" | "provider";
export type CodeDebugLogSourceKind = "debug-console" | "process" | "test-run" | "file";
export type CodeDebugLogSourceInput = { kind?: CodeDebugLogSourceKind; id?: string; path?: string; label?: string };
export type CodeDebugLogSource = { kind: CodeDebugLogSourceKind; id: string; path?: string; label?: string };
export type CodeDebugLogRedaction = { secrets?: boolean; absolutePaths?: boolean };
export type CodeDebugGate = { accepted?: boolean; allowed?: boolean; reason?: string };
export type CodeDebugContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeDebugGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};
export type CodeDebugCollectLogsRequest = {
  context?: CodeDebugContext;
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  sources?: readonly CodeDebugLogSourceInput[];
  maxEntries?: number;
  since?: string;
  redaction?: CodeDebugLogRedaction;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  guard?: CodeDebugGate;
  contract?: CodeDebugGate;
  governance?: CodeDebugGate;
  provider?: CodeDebugCollectLogsProvider;
};
export type CodeDebugCollectLogsErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_LOG_SOURCES"
  | "MISSING_SOURCE_KIND"
  | "MISSING_SOURCE_IDENTIFIER"
  | "INVALID_LOG_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LOG_COLLECTION_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";
export type CodeDebugCollectLogsError = { code: CodeDebugCollectLogsErrorCode; message: string; boundary: CodeDebugCollectLogsBoundary; safeForRuntimeInspection: true; internalDetailExposed: false };
export type CodeDebugCollectLogsPlan = {
  toolName: "code.debugCollectLogs";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  sources: readonly CodeDebugLogSource[];
  maxEntries: number;
  since?: string;
  redaction: Required<CodeDebugLogRedaction>;
  permissions: readonly ["debug:read", "logs:read"];
  execution: { dryRun: true; collected: false; unsafeSideEffects: false };
  audit: { governanceRequired: true; tapHandoffReady: true };
  storage: { logic: { persisted: false }; records: readonly { toolName: "code.debugCollectLogs" }[] };
};
export type CodeDebugCollectLogsOutput = {
  kind: "agentCore.basicTool.code.debugCollectLogs.output";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  sources: readonly CodeDebugLogSource[];
  maxEntries: number;
  since?: string;
  redaction: Required<CodeDebugLogRedaction>;
  runtimeEntry: { owner: "runtime"; port: "BaseToolExecutorPort.debug.collectLogs"; method: "collectLogs" };
  dryRun: boolean;
  providerCalled: boolean;
  entries: readonly BaseToolDebugLogEntry[];
  truncated: boolean;
  unsafeSideEffects: false;
};
export type CodeDebugCollectLogsResult =
  | { ok: true; plan: CodeDebugCollectLogsPlan; events: readonly string[] }
  | { ok: false; error: CodeDebugCollectLogsError; events: readonly string[] };
export type CodeDebugCollectLogsProvider = (
  request: { sources: readonly CodeDebugLogSource[]; maxEntries: number; since?: string; redaction: Required<CodeDebugLogRedaction> },
  context: CodeDebugContext,
) => Promise<{ entries: readonly BaseToolDebugLogEntry[]; truncated?: boolean }> | { entries: readonly BaseToolDebugLogEntry[]; truncated?: boolean };

type Normalized = Omit<CodeDebugCollectLogsPlan, "toolName" | "permissions" | "execution" | "audit" | "storage"> & { dryRun: boolean; context: CodeDebugContext };

export const codeDebugCollectLogsDescriptor = { toolName: "code.debugCollectLogs", toolId: "code.debugCollectLogs", toolFamily: "codeBase.debugCode", purpose: "collect debug logs through a runtime-owned debug log provider", dryRunOnly: false, unsafeSideEffects: false } as const;

function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function isBlank(value: unknown): boolean { return typeof value !== "string" || value.trim().length === 0; }
function cleanList(values: unknown): string[] { return Array.isArray(values) ? [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))] : []; }
function failure(code: CodeDebugCollectLogsErrorCode, message: string, boundary: CodeDebugCollectLogsBoundary): Extract<CodeDebugCollectLogsResult, { ok: false }> {
  return { ok: false, error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, events: ["agentCore.basicTool.code.debugCollectLogs.rejected"] };
}
function auditEvent(type: string, normalized?: Pick<Normalized, "invocationId" | "dryRun" | "context">, metadata?: Readonly<Record<string, unknown>>): CodeToolAuditEvent {
  return { type, toolId: "code.debugCollectLogs", invocationId: normalized?.invocationId ?? "code.debugCollectLogs:unknown", dryRun: normalized?.dryRun ?? true, metadata: { ...(normalized?.context.auditMetadata ?? {}), ...(metadata ?? {}) } };
}
function toolFailure(code: CodeDebugCollectLogsErrorCode, message: string, boundary: CodeDebugCollectLogsBoundary, normalized?: Pick<Normalized, "invocationId" | "dryRun" | "context">): CodeToolResult<CodeDebugCollectLogsOutput, CodeDebugCollectLogsErrorCode> {
  return { ok: false, toolId: "code.debugCollectLogs", error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("agentCore.basicTool.code.debugCollectLogs.rejected", normalized, { code, boundary })], events: ["agentCore.basicTool.code.debugCollectLogs.rejected"] };
}
function normalizeSource(source: CodeDebugLogSourceInput, index: number): CodeDebugLogSource | Extract<CodeDebugCollectLogsResult, { ok: false }> {
  if (source.kind === undefined) return failure("MISSING_SOURCE_KIND", `code.debugCollectLogs source ${index} requires a kind`, "input");
  const id = source.id?.trim() || source.path?.trim();
  if (id === undefined || id.length === 0) return failure("MISSING_SOURCE_IDENTIFIER", `code.debugCollectLogs source ${index} requires an id or path`, "input");
  return { kind: source.kind, id, path: source.path?.trim() || undefined, label: source.label?.trim() || undefined };
}
function normalizeRedaction(redaction: CodeDebugLogRedaction | undefined): Required<CodeDebugLogRedaction> {
  return { secrets: redaction?.secrets ?? true, absolutePaths: redaction?.absolutePaths ?? true };
}
function rejectedGate(...gates: readonly (CodeDebugGate | undefined)[]): CodeDebugGate | undefined { return gates.find((gate) => gate?.accepted === false || gate?.allowed === false); }
function hasApproval(...gates: readonly (CodeDebugGate | undefined)[]): boolean { return gates.some((gate) => gate?.accepted === true || gate?.allowed === true); }
function normalize(request: CodeDebugCollectLogsRequest = {}): Normalized | Extract<CodeDebugCollectLogsResult, { ok: false }> {
  const context = request.context ?? {};
  const runtimeId = stringValue(context.runtimeId ?? request.runtimeId)?.trim() ?? "";
  const sessionId = stringValue(context.sessionId ?? request.sessionId)?.trim() ?? "";
  if (runtimeId.length === 0) return failure("MISSING_RUNTIME_ID", "code.debugCollectLogs requires runtimeId", "input");
  if (sessionId.length === 0) return failure("MISSING_SESSION_ID", "code.debugCollectLogs requires sessionId", "input");
  if (request.sources === undefined || request.sources.length === 0) return failure("MISSING_LOG_SOURCES", "code.debugCollectLogs requires at least one log source", "input");
  if (request.maxEntries !== undefined && (!Number.isInteger(request.maxEntries) || request.maxEntries < 1)) return failure("INVALID_LOG_LIMIT", "code.debugCollectLogs maxEntries must be a positive integer", "input");
  const rejected = rejectedGate(request.contract, request.governance, request.guard, context.guard);
  if (rejected !== undefined) return failure(rejected === request.contract ? "CONTRACT_REJECTED" : "GOVERNANCE_REJECTED", rejected.reason ?? "code.debugCollectLogs was rejected by runtime governance", rejected === request.contract ? "contract" : "governance");
  const requested = cleanList(context.requestedScopes ?? request.requestedScopes);
  const allowed = cleanList(context.allowedScopes ?? request.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) return failure("SCOPE_DENIED", `debug log scope ${denied[0]} is outside runtime governance`, "scope");
  const sources: CodeDebugLogSource[] = [];
  for (const [index, source] of request.sources.entries()) {
    const normalized = normalizeSource(source, index);
    if ("ok" in normalized) return normalized;
    sources.push(normalized);
  }
  return { runtimeId, sessionId, invocationId: stringValue(context.invocationId ?? request.invocationId)?.trim() || `${runtimeId}:${sessionId}:code.debugCollectLogs`, sources, maxEntries: request.maxEntries ?? 200, since: stringValue(request.since), redaction: normalizeRedaction(request.redaction), dryRun: request.dryRun !== false && context.dryRun !== false, context };
}
function planFromNormalized(normalized: Normalized): CodeDebugCollectLogsPlan {
  return { toolName: "code.debugCollectLogs", runtimeId: normalized.runtimeId, sessionId: normalized.sessionId, invocationId: normalized.invocationId, sources: normalized.sources, maxEntries: normalized.maxEntries, since: normalized.since, redaction: normalized.redaction, permissions: ["debug:read", "logs:read"], execution: { dryRun: true, collected: false, unsafeSideEffects: false }, audit: { governanceRequired: true, tapHandoffReady: true }, storage: { logic: { persisted: false }, records: [{ toolName: "code.debugCollectLogs" }] } };
}
function emptyOutput(normalized: Normalized): CodeDebugCollectLogsOutput {
  return { kind: "agentCore.basicTool.code.debugCollectLogs.output", runtimeId: normalized.runtimeId, sessionId: normalized.sessionId, invocationId: normalized.invocationId, sources: normalized.sources, maxEntries: normalized.maxEntries, since: normalized.since, redaction: normalized.redaction, runtimeEntry: { owner: "runtime", port: "BaseToolExecutorPort.debug.collectLogs", method: "collectLogs" }, dryRun: true, providerCalled: false, entries: [], truncated: false, unsafeSideEffects: false };
}
export function planCodeDebugCollectLogs(request: CodeDebugCollectLogsRequest = {}): CodeDebugCollectLogsResult {
  if (request.dryRun === false || request.context?.dryRun === false) return failure("REAL_LOG_COLLECTION_NOT_ALLOWED", "planCodeDebugCollectLogs only creates a dry-run log collection envelope", "governance");
  const normalized = normalize(request);
  if ("ok" in normalized) return normalized;
  return { ok: true, plan: planFromNormalized(normalized), events: ["agentCore.basicTool.code.debugCollectLogs.planned"] };
}
export async function executeCodeDebugCollectLogs(request: CodeDebugCollectLogsRequest = {}): Promise<CodeToolResult<CodeDebugCollectLogsOutput, CodeDebugCollectLogsErrorCode>> {
  const normalized = normalize(request);
  if ("ok" in normalized) return toolFailure(normalized.error.code, normalized.error.message, normalized.error.boundary);
  if (normalized.dryRun) return { ok: true, toolId: "code.debugCollectLogs", output: emptyOutput(normalized), audit: [auditEvent("agentCore.basicTool.code.debugCollectLogs.planned", normalized)], events: ["agentCore.basicTool.code.debugCollectLogs.planned"] };
  if (!hasApproval(request.guard, request.governance, normalized.context.guard)) return toolFailure("GOVERNANCE_REJECTED", "code.debugCollectLogs real collection requires an affirmative runtime guard", "governance", normalized);
  if (request.provider === undefined) return toolFailure("PROVIDER_UNAVAILABLE", "code.debugCollectLogs requires runtime debug.collectLogs support", "provider", normalized);
  try {
    const result = await request.provider({ sources: normalized.sources, maxEntries: normalized.maxEntries, since: normalized.since, redaction: normalized.redaction }, normalized.context);
    return { ok: true, toolId: "code.debugCollectLogs", output: { ...emptyOutput(normalized), dryRun: false, providerCalled: true, entries: result.entries.slice(0, normalized.maxEntries), truncated: result.truncated === true || result.entries.length > normalized.maxEntries }, audit: [auditEvent("agentCore.basicTool.code.debugCollectLogs.completed", normalized, { entries: result.entries.length })], events: ["agentCore.basicTool.code.debugCollectLogs.completed"] };
  } catch {
    return toolFailure("PROVIDER_FAILURE", "code.debugCollectLogs provider failed while reading runtime-owned debug logs", "provider", normalized);
  }
}
