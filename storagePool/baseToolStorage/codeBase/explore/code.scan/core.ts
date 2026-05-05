import path from "node:path";

import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeScanBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "execution" | "provider";

export type CodeScanGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CodeScanEntry = {
  path: string;
  kind: "file" | "directory" | "symbol" | "unknown";
  sizeBytes?: number;
  language?: string;
};

export type CodeScanProvider = (request: {
  directoryPath: string;
  maxEntries: number;
  includeGlobs: readonly string[];
  excludeGlobs: readonly string[];
  depth: number;
  offset: number;
  context?: CodeScanContext;
}) => readonly CodeScanEntry[] | Promise<readonly CodeScanEntry[]>;

export type CodeScanContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeScanGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CodeScanRequest = {
  context?: CodeScanContext;
  toolCallId?: string;
  workspaceRoot?: string;
  directoryPath?: string;
  maxEntries?: number;
  depth?: number;
  offset?: number;
  includeGlobs?: readonly string[];
  excludeGlobs?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeScanGate;
  dryRun?: boolean;
  scanner?: CodeScanProvider;
  provider?: CodeScanProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeScanErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_DIRECTORY_PATH"
  | "ABSOLUTE_DIRECTORY_PATH"
  | "DIRECTORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_MAX_ENTRIES"
  | "INVALID_DEPTH"
  | "INVALID_OFFSET"
  | "INVALID_GLOB"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "SCANNER_NOT_INJECTED"
  | "SCANNER_REJECTED";

export type CodeScanError = {
  code: CodeScanErrorCode;
  message: string;
  boundary: CodeScanBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeScanAudit = {
  tool: "code.scan";
  toolCallId: string;
  directoryPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeScanPlan = {
  kind: "agentCore.basicTool.code.scan.plan";
  operation: "scan-directory-or-code-structure";
  directoryPath: string;
  maxEntries: number;
  depth: number;
  offset: number;
  includeGlobs: readonly string[];
  excludeGlobs: readonly string[];
  dispatch: "dry-run" | "injected-scanner";
  scansFileSystemDirectly: false;
};

export type CodeScanOutput = {
  kind: "agentCore.basicTool.code.scan.output";
  directoryPath: string;
  entries: readonly CodeScanEntry[];
  offset: number;
  maxEntries: number;
  truncated: boolean;
  unsafeSideEffects: false;
};

export type CodeScanResult =
  | { ok: true; plan: CodeScanPlan; audit: CodeScanAudit; output?: CodeScanOutput; events: readonly string[] }
  | { ok: false; error: CodeScanError; events: readonly string[] };

type NormalizedScanRequest = {
  toolCallId: string;
  context: CodeScanContext;
  directoryPath: string;
  maxEntries: number;
  depth: number;
  offset: number;
  includeGlobs: readonly string[];
  excludeGlobs: readonly string[];
  acceptedScopes: readonly string[];
  provider?: CodeScanProvider;
  metadata: Readonly<Record<string, unknown>>;
};

export const codeScanDescriptor = {
  tool: "code.scan",
  toolId: "code.scan",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed directory/code-structure scan through an injected scanner envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  defaultMaxEntries: 200,
  defaultDepth: 1,
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

function failure(code: CodeScanErrorCode, message: string, boundary: CodeScanBoundary): CodeScanResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["code.scan.rejected"],
  };
}

function toolFailure(
  code: CodeScanErrorCode,
  message: string,
  boundary: CodeScanBoundary,
  context: CodeScanContext | undefined,
): CodeToolResult<CodeScanOutput, CodeScanErrorCode> {
  return {
    ok: false,
    toolId: "code.scan",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.code.scan.rejected", context, { code, boundary })],
    events: ["code.scan.rejected"],
  };
}

function auditEvent(type: string, context: CodeScanContext | undefined, metadata?: Readonly<Record<string, unknown>>): CodeToolAuditEvent {
  return {
    type,
    toolId: "code.scan",
    invocationId: stringValue(context?.invocationId)?.trim() || "code.scan:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function guardRejected(guard: CodeScanGate | undefined): boolean {
  return guard?.accepted === false || guard?.allowed === false;
}

function normalizeDirectory(directoryPath: string, workspaceRoot?: string, allowedRoots: readonly string[] = []): string | CodeScanResult {
  if (directoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.scan directoryPath cannot contain NUL bytes", "input");
  }
  const trimmed = directoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    const allowed = [workspaceRoot, ...allowedRoots].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
    const normalizedAbsolute = path.resolve(trimmed);
    if (allowed.length === 0) {
      return failure("ABSOLUTE_DIRECTORY_PATH", "code.scan absolute directoryPath requires workspaceRoot or allowedRoots", "scope");
    }
    const insideAllowed = allowed.some((root) => {
      const normalizedRoot = path.resolve(root);
      return normalizedAbsolute === normalizedRoot || normalizedAbsolute.startsWith(`${normalizedRoot}${path.sep}`);
    });
    if (!insideAllowed) {
      return failure("DIRECTORY_PATH_OUTSIDE_SCOPE", "code.scan directoryPath must stay inside workspaceRoot or allowedRoots", "scope");
    }
    return normalizedAbsolute;
  }
  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure("DIRECTORY_PATH_OUTSIDE_SCOPE", "code.scan directoryPath must stay inside the workspace scope", "scope");
  }
  return normalized === "." ? "." : normalized;
}

function normalizePositiveInteger(value: unknown, fallback: number, code: CodeScanErrorCode): number | CodeScanResult {
  if (value !== undefined && typeof value !== "number") return failure(code, "code.scan numeric limits must be positive integers", "resource");
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) return failure(code, "code.scan numeric limits must be positive integers", "resource");
  return resolved;
}

