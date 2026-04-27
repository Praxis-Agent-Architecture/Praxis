import path from "node:path";

import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeSearchRipgrepBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "execution" | "provider";

export type CodeSearchRipgrepGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CodeSearchRipgrepMatch = {
  path: string;
  line: number;
  column?: number;
  text: string;
};

export type CodeSearchRipgrepExecution = {
  exitCode: number;
  matches: readonly CodeSearchRipgrepMatch[];
  stderr?: string;
};

export type CodeSearchRipgrepExecutor = (request: {
  command: readonly string[];
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
  multiline: boolean;
  contextLines: number;
  context?: CodeSearchRipgrepContext;
}) => CodeSearchRipgrepExecution | Promise<CodeSearchRipgrepExecution>;

export type CodeSearchRipgrepContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeSearchRipgrepGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CodeSearchRipgrepRequest = {
  context?: CodeSearchRipgrepContext;
  toolCallId?: string;
  workspaceRoot?: string;
  query?: string;
  pattern?: string;
  directoryPath?: string;
  fileGlob?: string;
  maxMatches?: number;
  literal?: boolean;
  caseSensitive?: boolean;
  includeHidden?: boolean;
  multiline?: boolean;
  contextLines?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeSearchRipgrepGate;
  dryRun?: boolean;
  executor?: CodeSearchRipgrepExecutor;
  provider?: CodeSearchRipgrepExecutor;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeSearchRipgrepErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_QUERY"
  | "MISSING_DIRECTORY_PATH"
  | "ABSOLUTE_DIRECTORY_PATH"
  | "DIRECTORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_MAX_MATCHES"
  | "INVALID_CONTEXT_LINES"
  | "INVALID_GLOB"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "EXECUTOR_NOT_INJECTED"
  | "EXECUTOR_REJECTED"
  | "RIPGREP_FAILED";

export type CodeSearchRipgrepError = {
  code: CodeSearchRipgrepErrorCode;
  message: string;
  boundary: CodeSearchRipgrepBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeSearchRipgrepAudit = {
  tool: "code.search_Ripgrep";
  toolCallId: string;
  directoryPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeSearchRipgrepPlan = {
  kind: "agentCore.basicTool.code.search_Ripgrep.plan";
  operation: "ripgrep-text-search";
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
  multiline: boolean;
  contextLines: number;
  command: readonly string[];
  dispatch: "dry-run" | "injected-executor";
  spawnsProcessDirectly: false;
};

export type CodeSearchRipgrepOutput = {
  kind: "agentCore.basicTool.code.search_Ripgrep.output";
  matches: readonly CodeSearchRipgrepMatch[];
  exitCode: number;
  stderr?: string;
  truncated: boolean;
  unsafeSideEffects: false;
};

export type CodeSearchRipgrepResult =
  | { ok: true; plan: CodeSearchRipgrepPlan; audit: CodeSearchRipgrepAudit; output?: CodeSearchRipgrepOutput; events: readonly string[] }
  | { ok: false; error: CodeSearchRipgrepError; events: readonly string[] };

type NormalizedSearchRequest = {
  toolCallId: string;
  context: CodeSearchRipgrepContext;
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
  multiline: boolean;
  contextLines: number;
  command: readonly string[];
  acceptedScopes: readonly string[];
  provider?: CodeSearchRipgrepExecutor;
  metadata: Readonly<Record<string, unknown>>;
};

export const codeSearchRipgrepDescriptor = {
  tool: "code.search_Ripgrep",
  toolId: "code.search_Ripgrep",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed ripgrep search through an injected process envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  defaultMaxMatches: 50,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: unknown): readonly string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function failure(
  code: CodeSearchRipgrepErrorCode,
  message: string,
  boundary: CodeSearchRipgrepBoundary,
): CodeSearchRipgrepResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["code.search_Ripgrep.rejected"],
  };
}

function toolFailure(
  code: CodeSearchRipgrepErrorCode,
  message: string,
  boundary: CodeSearchRipgrepBoundary,
  context: CodeSearchRipgrepContext | undefined,
): CodeToolResult<CodeSearchRipgrepOutput, CodeSearchRipgrepErrorCode> {
  return {
    ok: false,
    toolId: "code.search_Ripgrep",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.code.search_Ripgrep.rejected", context, { code, boundary })],
    events: ["code.search_Ripgrep.rejected"],
  };
}

function auditEvent(
  type: string,
  context: CodeSearchRipgrepContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CodeToolAuditEvent {
  return {
    type,
    toolId: "code.search_Ripgrep",
    invocationId: stringValue(context?.invocationId)?.trim() || "code.search_Ripgrep:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function guardRejected(guard: CodeSearchRipgrepGate | undefined): boolean {
  return guard?.accepted === false || guard?.allowed === false;
}

function normalizeDirectory(directoryPath: string, workspaceRoot?: string, allowedRoots: readonly string[] = []): string | CodeSearchRipgrepResult {
  if (directoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.search_Ripgrep directoryPath cannot contain NUL bytes", "input");
  }
  const trimmed = directoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    const allowed = [workspaceRoot, ...allowedRoots].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
    const normalizedAbsolute = path.resolve(trimmed);
    if (allowed.length === 0) {
      return failure("ABSOLUTE_DIRECTORY_PATH", "code.search_Ripgrep absolute directoryPath requires workspaceRoot or allowedRoots", "scope");
    }
    const insideAllowed = allowed.some((root) => {
      const normalizedRoot = path.resolve(root);
      return normalizedAbsolute === normalizedRoot || normalizedAbsolute.startsWith(`${normalizedRoot}${path.sep}`);
    });
    if (!insideAllowed) {
      return failure("DIRECTORY_PATH_OUTSIDE_SCOPE", "code.search_Ripgrep directoryPath must stay inside workspaceRoot or allowedRoots", "scope");
    }
    return normalizedAbsolute;
  }
  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure("DIRECTORY_PATH_OUTSIDE_SCOPE", "code.search_Ripgrep directoryPath must stay inside the workspace scope", "scope");
  }
  return normalized === "." ? "." : normalized;
}

function normalizePositiveInteger(value: unknown, fallback: number, code: CodeSearchRipgrepErrorCode): number | CodeSearchRipgrepResult {
  if (value !== undefined && typeof value !== "number") return failure(code, "code.search_Ripgrep numeric limits must be integers", "resource");
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) return failure(code, "code.search_Ripgrep numeric limits must be positive integers", "resource");
  return resolved;
}

