/*
 * git.traceLineOwnership storage core.
 * Owns the fixed git-blame contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitTraceLineOwnershipPermission = "git:read" | "filesystem:read";

export type GitTraceLineOwnershipGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitTraceLineOwnershipRange = {
  startLine: number;
  endLine: number;
};

export type GitTraceLineOwnershipContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitTraceLineOwnershipGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitTraceLineOwnershipPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitTraceLineOwnershipTarget = {
  repositoryPath: string;
  filePath: string;
  range: GitTraceLineOwnershipRange;
  revision?: string;
};

export type GitTraceLineOwnershipRequest = {
  target?: Partial<GitTraceLineOwnershipTarget>;
  context?: GitTraceLineOwnershipContext;
  provider?: GitTraceLineOwnershipProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  filePath?: string;
  range?: GitTraceLineOwnershipRange;
  startLine?: number;
  endLine?: number;
  revision?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
};

export type GitTraceLineOwnershipRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-blame-read";
  allowedSubcommand: "blame";
};

export type GitTraceLineOwnershipRisk = {
  category: "read-only-inspection";
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitTraceLineOwnershipEntryEnvelope = {
  commit: string;
  originalLine?: number;
  finalLine?: number;
  author?: string;
  authorMail?: string;
  authorTime?: number;
  summary?: string;
  sourceLine?: string;
  path?: string;
};

export type GitTraceLineOwnershipEnvelope = {
  parser: "git-blame-line-porcelain-v1";
  entries: readonly GitTraceLineOwnershipEntryEnvelope[];
  rawLineCount: number;
  unparsedLineCount: number;
};

export type GitTraceLineOwnershipOutput = {
  kind: "agentCore.basicTool.git.traceLineOwnership";
  target: GitTraceLineOwnershipTarget;
  runtimeEntry: GitTraceLineOwnershipRuntimeEntry;
  risk: GitTraceLineOwnershipRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitTraceLineOwnershipPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitTraceLineOwnershipEnvelope;
};

export type GitTraceLineOwnershipPlan = {
  toolId: "git.traceLineOwnership";
  toolKind: "git.traceLineOwnership";
  capability: "trace-line-ownership";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  filePath: string;
  range: GitTraceLineOwnershipRange;
  revision?: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitTraceLineOwnershipPermission[];
  runtimeEntry: GitTraceLineOwnershipRuntimeEntry;
  risk: GitTraceLineOwnershipRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldReadBlameMetadata: true;
  unsafeSideEffects: false;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-blame-runtime-guard";
    event: "basicTool.git.traceLineOwnership.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitTraceLineOwnershipErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitTraceLineOwnershipErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_FILE_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_FILE_PATH"
  | "INVALID_LINE_RANGE"
  | "INVALID_REVISION"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitTraceLineOwnershipError = {
  code: GitTraceLineOwnershipErrorCode;
  message: string;
  boundary: GitTraceLineOwnershipErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitTraceLineOwnershipAuditEvent = {
  type: string;
  toolId: "git.traceLineOwnership";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitTraceLineOwnershipResult =
  | {
      ok: true;
      toolId: "git.traceLineOwnership";
      output: GitTraceLineOwnershipOutput;
      plan: GitTraceLineOwnershipPlan;
      audit: readonly GitTraceLineOwnershipAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.traceLineOwnership";
      error: GitTraceLineOwnershipError;
      audit: readonly GitTraceLineOwnershipAuditEvent[];
      events: readonly string[];
    };

export type GitTraceLineOwnershipProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitTraceLineOwnershipProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitTraceLineOwnershipProvider = (
  request: GitTraceLineOwnershipProviderRequest,
  context: GitTraceLineOwnershipContext,
) => GitTraceLineOwnershipProviderResult | Promise<GitTraceLineOwnershipProviderResult>;

type NormalizedRequest = {
  target: GitTraceLineOwnershipTarget;
  context: GitTraceLineOwnershipContext;
  timeoutMs?: number;
};

export const gitTraceLineOwnershipDescriptor = {
  toolId: "git.traceLineOwnership",
  toolKind: "git.traceLineOwnership",
  capability: "trace-line-ownership",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-inspection",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: false,
} as const;

export const traceLineOwnershipDescriptor = gitTraceLineOwnershipDescriptor;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayValue(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitTraceLineOwnershipContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitTraceLineOwnershipContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.traceLineOwnership:dry-run";
}

function runtimeId(context: GitTraceLineOwnershipContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitTraceLineOwnershipContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitTraceLineOwnershipAuditEvent {
  return {
    type,
    toolId: gitTraceLineOwnershipDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: GitTraceLineOwnershipErrorCode,
  message: string,
  boundary: GitTraceLineOwnershipErrorBoundary,
  context: GitTraceLineOwnershipContext | undefined,
  repositoryPath?: string,
): GitTraceLineOwnershipResult {
  return {
    ok: false,
    toolId: gitTraceLineOwnershipDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.traceLineOwnership.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.traceLineOwnership.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitTraceLineOwnershipContext | GitTraceLineOwnershipResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.traceLineOwnership context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.traceLineOwnership context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.traceLineOwnership context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.traceLineOwnership context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.traceLineOwnership context.auditMetadata must be an object", "input", undefined);
  }
  return {
    runtimeId: stringValue(contextRecord.runtimeId) ?? stringValue(legacyRequest.runtimeId),
    sessionId: stringValue(contextRecord.sessionId),
    invocationId: stringValue(contextRecord.invocationId) ?? stringValue(legacyRequest.invocationId),
    dryRun: booleanValue(contextRecord.dryRun) ?? booleanValue(legacyRequest.dryRun),
    guard:
      guard === undefined
        ? undefined
        : {
            allowed: booleanValue(guard.allowed),
            accepted: booleanValue(guard.accepted),
            reason: stringValue(guard.reason),
          },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitTraceLineOwnershipPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitTraceLineOwnershipContext | undefined): string | GitTraceLineOwnershipResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.traceLineOwnership requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.traceLineOwnership repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeFilePath(value: unknown, context: GitTraceLineOwnershipContext, repositoryPath: string): string | GitTraceLineOwnershipResult {
  const normalized = stringValue(value)?.trim().replaceAll("\\", "/") ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_FILE_PATH", "git.traceLineOwnership requires target.filePath", "input", context, repositoryPath);
  }
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("INVALID_FILE_PATH", "git.traceLineOwnership target.filePath must be repository-relative", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.includes("..")) {
    return failure("INVALID_FILE_PATH", "git.traceLineOwnership target.filePath must stay inside the repository", "scope", context, repositoryPath);
  }
  return parts.join("/");
}

function normalizeRange(value: unknown, legacyRequest: Record<string, unknown>, context: GitTraceLineOwnershipContext, repositoryPath: string): GitTraceLineOwnershipRange | GitTraceLineOwnershipResult {
  const range = isRecord(value)
    ? value
    : {
        startLine: legacyRequest.startLine,
        endLine: legacyRequest.endLine,
      };
  const startLine = range.startLine;
  const endLine = range.endLine;
  if (
    typeof startLine !== "number" ||
    typeof endLine !== "number" ||
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return failure("INVALID_LINE_RANGE", "git.traceLineOwnership requires a positive inclusive line range", "input", context, repositoryPath);
  }
  return { startLine, endLine };
}

function normalizeRevision(value: unknown, context: GitTraceLineOwnershipContext, repositoryPath: string): string | undefined | GitTraceLineOwnershipResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_REVISION", "git.traceLineOwnership target.revision must be a safe git revision", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(value: unknown, context: GitTraceLineOwnershipContext, repositoryPath: string): number | undefined | GitTraceLineOwnershipResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitTraceLineOwnershipDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", `git.traceLineOwnership timeoutMs must be an integer from 1 to ${gitTraceLineOwnershipDescriptor.maxTimeoutMs}`, "input", context, repositoryPath);
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitTraceLineOwnershipResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.traceLineOwnership request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.traceLineOwnership target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const filePath = normalizeFilePath(targetRecord.filePath, context, repositoryPath);
  if (typeof filePath !== "string") return filePath;
  const range = normalizeRange(targetRecord.range, requestRecord, context, repositoryPath);
  if ("ok" in range) return range;
  const revision = normalizeRevision(targetRecord.revision, context, repositoryPath);
  if (revision !== undefined && typeof revision !== "string") return revision;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, filePath, range, revision }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitTraceLineOwnershipContext | undefined): GitTraceLineOwnershipResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.traceLineOwnership target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitTraceLineOwnershipContext | undefined): GitTraceLineOwnershipResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitTraceLineOwnershipDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.traceLineOwnership is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitTraceLineOwnershipContext): GitTraceLineOwnershipResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.traceLineOwnership requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitTraceLineOwnershipTarget): readonly string[] {
  return [
    "blame",
    "--line-porcelain",
    "-L",
    `${target.range.startLine},${target.range.endLine}`,
    ...(target.revision === undefined ? [] : [target.revision]),
    "--",
    target.filePath,
  ];
}

function commandPreview(target: GitTraceLineOwnershipTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitTraceLineOwnershipRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-blame-read",
  allowedSubcommand: "blame",
};

const risk: GitTraceLineOwnershipRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitTraceLineOwnershipPlan["dispatch"], dryRun: boolean): GitTraceLineOwnershipPlan {
  return {
    toolId: "git.traceLineOwnership",
    toolKind: "git.traceLineOwnership",
    capability: "trace-line-ownership",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    filePath: normalized.target.filePath,
    range: normalized.target.range,
    revision: normalized.target.revision,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitTraceLineOwnershipDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldReadBlameMetadata: true,
    unsafeSideEffects: false,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-blame-runtime-guard",
      event: "basicTool.git.traceLineOwnership.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function parseHeader(line: string): Pick<GitTraceLineOwnershipEntryEnvelope, "commit" | "originalLine" | "finalLine"> | undefined {
  const match = /^([0-9a-f]{4,}|0{40})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/iu.exec(line);
  if (match === null) return undefined;
  return {
    commit: match[1] ?? "",
    originalLine: Number(match[2]),
    finalLine: Number(match[3]),
  };
}

export function parseGitTraceLineOwnership(stdout: string): GitTraceLineOwnershipEnvelope {
  const lines = stdout.length === 0 ? [] : stdout.split(/\r?\n/u);
  const entries: GitTraceLineOwnershipEntryEnvelope[] = [];
  let current: GitTraceLineOwnershipEntryEnvelope | undefined;
  let unparsedLineCount = 0;

  for (const line of lines) {
    const header = parseHeader(line);
    if (header !== undefined) {
      current = { ...header };
      continue;
    }
    if (current === undefined) {
      if (line.length > 0) unparsedLineCount += 1;
      continue;
    }
    if (line.startsWith("author ")) current.author = line.slice("author ".length);
    else if (line.startsWith("author-mail ")) current.authorMail = line.slice("author-mail ".length).replace(/^<|>$/gu, "");
    else if (line.startsWith("author-time ")) current.authorTime = Number(line.slice("author-time ".length));
    else if (line.startsWith("summary ")) current.summary = line.slice("summary ".length);
    else if (line.startsWith("filename ")) current.path = line.slice("filename ".length);
    else if (line.startsWith("\t")) {
      current.sourceLine = line.slice(1);
      entries.push(current);
      current = undefined;
    } else if (line.length > 0) {
      unparsedLineCount += 1;
    }
  }

  return {
    parser: "git-blame-line-porcelain-v1",
    entries,
    rawLineCount: lines.length,
    unparsedLineCount,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitTraceLineOwnershipProviderResult): GitTraceLineOwnershipResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.traceLineOwnership",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.traceLineOwnership",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitTraceLineOwnershipDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitTraceLineOwnershipDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: parseGitTraceLineOwnership(providerResult?.stdout ?? ""),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.traceLineOwnership.dryRun" : "agentCore.basicTool.git.traceLineOwnership.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { filePath: normalized.target.filePath, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.traceLineOwnership.dryRun" : "basicTool.git.traceLineOwnership.executed"],
  };
}

export function planTraceLineOwnership(request: GitTraceLineOwnershipRequest = {}): GitTraceLineOwnershipResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitTraceLineOwnership(request: GitTraceLineOwnershipRequest = {}): Promise<GitTraceLineOwnershipResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.traceLineOwnership requires runtime.execEngine.git.runGit for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.traceLineOwnership provider failed", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