function normalizeOffset(value: unknown): number | CodeScanResult {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return failure("INVALID_OFFSET", "code.scan offset must be a non-negative integer", "resource");
  }
  return value;
}

function normalizeGlobs(value: unknown): readonly string[] | CodeScanResult {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure("INVALID_GLOB", "code.scan globs must be arrays of strings", "input");
  const globs: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.includes("\0")) {
      return failure("INVALID_GLOB", "code.scan globs must be safe strings", "input");
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) globs.push(trimmed);
  }
  return [...new Set(globs)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replaceAll("\\", "/");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (character === "*" && next === "*") {
      const afterNext = normalized[index + 2];
      if (afterNext === "/") {
        source += "(?:.*\\/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(character ?? "");
    }
  }
  return new RegExp(`^${source}$`, "u");
}

function normalizeEntryPath(entryPath: string): string {
  return path.posix.normalize(entryPath.trim().replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function relativeEntryPath(entryPath: string, directoryPath: string): string {
  const normalizedEntry = normalizeEntryPath(entryPath).replace(/\/$/u, "");
  const normalizedDirectory = normalizeEntryPath(directoryPath).replace(/\/$/u, "");
  if (normalizedDirectory === "." || normalizedEntry === normalizedDirectory) return normalizedEntry;
  const prefix = `${normalizedDirectory}/`;
  return normalizedEntry.startsWith(prefix) ? normalizedEntry.slice(prefix.length) : normalizedEntry;
}

function entryDepth(entryPath: string, directoryPath: string): number {
  const relative = relativeEntryPath(entryPath, directoryPath);
  if (relative.length === 0 || relative === ".") return 0;
  return relative.split("/").filter(Boolean).length;
}

function matchesAnyGlob(entryPath: string, globs: readonly string[], directoryPath: string): boolean {
  if (globs.length === 0) return false;
  const normalizedEntry = normalizeEntryPath(entryPath);
  const relative = relativeEntryPath(entryPath, directoryPath);
  return globs.some((glob) => {
    const matcher = globToRegExp(glob);
    return matcher.test(relative) || matcher.test(normalizedEntry);
  });
}

function filterEntries(entries: readonly CodeScanEntry[], normalized: NormalizedScanRequest): readonly CodeScanEntry[] {
  return entries.filter((entry) => {
    if (entryDepth(entry.path, normalized.directoryPath) > normalized.depth) return false;
    if (normalized.includeGlobs.length > 0 && !matchesAnyGlob(entry.path, normalized.includeGlobs, normalized.directoryPath)) {
      return false;
    }
    if (matchesAnyGlob(entry.path, normalized.excludeGlobs, normalized.directoryPath)) return false;
    return true;
  });
}

function resolveAcceptedScopes(requestedScopes: unknown, allowedScopes: unknown): readonly string[] | CodeScanResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  if (requested.length === 0) return [];
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) return failure("SCOPE_DENIED", `code.scan scope ${denied[0]} is outside runtime governance`, "scope");
  return requested;
}

