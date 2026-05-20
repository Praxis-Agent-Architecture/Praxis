/*
 * git.removeTrackedFile storage core.
 * Owns the fixed git-rm tracked-file mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitRemoveTrackedFilePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitRemoveTrackedFileGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitRemoveTrackedFileContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitRemoveTrackedFileGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitRemoveTrackedFilePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitRemoveTrackedFileTarget = {
  repositoryPath: string;
  filePath: string;
  keepWorkingTree: boolean;
  force: boolean;
};

export type GitRemoveTrackedFileRequest = {
  target?: Partial<GitRemoveTrackedFileTarget>;
  context?: GitRemoveTrackedFileContext;
  provider?: GitRemoveTrackedFileProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  filePath?: string;
  keepWorkingTree?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type GitRemoveTrackedFileRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-remove-tracked-file-workspace-mutation";
  allowedSubcommand: "rm";
};

export type GitRemoveTrackedFileRisk = {
  category: "workspace-mutation" | "destructive";
  riskLevel: "risky" | "destructive";
  mutatesRepository: true;
  mutatesWorkingTree: boolean;
  mutatesIndex: true;
  removesTrackedFile: true;
  keepsWorkingTreeFile: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitRemoveTrackedFileEnvelope = {
  parser: "git-rm-output-v1";
  filePath: string;
  keepWorkingTree: boolean;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  removedPaths: readonly string[];
  cachedOnlyPaths: readonly string[];
  unparsedLineCount: number;
};

export type GitRemoveTrackedFileOutput = {
  kind: "agentCore.basicTool.git.removeTrackedFile";
  target: GitRemoveTrackedFileTarget;
  runtimeEntry: GitRemoveTrackedFileRuntimeEntry;
  risk: GitRemoveTrackedFileRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitRemoveTrackedFilePermission[];
  unsafeSideEffects: true;
  removesTrackedFile: true;
  resultEnvelope: GitRemoveTrackedFileEnvelope;
};

export type GitRemoveTrackedFilePlan = {
  toolId: "git.removeTrackedFile";
  toolKind: "git.removeTrackedFile";
  capability: "remove-tracked-file";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  filePath: string;
  keepWorkingTree: boolean;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitRemoveTrackedFilePermission[];
  runtimeEntry: GitRemoveTrackedFileRuntimeEntry;
  risk: GitRemoveTrackedFileRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: boolean;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-rm-runtime-guard";
    event: "basicTool.git.removeTrackedFile.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitRemoveTrackedFileErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitRemoveTrackedFileErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_FILE_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "UNSAFE_FILE_PATH"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitRemoveTrackedFileError = {
  code: GitRemoveTrackedFileErrorCode;
  message: string;
  boundary: GitRemoveTrackedFileErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitRemoveTrackedFileAuditEvent = {
  type: string;
  toolId: "git.removeTrackedFile";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRemoveTrackedFileResult =
  | {
      ok: true;
      toolId: "git.removeTrackedFile";
      output: GitRemoveTrackedFileOutput;
      plan: GitRemoveTrackedFilePlan;
      audit: readonly GitRemoveTrackedFileAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.removeTrackedFile";
      error: GitRemoveTrackedFileError;
      audit: readonly GitRemoveTrackedFileAuditEvent[];
      events: readonly string[];
    };

export type GitRemoveTrackedFileProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitRemoveTrackedFileProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitRemoveTrackedFileProvider = (
  request: GitRemoveTrackedFileProviderRequest,
  context: GitRemoveTrackedFileContext,
) => GitRemoveTrackedFileProviderResult | Promise<GitRemoveTrackedFileProviderResult>;

type NormalizedRequest = {
  target: GitRemoveTrackedFileTarget;
  context: GitRemoveTrackedFileContext;
  timeoutMs?: number;
};

export const gitRemoveTrackedFileDescriptor = {
  toolId: "git.removeTrackedFile",
  toolKind: "git.removeTrackedFile",
  capability: "remove-tracked-file",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
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

function dryRunEnabled(context: GitRemoveTrackedFileContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitRemoveTrackedFileContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.removeTrackedFile:dry-run";
}

function runtimeId(context: GitRemoveTrackedFileContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitRemoveTrackedFileContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitRemoveTrackedFileAuditEvent {
  return {
    type,
    toolId: gitRemoveTrackedFileDescriptor.toolId,
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
  code: GitRemoveTrackedFileErrorCode,
  message: string,
  boundary: GitRemoveTrackedFileErrorBoundary,
  context: GitRemoveTrackedFileContext | undefined,
  repositoryPath?: string,
): GitRemoveTrackedFileResult {
  return {
    ok: false,
    toolId: gitRemoveTrackedFileDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.removeTrackedFile.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.removeTrackedFile.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitRemoveTrackedFileContext | GitRemoveTrackedFileResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.removeTrackedFile context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.removeTrackedFile context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.removeTrackedFile context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.removeTrackedFile context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.removeTrackedFile context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitRemoveTrackedFilePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitRemoveTrackedFileContext | undefined): string | GitRemoveTrackedFileResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.removeTrackedFile requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.removeTrackedFile repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeFilePath(value: unknown, context: GitRemoveTrackedFileContext, repositoryPath: string): string | GitRemoveTrackedFileResult {
  const normalized = stringValue(value)?.trim().replaceAll("\\", "/") ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_FILE_PATH", "git.removeTrackedFile requires target.filePath", "input", context, repositoryPath);
  }
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("UNSAFE_FILE_PATH", "git.removeTrackedFile target.filePath must be repository-relative", "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("UNSAFE_FILE_PATH", "git.removeTrackedFile target.filePath must stay inside the repository", "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizeTimeout(
  value: unknown,
  context: GitRemoveTrackedFileContext,
  repositoryPath: string,
): number | undefined | GitRemoveTrackedFileResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitRemoveTrackedFileDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.removeTrackedFile timeoutMs must be an integer from 1 to ${gitRemoveTrackedFileDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitRemoveTrackedFileResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.removeTrackedFile request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.removeTrackedFile target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const filePath = normalizeFilePath(targetRecord.filePath, context, repositoryPath);
  if (typeof filePath !== "string") return filePath;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      filePath,
      keepWorkingTree: targetRecord.keepWorkingTree === true,
      force: targetRecord.force === true,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitRemoveTrackedFileContext | undefined): GitRemoveTrackedFileResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.removeTrackedFile target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(target: GitRemoveTrackedFileTarget): readonly GitRemoveTrackedFilePermission[] {
  return target.keepWorkingTree
    ? ["git:read", "git:write", "filesystem:read"]
    : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  target: GitRemoveTrackedFileTarget,
  context: GitRemoveTrackedFileContext | undefined,
): GitRemoveTrackedFileResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.removeTrackedFile is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitRemoveTrackedFileContext): GitRemoveTrackedFileResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.removeTrackedFile requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitRemoveTrackedFileTarget): readonly string[] {
  return [
    "rm",
    ...(target.keepWorkingTree ? ["--cached"] : []),
    ...(target.force ? ["--force"] : []),
    "--",
    target.filePath,
  ];
}

function commandPreview(target: GitRemoveTrackedFileTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitRemoveTrackedFileRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-remove-tracked-file-workspace-mutation",
  allowedSubcommand: "rm",
};

function riskFor(target: GitRemoveTrackedFileTarget): GitRemoveTrackedFileRisk {
  return {
    category: target.keepWorkingTree ? "workspace-mutation" : "destructive",
    riskLevel: target.keepWorkingTree ? "risky" : "destructive",
    mutatesRepository: true,
    mutatesWorkingTree: !target.keepWorkingTree,
    mutatesIndex: true,
    removesTrackedFile: true,
    keepsWorkingTreeFile: target.keepWorkingTree,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitRemoveTrackedFilePlan["dispatch"], dryRun: boolean): GitRemoveTrackedFilePlan {
  const risk = riskFor(normalized.target);
  return {
    toolId: "git.removeTrackedFile",
    toolKind: "git.removeTrackedFile",
    capability: "remove-tracked-file",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    filePath: normalized.target.filePath,
    keepWorkingTree: normalized.target.keepWorkingTree,
    force: normalized.target.force,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: risk.mutatesWorkingTree,
    wouldMutateIndex: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-rm-runtime-guard",
      event: "basicTool.git.removeTrackedFile.planned",
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

function outputLines(stdout: string, stderr: string): readonly string[] {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseQuotedPath(line: string): string | undefined {
  const match = line.match(/^rm '(.+)'$/u);
  return match?.[1];
}

export function parseGitRemoveTrackedFileResult(
  providerResult: GitRemoveTrackedFileProviderResult | undefined,
  target: GitRemoveTrackedFileTarget,
): GitRemoveTrackedFileEnvelope {
  const lines = providerResult === undefined ? [] : outputLines(providerResult.stdout, providerResult.stderr);
  const parsedPaths = lines.map(parseQuotedPath).filter((path): path is string => path !== undefined);
  return {
    parser: "git-rm-output-v1",
    filePath: target.filePath,
    keepWorkingTree: target.keepWorkingTree,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    removedPaths: target.keepWorkingTree ? [] : parsedPaths,
    cachedOnlyPaths: target.keepWorkingTree ? parsedPaths : [],
    unparsedLineCount: lines.filter((line) => parseQuotedPath(line) === undefined).length,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitRemoveTrackedFileProviderResult): GitRemoveTrackedFileResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.removeTrackedFile",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.removeTrackedFile",
      target: normalized.target,
      runtimeEntry,
      risk: executionPlan.risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitRemoveTrackedFileDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      removesTrackedFile: true,
      resultEnvelope: parseGitRemoveTrackedFileResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.removeTrackedFile.dryRun" : "agentCore.basicTool.git.removeTrackedFile.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          filePath: normalized.target.filePath,
          keepWorkingTree: normalized.target.keepWorkingTree,
          force: normalized.target.force,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.removeTrackedFile.dryRun" : "basicTool.git.removeTrackedFile.executed"],
  };
}

export function planGitRemoveTrackedFile(request: GitRemoveTrackedFileRequest = {}): GitRemoveTrackedFileResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitRemoveTrackedFile(request: GitRemoveTrackedFileRequest = {}): Promise<GitRemoveTrackedFileResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.removeTrackedFile requires runtime.execEngine.git.runGit for real execution",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
  try {
    const providerResult = await request.provider(
      {
        repositoryPath: normalized.target.repositoryPath,
        args: providerArgs(normalized.target),
        timeoutMs: normalized.timeoutMs,
      },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "git.removeTrackedFile provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
