/*
 * git.getWorkingTreeDiff storage core.
 * Owns the fixed git-diff contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitGetWorkingTreeDiffPermission = "git:read" | "filesystem:read";
export type GitWorkingTreeDiffMode = "unstaged" | "staged" | "combined";

export type GitWorkingTreeDiffGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitGetWorkingTreeDiffContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitWorkingTreeDiffGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitGetWorkingTreeDiffPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitGetWorkingTreeDiffTarget = {
  repositoryPath: string;
  mode: GitWorkingTreeDiffMode;
  compareRef?: string;
  pathspecs: readonly string[];
  contextLines?: number;
};

export type GitGetWorkingTreeDiffRequest = {
  target?: Partial<GitGetWorkingTreeDiffTarget>;
  context?: GitGetWorkingTreeDiffContext;
  provider?: GitWorkingTreeDiffProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  mode?: GitWorkingTreeDiffMode;
  compareRef?: string;
  pathspecs?: readonly string[];
  contextLines?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
};

export type GitWorkingTreeDiffRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-diff-read";
  allowedSubcommand: "diff";
};

export type GitWorkingTreeDiffRisk = {
  category: "read-only-inspection";
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitWorkingTreeDiffFileEnvelope = {
  oldPath?: string;
  newPath?: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
};

export type GitWorkingTreeDiffEnvelope = {
  parser: "git-diff-raw-v1";
  files: readonly GitWorkingTreeDiffFileEnvelope[];
  hunkCount: number;
  rawLineCount: number;
};

export type GitGetWorkingTreeDiffOutput = {
  kind: "agentCore.basicTool.git.getWorkingTreeDiff";
  target: GitGetWorkingTreeDiffTarget;
  runtimeEntry: GitWorkingTreeDiffRuntimeEntry;
  risk: GitWorkingTreeDiffRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitGetWorkingTreeDiffPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitWorkingTreeDiffEnvelope;
};

export type GitGetWorkingTreeDiffPlan = {
  toolId: "git.getWorkingTreeDiff";
  toolKind: "git.getWorkingTreeDiff";
  capability: "read-working-tree-diff";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  mode: GitWorkingTreeDiffMode;
  compareRef?: string;
  pathspecs: readonly string[];
  contextLines?: number;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitGetWorkingTreeDiffPermission[];
  runtimeEntry: GitWorkingTreeDiffRuntimeEntry;
  risk: GitWorkingTreeDiffRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldReadWorkingTree: true;
  unsafeSideEffects: false;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-diff-runtime-guard";
    event: "basicTool.git.getWorkingTreeDiff.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitGetWorkingTreeDiffErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitGetWorkingTreeDiffErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_DIFF_MODE"
  | "INVALID_COMPARE_REF"
  | "INVALID_PATHSPEC"
  | "PATHSPEC_OUTSIDE_SCOPE"
  | "INVALID_CONTEXT_LINES"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitGetWorkingTreeDiffError = {
  code: GitGetWorkingTreeDiffErrorCode;
  message: string;
  boundary: GitGetWorkingTreeDiffErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitGetWorkingTreeDiffAuditEvent = {
  type: string;
  toolId: "git.getWorkingTreeDiff";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitGetWorkingTreeDiffResult =
  | {
      ok: true;
      toolId: "git.getWorkingTreeDiff";
      output: GitGetWorkingTreeDiffOutput;
      plan: GitGetWorkingTreeDiffPlan;
      audit: readonly GitGetWorkingTreeDiffAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.getWorkingTreeDiff";
      error: GitGetWorkingTreeDiffError;
      audit: readonly GitGetWorkingTreeDiffAuditEvent[];
      events: readonly string[];
    };

export type GitWorkingTreeDiffProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitWorkingTreeDiffProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitWorkingTreeDiffProvider = (
  request: GitWorkingTreeDiffProviderRequest,
  context: GitGetWorkingTreeDiffContext,
) => GitWorkingTreeDiffProviderResult | Promise<GitWorkingTreeDiffProviderResult>;

type NormalizedRequest = {
  target: GitGetWorkingTreeDiffTarget;
  context: GitGetWorkingTreeDiffContext;
  timeoutMs?: number;
};

export const gitGetWorkingTreeDiffDescriptor = {
  toolId: "git.getWorkingTreeDiff",
  toolKind: "git.getWorkingTreeDiff",
  capability: "read-working-tree-diff",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  supportedModes: ["unstaged", "staged", "combined"],
  defaultMode: "unstaged",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-inspection",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
} as const;

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

function dryRunEnabled(context: GitGetWorkingTreeDiffContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitGetWorkingTreeDiffContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.getWorkingTreeDiff:dry-run";
}

function runtimeId(context: GitGetWorkingTreeDiffContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitGetWorkingTreeDiffContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitGetWorkingTreeDiffAuditEvent {
  return {
    type,
    toolId: gitGetWorkingTreeDiffDescriptor.toolId,
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
  code: GitGetWorkingTreeDiffErrorCode,
  message: string,
  boundary: GitGetWorkingTreeDiffErrorBoundary,
  context: GitGetWorkingTreeDiffContext | undefined,
  repositoryPath?: string,
): GitGetWorkingTreeDiffResult {
  return {
    ok: false,
    toolId: gitGetWorkingTreeDiffDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.getWorkingTreeDiff.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.getWorkingTreeDiff.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitGetWorkingTreeDiffContext | GitGetWorkingTreeDiffResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.getWorkingTreeDiff context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.getWorkingTreeDiff context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.getWorkingTreeDiff context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.getWorkingTreeDiff context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.getWorkingTreeDiff context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitGetWorkingTreeDiffPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitGetWorkingTreeDiffContext | undefined): string | GitGetWorkingTreeDiffResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.getWorkingTreeDiff requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.getWorkingTreeDiff repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeMode(value: unknown, context: GitGetWorkingTreeDiffContext, repositoryPath: string): GitWorkingTreeDiffMode | GitGetWorkingTreeDiffResult {
  const normalized = stringValue(value)?.trim() || gitGetWorkingTreeDiffDescriptor.defaultMode;
  if (normalized === "unstaged" || normalized === "staged" || normalized === "combined") {
    return normalized;
  }
  return failure("INVALID_DIFF_MODE", "git.getWorkingTreeDiff target.mode must be unstaged, staged, or combined", "input", context, repositoryPath);
}

function normalizeCompareRef(value: unknown, context: GitGetWorkingTreeDiffContext, repositoryPath: string): string | undefined | GitGetWorkingTreeDiffResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_COMPARE_REF", "git.getWorkingTreeDiff target.compareRef must be a safe git revision", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizePathspec(value: string, context: GitGetWorkingTreeDiffContext, repositoryPath: string): string | GitGetWorkingTreeDiffResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.getWorkingTreeDiff target.pathspecs must be repository-relative paths", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.getWorkingTreeDiff target.pathspecs must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePathspecs(value: unknown, context: GitGetWorkingTreeDiffContext, repositoryPath: string): readonly string[] | GitGetWorkingTreeDiffResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATHSPEC", "git.getWorkingTreeDiff target.pathspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const pathspec = normalizePathspec(item, context, repositoryPath);
    if (typeof pathspec !== "string") return pathspec;
    if (pathspec.length > 0) normalized.push(pathspec);
  }
  return [...new Set(normalized)];
}

function normalizeContextLines(value: unknown, context: GitGetWorkingTreeDiffContext, repositoryPath: string): number | undefined | GitGetWorkingTreeDiffResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    return failure("INVALID_CONTEXT_LINES", "git.getWorkingTreeDiff target.contextLines must be an integer from 0 to 1000", "input", context, repositoryPath);
  }
  return value;
}

function normalizeTimeout(value: unknown, context: GitGetWorkingTreeDiffContext, repositoryPath: string): number | undefined | GitGetWorkingTreeDiffResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitGetWorkingTreeDiffDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", `git.getWorkingTreeDiff timeoutMs must be an integer from 1 to ${gitGetWorkingTreeDiffDescriptor.maxTimeoutMs}`, "input", context, repositoryPath);
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitGetWorkingTreeDiffResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.getWorkingTreeDiff request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.getWorkingTreeDiff target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const mode = normalizeMode(targetRecord.mode, context, repositoryPath);
  if (typeof mode !== "string") return mode;
  const compareRef = normalizeCompareRef(targetRecord.compareRef, context, repositoryPath);
  if (compareRef !== undefined && typeof compareRef !== "string") return compareRef;
  const pathspecs = normalizePathspecs(targetRecord.pathspecs, context, repositoryPath);
  if ("ok" in pathspecs) return pathspecs;
  const contextLines = normalizeContextLines(targetRecord.contextLines, context, repositoryPath);
  if (contextLines !== undefined && typeof contextLines !== "number") return contextLines;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, mode, compareRef, pathspecs, contextLines }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitGetWorkingTreeDiffContext | undefined): GitGetWorkingTreeDiffResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.getWorkingTreeDiff target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitGetWorkingTreeDiffContext | undefined): GitGetWorkingTreeDiffResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitGetWorkingTreeDiffDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.getWorkingTreeDiff is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitGetWorkingTreeDiffContext): GitGetWorkingTreeDiffResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.getWorkingTreeDiff requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitGetWorkingTreeDiffTarget): readonly string[] {
  const args = ["diff"];
  if (target.contextLines !== undefined) args.push(`--unified=${target.contextLines}`);
  if (target.compareRef !== undefined) {
    args.push(target.compareRef);
  } else if (target.mode === "staged") {
    args.push("--staged");
  } else if (target.mode === "combined") {
    args.push("HEAD");
  }
  if (target.pathspecs.length > 0) args.push("--", ...target.pathspecs);
  return args;
}

function commandPreview(target: GitGetWorkingTreeDiffTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitWorkingTreeDiffRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-diff-read",
  allowedSubcommand: "diff",
};

const risk: GitWorkingTreeDiffRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitGetWorkingTreeDiffPlan["dispatch"], dryRun: boolean): GitGetWorkingTreeDiffPlan {
  return {
    toolId: "git.getWorkingTreeDiff",
    toolKind: "git.getWorkingTreeDiff",
    capability: "read-working-tree-diff",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    mode: normalized.target.mode,
    compareRef: normalized.target.compareRef,
    pathspecs: normalized.target.pathspecs,
    contextLines: normalized.target.contextLines,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitGetWorkingTreeDiffDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldReadWorkingTree: true,
    unsafeSideEffects: false,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-diff-runtime-guard",
      event: "basicTool.git.getWorkingTreeDiff.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

export function parseGitWorkingTreeDiff(stdout: string): GitWorkingTreeDiffEnvelope {
  const files: GitWorkingTreeDiffFileEnvelope[] = [];
  let hunkCount = 0;
  for (const line of stdout.split(/\r?\n/u)) {
    if (line.startsWith("@@")) hunkCount += 1;
    if (!line.startsWith("diff --git ")) continue;
    const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    const oldPath = match?.[1];
    const newPath = match?.[2];
    files.push({ oldPath, newPath, status: "modified" });
  }
  const lines = stdout.length === 0 ? [] : stdout.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const last = files[files.length - 1];
    if (last === undefined) continue;
    if (line.startsWith("new file mode")) last.status = "added";
    if (line.startsWith("deleted file mode")) last.status = "deleted";
    if (line.startsWith("rename from ")) last.status = "renamed";
    if (line.startsWith("copy from ")) last.status = "copied";
  }
  return { parser: "git-diff-raw-v1", files, hunkCount, rawLineCount: stdout.length === 0 ? 0 : lines.length };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitWorkingTreeDiffProviderResult): GitGetWorkingTreeDiffResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.getWorkingTreeDiff",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.getWorkingTreeDiff",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitGetWorkingTreeDiffDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitGetWorkingTreeDiffDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: parseGitWorkingTreeDiff(providerResult?.stdout ?? ""),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.getWorkingTreeDiff.dryRun" : "agentCore.basicTool.git.getWorkingTreeDiff.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { mode: normalized.target.mode, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.getWorkingTreeDiff.dryRun" : "basicTool.git.getWorkingTreeDiff.executed"],
  };
}

export function planGetWorkingTreeDiff(request: GitGetWorkingTreeDiffRequest = {}): GitGetWorkingTreeDiffResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitWorkingTreeDiff(request: GitGetWorkingTreeDiffRequest = {}): Promise<GitGetWorkingTreeDiffResult> {
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
      "git.getWorkingTreeDiff requires runtime.execEngine.git.runGit for real execution",
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
    return failure("PROVIDER_REJECTED", "git.getWorkingTreeDiff provider failed", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