function normalizeRequest(value: unknown): NormalizedScanRequest | CodeScanResult {
  if (!isRecord(value)) return failure("INVALID_REQUEST", "code.scan request must be a JSON object", "input");
  const request = value as CodeScanRequest;
  const context = isRecord(request.context) ? request.context : {};
  const governance = request.governance ?? context.guard;
  if (guardRejected(governance)) {
    return failure("GOVERNANCE_REJECTED", governance?.reason ?? "code.scan was rejected by runtime governance", "governance");
  }
  if (isBlank(request.directoryPath)) return failure("MISSING_DIRECTORY_PATH", "code.scan requires a directoryPath", "input");
  const directoryPath = normalizeDirectory(String(request.directoryPath), context.workspaceRoot ?? request.workspaceRoot, cleanList(context.allowedRoots));
  if (typeof directoryPath !== "string") return directoryPath;
  const maxEntries = normalizePositiveInteger(request.maxEntries, codeScanDescriptor.defaultMaxEntries, "INVALID_MAX_ENTRIES");
  if (typeof maxEntries !== "number") return maxEntries;
  const depth = normalizePositiveInteger(request.depth, codeScanDescriptor.defaultDepth, "INVALID_DEPTH");
  if (typeof depth !== "number") return depth;
  const offset = normalizeOffset(request.offset);
  if (typeof offset !== "number") return offset;
  const includeGlobs = normalizeGlobs(request.includeGlobs);
  if ("ok" in includeGlobs) return includeGlobs;
  const excludeGlobs = normalizeGlobs(request.excludeGlobs);
  if ("ok" in excludeGlobs) return excludeGlobs;
  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes ?? context.requestedScopes, request.allowedScopes ?? context.allowedScopes);
  if ("ok" in acceptedScopes) return acceptedScopes;
  return {
    toolCallId: request.toolCallId?.trim() || context.invocationId?.trim() || "code.scan:dry-run",
    context: {
      ...context,
      dryRun: request.dryRun ?? context.dryRun,
      workspaceRoot: context.workspaceRoot ?? request.workspaceRoot,
    },
    directoryPath,
    maxEntries,
    depth,
    offset,
    includeGlobs,
    excludeGlobs,
    acceptedScopes,
    provider: request.scanner ?? request.provider,
    metadata: request.metadata ?? {},
  };
}

function buildPlan(normalized: NormalizedScanRequest): CodeScanPlan {
  return {
    kind: "agentCore.basicTool.code.scan.plan",
    operation: "scan-directory-or-code-structure",
    directoryPath: normalized.directoryPath,
    maxEntries: normalized.maxEntries,
    depth: normalized.depth,
    offset: normalized.offset,
    includeGlobs: normalized.includeGlobs,
    excludeGlobs: normalized.excludeGlobs,
    dispatch: normalized.context.dryRun === false ? "injected-scanner" : "dry-run",
    scansFileSystemDirectly: false,
  };
}

function buildAudit(normalized: NormalizedScanRequest): CodeScanAudit {
  return {
    tool: "code.scan",
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

export async function planCodeScan(request: unknown = {}): Promise<CodeScanResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const plan = buildPlan(normalized);
  const audit = buildAudit(normalized);
  if (plan.dispatch === "dry-run") return { ok: true, plan, audit, events: ["code.scan.planned"] };
  if (normalized.provider === undefined) {
    return failure("SCANNER_NOT_INJECTED", "code.scan requires an injected scanner when dryRun is false", "provider");
  }
  try {
    const entries = filterEntries(await normalized.provider({
      directoryPath: normalized.directoryPath,
      maxEntries: normalized.maxEntries + normalized.offset + 1,
      includeGlobs: normalized.includeGlobs,
      excludeGlobs: normalized.excludeGlobs,
      depth: normalized.depth,
      offset: normalized.offset,
      context: normalized.context,
    }), normalized);
    const pagedEntries = entries.slice(normalized.offset, normalized.offset + normalized.maxEntries);
    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.scan.output",
        directoryPath: normalized.directoryPath,
        entries: pagedEntries,
        offset: normalized.offset,
        maxEntries: normalized.maxEntries,
        truncated: entries.length > normalized.offset + normalized.maxEntries,
        unsafeSideEffects: false,
      },
      events: ["code.scan.injectedScannerCompleted"],
    };
  } catch (error) {
    void error;
    return failure("SCANNER_REJECTED", "code.scan provider rejected the request", "provider");
  }
}

export async function executeCodeScan(request: CodeScanRequest = {}): Promise<CodeToolResult<CodeScanOutput, CodeScanErrorCode>> {
  const result = await planCodeScan(request);
  if (!result.ok) return toolFailure(result.error.code, result.error.message, result.error.boundary, request.context);
  if (result.output === undefined) {
    return {
      ok: true,
      toolId: "code.scan",
      output: {
        kind: "agentCore.basicTool.code.scan.output",
        directoryPath: result.plan.directoryPath,
        entries: [],
        offset: result.plan.offset,
        maxEntries: result.plan.maxEntries,
        truncated: false,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.code.scan.dryRun", request.context, result.audit.metadata)],
      events: ["code.scan.dryRun"],
    };
  }
  return {
    ok: true,
    toolId: "code.scan",
    output: result.output,
    audit: [auditEvent("agentCore.basicTool.code.scan.provider", request.context, result.audit.metadata)],
    events: result.events,
  };
}
