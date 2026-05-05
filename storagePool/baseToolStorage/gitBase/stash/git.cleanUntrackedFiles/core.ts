/*
 * git.cleanUntrackedFiles storage core.
 * Owns the fixed git clean workspace deletion contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitCleanUntrackedFilesPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitCleanUntrackedFilesIgnoredMode = "tracked-ignored" | "ignored-only" | "none";

export type GitCleanUntrackedFilesGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitCleanUntrackedFilesContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitCleanUntrackedFilesGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitCleanUntrackedFilesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitCleanUntrackedFilesTarget = {
  repositoryPath: string;
  paths: readonly string[];
  includeDirectories: boolean;
  ignoredMode: GitCleanUntrackedFilesIgnoredMode;
};

export type GitCleanUntrackedFilesRequest = {
  target?: Partial<GitCleanUntrackedFilesTarget>;
  context?: GitCleanUntrackedFilesContext;
  provider?: GitCleanUntrackedFilesProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  paths?: readonly string[];
  includeDirectories?: boolean;
  ignoredMode?: GitCleanUntrackedFilesIgnoredMode;
  dryRun?: boolean;
};

export type GitCleanUntrackedFilesRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-clean-untracked-workspace-deletion";
  allowedSubcommand: "clean";
};

export type GitCleanUntrackedFilesRisk = {
  category: "destructive";
  riskLevel: "destructive";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: false;
  deletesUntrackedFiles: true;
  mayDeleteIgnoredFiles: boolean;
  repositoryWide: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitCleanUntrackedFilesEnvelope = {
  parser: "git-clean-output-v1";
  paths: readonly string[];
  includeDirectories: boolean;
  ignoredMode: GitCleanUntrackedFilesIgnoredMode;
  repositoryWide: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  removedPaths: readonly string[];
  previewPaths: readonly string[];
  unparsedLineCount: number;
  truncated: false;
};

export type GitCleanUntrackedFilesOutput = {
  kind: "agentCore.basicTool.git.cleanUntrackedFiles";
  target: GitCleanUntrackedFilesTarget;
  runtimeEntry: GitCleanUntrackedFilesRuntimeEntry;
  risk: GitCleanUntrackedFilesRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitCleanUntrackedFilesPermission[];
  unsafeSideEffects: true;
  deletesUntrackedFiles: true;
  resultEnvelope: GitCleanUntrackedFilesEnvelope;
};

export type GitCleanUntrackedFilesPlan = {
  toolId: "git.cleanUntrackedFiles";
  toolKind: "git.cleanUntrackedFiles";
  capability: "clean-untracked-files";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  paths: readonly string[];
  includeDirectories: boolean;
  ignoredMode: GitCleanUntrackedFilesIgnoredMode;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitCleanUntrackedFilesPermission[];
  runtimeEntry: GitCleanUntrackedFilesRuntimeEntry;
  risk: GitCleanUntrackedFilesRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: false;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-clean-untracked-runtime-guard";
    event: "basicTool.git.cleanUntrackedFiles.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitCleanUntrackedFilesErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitCleanUntrackedFilesErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_PATH"
  | "PATH_OUTSIDE_SCOPE"
  | "INVALID_IGNORED_MODE"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitCleanUntrackedFilesError = {
  code: GitCleanUntrackedFilesErrorCode;
  message: string;
  boundary: GitCleanUntrackedFilesErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitCleanUntrackedFilesAuditEvent = {
  type: string;
  toolId: "git.cleanUntrackedFiles";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitCleanUntrackedFilesResult =
  | {
      ok: true;
      toolId: "git.cleanUntrackedFiles";
      output: GitCleanUntrackedFilesOutput;
      plan: GitCleanUntrackedFilesPlan;
      audit: readonly GitCleanUntrackedFilesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.cleanUntrackedFiles";
      error: GitCleanUntrackedFilesError;
      audit: readonly GitCleanUntrackedFilesAuditEvent[];
      events: readonly string[];
    };

export type GitCleanUntrackedFilesProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitCleanUntrackedFilesProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitCleanUntrackedFilesProvider = (
  request: GitCleanUntrackedFilesProviderRequest,
  context: GitCleanUntrackedFilesContext,
) => GitCleanUntrackedFilesProviderResult | Promise<GitCleanUntrackedFilesProviderResult>;

type NormalizedRequest = {
  target: GitCleanUntrackedFilesTarget;
  context: GitCleanUntrackedFilesContext;
  timeoutMs?: number;
};

export const gitCleanUntrackedFilesDescriptor = {
  toolId: "git.cleanUntrackedFiles",
  toolKind: "git.cleanUntrackedFiles",
  capability: "clean-untracked-files",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "destructive",
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: true,
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

function dryRunEnabled(context: GitCleanUntrackedFilesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitCleanUntrackedFilesContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.cleanUntrackedFiles:dry-run";
}

function runtimeId(context: GitCleanUntrackedFilesContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitCleanUntrackedFilesContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitCleanUntrackedFilesAuditEvent {
  return {
    type,
    toolId: gitCleanUntrackedFilesDescriptor.toolId,
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
  code: GitCleanUntrackedFilesErrorCode,
  message: string,
  boundary: GitCleanUntrackedFilesErrorBoundary,
  context: GitCleanUntrackedFilesContext | undefined,
  repositoryPath?: string,
): GitCleanUntrackedFilesResult {
  return {
    ok: false,
    toolId: gitCleanUntrackedFilesDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.cleanUntrackedFiles.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.cleanUntrackedFiles.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitCleanUntrackedFilesContext | GitCleanUntrackedFilesResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.cleanUntrackedFiles context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.cleanUntrackedFiles context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.cleanUntrackedFiles context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.cleanUntrackedFiles context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.cleanUntrackedFiles context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitCleanUntrackedFilesPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitCleanUntrackedFilesContext | undefined): string | GitCleanUntrackedFilesResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.cleanUntrackedFiles requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.cleanUntrackedFiles repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizePath(value: string, context: GitCleanUntrackedFilesContext, repositoryPath: string): string | GitCleanUntrackedFilesResult {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0) return "";
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("PATH_OUTSIDE_SCOPE", "git.cleanUntrackedFiles target.paths must be repository-relative paths", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("PATH_OUTSIDE_SCOPE", "git.cleanUntrackedFiles target.paths must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizePaths(
  value: unknown,
  context: GitCleanUntrackedFilesContext,
  repositoryPath: string,
): readonly string[] | GitCleanUntrackedFilesResult {
  const raw = stringArrayValue(value);
  if (value !== undefined && raw === undefined) {
    return failure("INVALID_PATH", "git.cleanUntrackedFiles target.paths must be a string array", "input", context, repositoryPath);
  }
  const normalized: string[] = [];
  for (const item of cleanList(raw)) {
    const path = normalizePath(item, context, repositoryPath);
    if (typeof path !== "string") return path;
    if (path.length > 0) normalized.push(path);
  }
  return [...new Set(normalized)];
}

function normalizeIgnoredMode(
  value: unknown,
  context: GitCleanUntrackedFilesContext,
  repositoryPath: string,
): GitCleanUntrackedFilesIgnoredMode | GitCleanUntrackedFilesResult {
  if (value === undefined || value === "none") return "none";
  if (value === "tracked-ignored" || value === "ignored-only") return value;
  return failure(
    "INVALID_IGNORED_MODE",
    "git.cleanUntrackedFiles target.ignoredMode must be tracked-ignored, ignored-only, or none",
    "input",
    context,
    repositoryPath,
  );
}

function normalizeTimeout(
  value: unknown,
  context: GitCleanUntrackedFilesContext,
  repositoryPath: string,
): number | undefined | GitCleanUntrackedFilesResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitCleanUntrackedFilesDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.cleanUntrackedFiles timeoutMs must be an integer from 1 to ${gitCleanUntrackedFilesDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitCleanUntrackedFilesResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.cleanUntrackedFiles request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.cleanUntrackedFiles target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const paths = normalizePaths(targetRecord.paths, context, repositoryPath);
  if ("ok" in paths) return paths;
  const ignoredMode = normalizeIgnoredMode(targetRecord.ignoredMode, context, repositoryPath);
  if (typeof ignoredMode !== "string") return ignoredMode;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      paths,
      includeDirectories: targetRecord.includeDirectories !== false,
      ignoredMode,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitCleanUntrackedFilesContext | undefined): GitCleanUntrackedFilesResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.cleanUntrackedFiles target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitCleanUntrackedFilesContext | undefined): GitCleanUntrackedFilesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitCleanUntrackedFilesDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.cleanUntrackedFiles is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitCleanUntrackedFilesContext): GitCleanUntrackedFilesResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.cleanUntrackedFiles requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitCleanUntrackedFilesTarget, dryRun: boolean): readonly string[] {
  return [
    "clean",
    ...(dryRun ? ["--dry-run"] : []),
    "-f",
    ...(target.includeDirectories ? ["-d"] : []),
    ...(target.ignoredMode === "tracked-ignored" ? ["-x"] : []),
    ...(target.ignoredMode === "ignored-only" ? ["-X"] : []),
    ...(target.paths.length === 0 ? [] : ["--", ...target.paths]),
  ];
}

function commandPreview(target: GitCleanUntrackedFilesTarget, dryRun: boolean): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target, dryRun)];
}

const runtimeEntry: GitCleanUntrackedFilesRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-clean-untracked-workspace-deletion",
  allowedSubcommand: "clean",
};

function riskFor(target: GitCleanUntrackedFilesTarget): GitCleanUntrackedFilesRisk {
  return {
    category: "destructive",
    riskLevel: "destructive",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mutatesIndex: false,
    deletesUntrackedFiles: true,
    mayDeleteIgnoredFiles: target.ignoredMode !== "none",
    repositoryWide: target.paths.length === 0,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitCleanUntrackedFilesPlan["dispatch"], dryRun: boolean): GitCleanUntrackedFilesPlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.cleanUntrackedFiles",
    toolKind: "git.cleanUntrackedFiles",
    capability: "clean-untracked-files",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    paths: normalized.target.paths,
    includeDirectories: normalized.target.includeDirectories,
    ignoredMode: normalized.target.ignoredMode,
    gitArgs: providerArgs(normalized.target, dryRun),
    commandPreview: commandPreview(normalized.target, dryRun),
    requiredPermissions: gitCleanUntrackedFilesDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: false,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-clean-untracked-runtime-guard",
      event: "basicTool.git.cleanUntrackedFiles.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).length;
}

function cleanOutputLines(stdout: string, stderr: string): readonly string[] {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCleanPaths(lines: readonly string[], prefix: "Removing " | "Would remove "): readonly string[] {
  return lines
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
    .filter(Boolean);
}

export function parseGitCleanUntrackedFilesResult(
  providerResult: GitCleanUntrackedFilesProviderResult | undefined,
  target: GitCleanUntrackedFilesTarget,
): GitCleanUntrackedFilesEnvelope {
  const lines = providerResult === undefined ? [] : cleanOutputLines(providerResult.stdout, providerResult.stderr);
  const removedPaths = parseCleanPaths(lines, "Removing ");
  const previewPaths = parseCleanPaths(lines, "Would remove ");
  return {
    parser: "git-clean-output-v1",
    paths: target.paths,
    includeDirectories: target.includeDirectories,
    ignoredMode: target.ignoredMode,
    repositoryWide: target.paths.length === 0,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    removedPaths,
    previewPaths,
    unparsedLineCount: lines.filter((line) => !line.startsWith("Removing ") && !line.startsWith("Would remove ")).length,
    truncated: false,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitCleanUntrackedFilesProviderResult): GitCleanUntrackedFilesResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.cleanUntrackedFiles",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.cleanUntrackedFiles",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitCleanUntrackedFilesDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitCleanUntrackedFilesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      deletesUntrackedFiles: true,
      resultEnvelope: parseGitCleanUntrackedFilesResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.cleanUntrackedFiles.dryRun" : "agentCore.basicTool.git.cleanUntrackedFiles.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          pathCount: normalized.target.paths.length,
          includeDirectories: normalized.target.includeDirectories,
          ignoredMode: normalized.target.ignoredMode,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.cleanUntrackedFiles.dryRun" : "basicTool.git.cleanUntrackedFiles.executed"],
  };
}

export function planGitCleanUntrackedFiles(request: GitCleanUntrackedFilesRequest = {}): GitCleanUntrackedFilesResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitCleanUntrackedFiles(request: GitCleanUntrackedFilesRequest = {}): Promise<GitCleanUntrackedFilesResult> {
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
      "git.cleanUntrackedFiles requires runtime.execEngine.git.runGit for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const providerResult = await request.provider(
      {
        repositoryPath: normalized.target.repositoryPath,
        args: providerArgs(normalized.target, false),
        timeoutMs: normalized.timeoutMs,
      },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "git.cleanUntrackedFiles provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