function normalizeContextLines(value: unknown): number | CodeSearchRipgrepResult {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 20) {
    return failure("INVALID_CONTEXT_LINES", "code.search_Ripgrep contextLines must be an integer between 0 and 20", "resource");
  }
  return value;
}

function resolveAcceptedScopes(requestedScopes: unknown, allowedScopes: unknown): readonly string[] | CodeSearchRipgrepResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  if (requested.length === 0) return [];
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) return failure("SCOPE_DENIED", `code.search_Ripgrep scope ${denied[0]} is outside runtime governance`, "scope");
  return requested;
}

function buildRipgrepCommand(request: {
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
  multiline: boolean;
  contextLines: number;
}): readonly string[] {
  const command = ["rg", "--json", "--max-count", String(request.maxMatches)];
  if (request.literal) command.push("--fixed-strings");
  if (!request.caseSensitive) command.push("--ignore-case");
  if (request.includeHidden) command.push("--hidden");
  if (request.multiline) command.push("--multiline");
  if (request.contextLines > 0) command.push("--context", String(request.contextLines));
  if (request.fileGlob !== undefined) command.push("--glob", request.fileGlob);
  command.push("--", request.query, request.directoryPath);
  return command;
}

function normalizeRequest(value: unknown): NormalizedSearchRequest | CodeSearchRipgrepResult {
  if (!isRecord(value)) return failure("INVALID_REQUEST", "code.search_Ripgrep request must be a JSON object", "input");
  const request = value as CodeSearchRipgrepRequest;
  const context = isRecord(request.context) ? request.context : {};
  const governance = request.governance ?? context.guard;
  if (guardRejected(governance)) {
    return failure("GOVERNANCE_REJECTED", governance?.reason ?? "code.search_Ripgrep was rejected by runtime governance", "governance");
  }
  const query = stringValue(request.query ?? request.pattern)?.trim();
  if (query === undefined || query.length === 0) return failure("MISSING_QUERY", "code.search_Ripgrep requires a query", "input");
  if (isBlank(request.directoryPath)) return failure("MISSING_DIRECTORY_PATH", "code.search_Ripgrep requires a directoryPath", "input");
  const directoryPath = normalizeDirectory(String(request.directoryPath), context.workspaceRoot ?? request.workspaceRoot, cleanList(context.allowedRoots));
  if (typeof directoryPath !== "string") return directoryPath;
  const maxMatches = normalizePositiveInteger(request.maxMatches, codeSearchRipgrepDescriptor.defaultMaxMatches, "INVALID_MAX_MATCHES");
  if (typeof maxMatches !== "number") return maxMatches;
  const contextLines = normalizeContextLines(request.contextLines);
  if (typeof contextLines !== "number") return contextLines;
  const fileGlob = request.fileGlob === undefined ? undefined : stringValue(request.fileGlob)?.trim();
  if (request.fileGlob !== undefined && (fileGlob === undefined || fileGlob.includes("\0") || fileGlob.length === 0)) {
    return failure("INVALID_GLOB", "code.search_Ripgrep fileGlob must be a safe string", "input");
  }
  const literal = request.literal ?? true;
  const caseSensitive = request.caseSensitive ?? true;
  const includeHidden = request.includeHidden ?? false;
  const multiline = request.multiline ?? false;
  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes ?? context.requestedScopes, request.allowedScopes ?? context.allowedScopes);
  if ("ok" in acceptedScopes) return acceptedScopes;
  const command = buildRipgrepCommand({ query, directoryPath, fileGlob, maxMatches, literal, caseSensitive, includeHidden, multiline, contextLines });
  return {
    toolCallId: request.toolCallId?.trim() || context.invocationId?.trim() || "code.search_Ripgrep:dry-run",
    context: {
      ...context,
      dryRun: request.dryRun ?? context.dryRun,
      workspaceRoot: context.workspaceRoot ?? request.workspaceRoot,
    },
    query,
    directoryPath,
    fileGlob,
    maxMatches,
    literal,
    caseSensitive,
    includeHidden,
    multiline,
    contextLines,
    command,
    acceptedScopes,
    provider: request.executor ?? request.provider,
    metadata: request.metadata ?? {},
  };
}

