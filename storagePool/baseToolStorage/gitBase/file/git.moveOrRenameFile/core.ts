/*
 * git.moveOrRenameFile storage core.
 * Owns the fixed git-mv tracked-file mutation contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitMoveOrRenameFilePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitMoveOrRenameFileGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitMoveOrRenameFileContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitMoveOrRenameFileGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitMoveOrRenameFilePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitMoveOrRenameFileTarget = {
  repositoryPath: string;
  sourcePath: string;
  destinationPath: string;
  force: boolean;
};

export type GitMoveOrRenameFileRequest = {
  target?: Partial<GitMoveOrRenameFileTarget>;
  context?: GitMoveOrRenameFileContext;
  provider?: GitMoveOrRenameFileProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  sourcePath?: string;
  destinationPath?: string;
  force?: boolean;
  dryRun?: boolean;
};

export type GitMoveOrRenameFileRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-move-or-rename-file-workspace-mutation";
  allowedSubcommand: "mv";
};

export type GitMoveOrRenameFileRisk = {
  category: "workspace-mutation";
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mutatesIndex: true;
  movesTrackedFile: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitMoveOrRenameFileEnvelope = {
  parser: "git-mv-output-v1";
  sourcePath: string;
  destinationPath: string;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  movedPairs: readonly { sourcePath: string; destinationPath: string }[];
  unparsedLineCount: number;
};

export type GitMoveOrRenameFileOutput = {
  kind: "agentCore.basicTool.git.moveOrRenameFile";
  target: GitMoveOrRenameFileTarget;
  runtimeEntry: GitMoveOrRenameFileRuntimeEntry;
  risk: GitMoveOrRenameFileRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitMoveOrRenameFilePermission[];
  unsafeSideEffects: true;
  movesTrackedFile: true;
  resultEnvelope: GitMoveOrRenameFileEnvelope;
};

export type GitMoveOrRenameFilePlan = {
  toolId: "git.moveOrRenameFile";
  toolKind: "git.moveOrRenameFile";
  capability: "move-or-rename-file";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  sourcePath: string;
  destinationPath: string;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitMoveOrRenameFilePermission[];
  runtimeEntry: GitMoveOrRenameFileRuntimeEntry;
  risk: GitMoveOrRenameFileRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateWorkingTree: true;
  wouldMutateIndex: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-mv-runtime-guard";
    event: "basicTool.git.moveOrRenameFile.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitMoveOrRenameFileErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitMoveOrRenameFileErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_SOURCE_PATH"
  | "MISSING_DESTINATION_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "UNSAFE_FILE_PATH"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitMoveOrRenameFileError = {
  code: GitMoveOrRenameFileErrorCode;
  message: string;
  boundary: GitMoveOrRenameFileErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitMoveOrRenameFileAuditEvent = {
  type: string;
  toolId: "git.moveOrRenameFile";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitMoveOrRenameFileResult =
  | {
      ok: true;
      toolId: "git.moveOrRenameFile";
      output: GitMoveOrRenameFileOutput;
      plan: GitMoveOrRenameFilePlan;
      audit: readonly GitMoveOrRenameFileAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.moveOrRenameFile";
      error: GitMoveOrRenameFileError;
      audit: readonly GitMoveOrRenameFileAuditEvent[];
      events: readonly string[];
    };

export type GitMoveOrRenameFileProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitMoveOrRenameFileProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitMoveOrRenameFileProvider = (
  request: GitMoveOrRenameFileProviderRequest,
  context: GitMoveOrRenameFileContext,
) => GitMoveOrRenameFileProviderResult | Promise<GitMoveOrRenameFileProviderResult>;

type NormalizedRequest = {
  target: GitMoveOrRenameFileTarget;
  context: GitMoveOrRenameFileContext;
  timeoutMs?: number;
};

export const gitMoveOrRenameFileDescriptor = {
  toolId: "git.moveOrRenameFile",
  toolKind: "git.moveOrRenameFile",
  capability: "move-or-rename-file",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "workspace-mutation",
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

function dryRunEnabled(context: GitMoveOrRenameFileContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitMoveOrRenameFileContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.moveOrRenameFile:dry-run";
}

function runtimeId(context: GitMoveOrRenameFileContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitMoveOrRenameFileContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitMoveOrRenameFileAuditEvent {
  return {
    type,
    toolId: gitMoveOrRenameFileDescriptor.toolId,
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
  code: GitMoveOrRenameFileErrorCode,
  message: string,
  boundary: GitMoveOrRenameFileErrorBoundary,
  context: GitMoveOrRenameFileContext | undefined,
  repositoryPath?: string,
): GitMoveOrRenameFileResult {
  return {
    ok: false,
    toolId: gitMoveOrRenameFileDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.moveOrRenameFile.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.moveOrRenameFile.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitMoveOrRenameFileContext | GitMoveOrRenameFileResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.moveOrRenameFile context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.moveOrRenameFile context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.moveOrRenameFile context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.moveOrRenameFile context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.moveOrRenameFile context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitMoveOrRenameFilePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitMoveOrRenameFileContext | undefined): string | GitMoveOrRenameFileResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.moveOrRenameFile requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.moveOrRenameFile repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeFilePath(
  value: unknown,
  missingCode: "MISSING_SOURCE_PATH" | "MISSING_DESTINATION_PATH",
  fieldName: "sourcePath" | "destinationPath",
  context: GitMoveOrRenameFileContext,
  repositoryPath: string,
): string | GitMoveOrRenameFileResult {
  const normalized = stringValue(value)?.trim().replaceAll("\\", "/") ?? "";
  if (normalized.length === 0) {
    return failure(missingCode, `git.moveOrRenameFile requires target.${fieldName}`, "input", context, repositoryPath);
  }
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return failure("UNSAFE_FILE_PATH", `git.moveOrRenameFile target.${fieldName} must be repository-relative`, "scope", context, repositoryPath);
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return failure("UNSAFE_FILE_PATH", `git.moveOrRenameFile target.${fieldName} must stay inside the repository`, "scope", context, repositoryPath);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizeTimeout(
  value: unknown,
  context: GitMoveOrRenameFileContext,
  repositoryPath: string,
): number | undefined | GitMoveOrRenameFileResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitMoveOrRenameFileDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.moveOrRenameFile timeoutMs must be an integer from 1 to ${gitMoveOrRenameFileDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitMoveOrRenameFileResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.moveOrRenameFile request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.moveOrRenameFile target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const sourcePath = normalizeFilePath(targetRecord.sourcePath, "MISSING_SOURCE_PATH", "sourcePath", context, repositoryPath);
  if (typeof sourcePath !== "string") return sourcePath;
  const destinationPath = normalizeFilePath(
    targetRecord.destinationPath,
    "MISSING_DESTINATION_PATH",
    "destinationPath",
    context,
    repositoryPath,
  );
  if (typeof destinationPath !== "string") return destinationPath;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      sourcePath,
      destinationPath,
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

function ensureScope(repositoryPath: string, context: GitMoveOrRenameFileContext | undefined): GitMoveOrRenameFileResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.moveOrRenameFile target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(): readonly GitMoveOrRenameFilePermission[] {
  return ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  target: GitMoveOrRenameFileTarget,
  context: GitMoveOrRenameFileContext | undefined,
): GitMoveOrRenameFileResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget().filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.moveOrRenameFile is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitMoveOrRenameFileContext): GitMoveOrRenameFileResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.moveOrRenameFile requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitMoveOrRenameFileTarget): readonly string[] {
  return ["mv", ...(target.force ? ["--force"] : []), "--", target.sourcePath, target.destinationPath];
}

function commandPreview(target: GitMoveOrRenameFileTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitMoveOrRenameFileRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-move-or-rename-file-workspace-mutation",
  allowedSubcommand: "mv",
};

const risk: GitMoveOrRenameFileRisk = {
  category: "workspace-mutation",
  riskLevel: "risky",
  mutatesRepository: true,
  mutatesWorkingTree: true,
  mutatesIndex: true,
  movesTrackedFile: true,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitMoveOrRenameFilePlan["dispatch"], dryRun: boolean): GitMoveOrRenameFilePlan {
  return {
    toolId: "git.moveOrRenameFile",
    toolKind: "git.moveOrRenameFile",
    capability: "move-or-rename-file",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    sourcePath: normalized.target.sourcePath,
    destinationPath: normalized.target.destinationPath,
    force: normalized.target.force,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateWorkingTree: true,
    wouldMutateIndex: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-mv-runtime-guard",
      event: "basicTool.git.moveOrRenameFile.planned",
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

export function parseGitMoveOrRenameFileResult(
  providerResult: GitMoveOrRenameFileProviderResult | undefined,
  target: GitMoveOrRenameFileTarget,
): GitMoveOrRenameFileEnvelope {
  const lines = providerResult === undefined ? [] : outputLines(providerResult.stdout, providerResult.stderr);
  return {
    parser: "git-mv-output-v1",
    sourcePath: target.sourcePath,
    destinationPath: target.destinationPath,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    movedPairs: providerResult?.exitCode === 0 ? [{ sourcePath: target.sourcePath, destinationPath: target.destinationPath }] : [],
    unparsedLineCount: lines.length,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitMoveOrRenameFileProviderResult): GitMoveOrRenameFileResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.moveOrRenameFile",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.moveOrRenameFile",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitMoveOrRenameFileDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(),
      unsafeSideEffects: true,
      movesTrackedFile: true,
      resultEnvelope: parseGitMoveOrRenameFileResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.moveOrRenameFile.dryRun" : "agentCore.basicTool.git.moveOrRenameFile.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          sourcePath: normalized.target.sourcePath,
          destinationPath: normalized.target.destinationPath,
          force: normalized.target.force,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.moveOrRenameFile.dryRun" : "basicTool.git.moveOrRenameFile.executed"],
  };
}

export function planGitMoveOrRenameFile(request: GitMoveOrRenameFileRequest = {}): GitMoveOrRenameFileResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitMoveOrRenameFile(request: GitMoveOrRenameFileRequest = {}): Promise<GitMoveOrRenameFileResult> {
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
      "git.moveOrRenameFile requires runtime.execEngine.git.runGit for real execution",
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
      "git.moveOrRenameFile provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