function buildPlan(normalized: NormalizedSearchRequest): CodeSearchRipgrepPlan {
  return {
    kind: "agentCore.basicTool.code.search_Ripgrep.plan",
    operation: "ripgrep-text-search",
    query: normalized.query,
    directoryPath: normalized.directoryPath,
    fileGlob: normalized.fileGlob,
    maxMatches: normalized.maxMatches,
    literal: normalized.literal,
    caseSensitive: normalized.caseSensitive,
    includeHidden: normalized.includeHidden,
    multiline: normalized.multiline,
    contextLines: normalized.contextLines,
    command: normalized.command,
    dispatch: normalized.context.dryRun === false ? "injected-executor" : "dry-run",
    spawnsProcessDirectly: false,
  };
}

function buildAudit(normalized: NormalizedSearchRequest): CodeSearchRipgrepAudit {
  return {
    tool: "code.search_Ripgrep",
    toolCallId: normalized.toolCallId,
    directoryPath: normalized.directoryPath,
    workspaceRoot: normalized.context.workspaceRoot,
    requestedScopes: cleanList(normalized.context.requestedScopes),
    acceptedScopes: normalized.acceptedScopes,
    dryRun: normalized.context.dryRun !== false,
    unsafeSideEffects: false,
    metadata: { ...(normalized.context.auditMetadata ?? {}), ...normalized.metadata },
  };
}

export async function planCodeSearchRipgrep(request: unknown = {}): Promise<CodeSearchRipgrepResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const plan = buildPlan(normalized);
  const audit = buildAudit(normalized);
  if (plan.dispatch === "dry-run") return { ok: true, plan, audit, events: ["code.search_Ripgrep.planned"] };
  if (normalized.provider === undefined) {
    return failure("EXECUTOR_NOT_INJECTED", "code.search_Ripgrep requires an injected executor when dryRun is false", "provider");
  }
  try {
    const execution = await normalized.provider({
      command: normalized.command,
      query: normalized.query,
      directoryPath: normalized.directoryPath,
      fileGlob: normalized.fileGlob,
      maxMatches: normalized.maxMatches,
      literal: normalized.literal,
      caseSensitive: normalized.caseSensitive,
      includeHidden: normalized.includeHidden,
      multiline: normalized.multiline,
      contextLines: normalized.contextLines,
      context: normalized.context,
    });
    if (execution.exitCode > 1) {
      return failure("RIPGREP_FAILED", execution.stderr ?? `ripgrep exited with code ${execution.exitCode}`, "provider");
    }
    const matches = execution.matches.slice(0, normalized.maxMatches);
    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.search_Ripgrep.output",
        matches,
        exitCode: execution.exitCode,
        stderr: execution.stderr,
        truncated: execution.matches.length > normalized.maxMatches,
        unsafeSideEffects: false,
      },
      events: ["code.search_Ripgrep.injectedExecutorCompleted"],
    };
  } catch (error) {
    return failure(
      "EXECUTOR_REJECTED",
      error instanceof Error ? error.message : "code.search_Ripgrep injected executor rejected the request",
      "provider",
    );
  }
}

export async function executeCodeSearchRipgrep(
  request: CodeSearchRipgrepRequest = {},
): Promise<CodeToolResult<CodeSearchRipgrepOutput, CodeSearchRipgrepErrorCode>> {
  const result = await planCodeSearchRipgrep(request);
  if (!result.ok) return toolFailure(result.error.code, result.error.message, result.error.boundary, request.context);
  if (result.output === undefined) {
    return {
      ok: true,
      toolId: "code.search_Ripgrep",
      output: {
        kind: "agentCore.basicTool.code.search_Ripgrep.output",
        matches: [],
        exitCode: 0,
        truncated: false,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.code.search_Ripgrep.dryRun", request.context, result.audit.metadata)],
      events: ["code.search_Ripgrep.dryRun"],
    };
  }
  return {
    ok: true,
    toolId: "code.search_Ripgrep",
    output: result.output,
    audit: [auditEvent("agentCore.basicTool.code.search_Ripgrep.provider", request.context, result.audit.metadata)],
    events: result.events,
  };
}
