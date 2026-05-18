/*
 * git.amendLastCommit storage core.
 * Owns the fixed git commit --amend contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitAmendLastCommitPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitAmendLastCommitRiskCategory = "history-mutation";

export type GitAmendLastCommitGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitAmendLastCommitContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitAmendLastCommitGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitAmendLastCommitPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitAmendLastCommitTarget = {
  repositoryPath: string;
  commitMessage?: string;
  noEdit: boolean;
  includeAllTracked: boolean;
  resetAuthor: boolean;
};

export type GitAmendLastCommitRequest = {
  target?: Partial<GitAmendLastCommitTarget>;
  context?: GitAmendLastCommitContext;
  provider?: GitAmendLastCommitProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  commitMessage?: string;
  message?: string;
  noEdit?: boolean;
  includeAllTracked?: boolean;
  all?: boolean;
  resetAuthor?: boolean;
  dryRun?: boolean;
};

export type GitAmendLastCommitRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-amend-last-commit";
  allowedSubcommand: "commit";
};

export type GitAmendLastCommitRisk = {
  category: GitAmendLastCommitRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: false;
  mutatesIndex: true;
  amendsCommit: true;
  rewritesHistory: true;
  mayStageTrackedChanges: boolean;
  mayResetAuthor: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitAmendLastCommitEnvelope = {
  parser: "git-amend-output-v1";
  commitMessage?: string;
  noEdit: boolean;
  includeAllTracked: boolean;
  resetAuthor: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  branchName?: string;
  commitHash?: string;
  subject?: string;
  filesChanged?: number;
  commitAmended: boolean;
};

export type GitAmendLastCommitOutput = {
  kind: "agentCore.basicTool.git.amendLastCommit";
  target: GitAmendLastCommitTarget;
  runtimeEntry: GitAmendLastCommitRuntimeEntry;
  risk: GitAmendLastCommitRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitAmendLastCommitPermission[];
  unsafeSideEffects: true;
  amendsCommit: true;
  rewritesHistory: true;
  resultEnvelope: GitAmendLastCommitEnvelope;
};

export type GitAmendLastCommitPlan = {
  toolId: "git.amendLastCommit";
  toolKind: "git.amendLastCommit";
  capability: "amend-last-commit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  commitMessage?: string;
  noEdit: boolean;
  includeAllTracked: boolean;
  resetAuthor: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitAmendLastCommitPermission[];
  runtimeEntry: GitAmendLastCommitRuntimeEntry;
  risk: GitAmendLastCommitRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-commit-runtime-guard";
    event: "basicTool.git.amendLastCommit.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitAmendLastCommitErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitAmendLastCommitErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitAmendLastCommitError = {
  code: GitAmendLastCommitErrorCode;
  message: string;
  boundary: GitAmendLastCommitErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitAmendLastCommitAuditEvent = {
  type: string;
  toolId: "git.amendLastCommit";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitAmendLastCommitResult =
  | {
      ok: true;
      toolId: "git.amendLastCommit";
      output: GitAmendLastCommitOutput;
      plan: GitAmendLastCommitPlan;
      audit: readonly GitAmendLastCommitAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.amendLastCommit";
      error: GitAmendLastCommitError;
      audit: readonly GitAmendLastCommitAuditEvent[];
      events: readonly string[];
    };

export type GitAmendLastCommitProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitAmendLastCommitProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitAmendLastCommitProvider = (
  request: GitAmendLastCommitProviderRequest,
  context: GitAmendLastCommitContext,
) => GitAmendLastCommitProviderResult | Promise<GitAmendLastCommitProviderResult>;

type NormalizedRequest = {
  target: GitAmendLastCommitTarget;
  context: GitAmendLastCommitContext;
  timeoutMs?: number;
};

export const gitAmendLastCommitDescriptor = {
  toolId: "git.amendLastCommit",
  toolKind: "git.amendLastCommit",
  capability: "amend-last-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.commit",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "history-mutation",
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

function dryRunEnabled(context: GitAmendLastCommitContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitAmendLastCommitContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.amendLastCommit:dry-run";
}

function runtimeId(context: GitAmendLastCommitContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitAmendLastCommitContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitAmendLastCommitAuditEvent {
  return {
    type,
    toolId: gitAmendLastCommitDescriptor.toolId,
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
  code: GitAmendLastCommitErrorCode,
  message: string,
  boundary: GitAmendLastCommitErrorBoundary,
  context: GitAmendLastCommitContext | undefined,
  repositoryPath?: string,
): GitAmendLastCommitResult {
  return {
    ok: false,
    toolId: gitAmendLastCommitDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.amendLastCommit.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.amendLastCommit.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitAmendLastCommitContext | GitAmendLastCommitResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.amendLastCommit context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.amendLastCommit context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.amendLastCommit context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.amendLastCommit context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.amendLastCommit context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitAmendLastCommitPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitAmendLastCommitContext | undefined): string | GitAmendLastCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.amendLastCommit requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.amendLastCommit repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeCommitMessage(
  value: unknown,
  noEdit: boolean,
  context: GitAmendLastCommitContext,
  repositoryPath: string,
): string | undefined | GitAmendLastCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return noEdit
      ? undefined
      : failure(
          "MISSING_REQUIRED_FIELD",
          "git.amendLastCommit requires target.commitMessage unless target.noEdit is true",
          "input",
          context,
          repositoryPath,
        );
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.amendLastCommit target.commitMessage cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitAmendLastCommitContext,
  repositoryPath: string,
): number | undefined | GitAmendLastCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitAmendLastCommitDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.amendLastCommit timeoutMs must be an integer from 1 to ${gitAmendLastCommitDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitAmendLastCommitResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.amendLastCommit request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.amendLastCommit target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const noEdit = booleanValue(targetRecord.noEdit) ?? false;
  const commitMessage = normalizeCommitMessage(targetRecord.commitMessage ?? targetRecord.message, noEdit, context, repositoryPath);
  if (commitMessage !== undefined && typeof commitMessage !== "string") return commitMessage;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      commitMessage,
      noEdit,
      includeAllTracked: booleanValue(targetRecord.includeAllTracked) ?? booleanValue(targetRecord.all) ?? false,
      resetAuthor: booleanValue(targetRecord.resetAuthor) ?? false,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitAmendLastCommitContext | undefined): GitAmendLastCommitResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.amendLastCommit target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(_target: GitAmendLastCommitTarget): readonly GitAmendLastCommitPermission[] {
  return gitAmendLastCommitDescriptor.permissionsRequired;
}

function ensurePermissions(target: GitAmendLastCommitTarget, context: GitAmendLastCommitContext | undefined): GitAmendLastCommitResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.amendLastCommit is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitAmendLastCommitTarget, context: GitAmendLastCommitContext): GitAmendLastCommitResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.amendLastCommit requires an affirmative runtime guard for real amend of the last commit",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitAmendLastCommitTarget): readonly string[] {
  return [
    "commit",
    "--amend",
    ...(target.includeAllTracked ? ["--all"] : []),
    ...(target.resetAuthor ? ["--reset-author"] : []),
    ...(target.noEdit ? ["--no-edit"] : ["-m", target.commitMessage ?? ""]),
  ];
}

function commandPreview(target: GitAmendLastCommitTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitAmendLastCommitRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-amend-last-commit",
  allowedSubcommand: "commit",
};

function riskForTarget(target: GitAmendLastCommitTarget): GitAmendLastCommitRisk {
  return {
    category: "history-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: false,
    mutatesIndex: true,
    amendsCommit: true,
    rewritesHistory: true,
    mayStageTrackedChanges: target.includeAllTracked,
    mayResetAuthor: target.resetAuthor,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitAmendLastCommitPlan["dispatch"], dryRun: boolean): GitAmendLastCommitPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.amendLastCommit",
    toolKind: "git.amendLastCommit",
    capability: "amend-last-commit",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    commitMessage: normalized.target.commitMessage,
    noEdit: normalized.target.noEdit,
    includeAllTracked: normalized.target.includeAllTracked,
    resetAuthor: normalized.target.resetAuthor,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: true,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-commit-runtime-guard",
      event: "basicTool.git.amendLastCommit.planned",
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

function firstOutputLine(stdout: string, stderr: string): string | undefined {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
}

function parseCommitSummaryLine(line: string | undefined): {
  branchName?: string;
  commitHash?: string;
  subject?: string;
} {
  if (line === undefined) return {};
  const match = line.match(/^\[([^\s\]]+)\s+([0-9a-fA-F]+)\]\s*(.*)$/u);
  if (match === null) return {};
  return {
    branchName: match[1],
    commitHash: match[2],
    subject: match[3]?.trim() || undefined,
  };
}

function parseFilesChanged(stdout: string): number | undefined {
  const match = stdout.match(/^\s*(\d+)\s+files?\s+changed\b/mu);
  if (match === null) return undefined;
  return Number.parseInt(match[1], 10);
}

export function parseGitAmendLastCommitResult(
  providerResult: GitAmendLastCommitProviderResult | undefined,
  target: GitAmendLastCommitTarget,
): GitAmendLastCommitEnvelope {
  const hint = providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr);
  const parsedSummary = parseCommitSummaryLine(hint);
  return {
    parser: "git-amend-output-v1",
    commitMessage: target.commitMessage,
    noEdit: target.noEdit,
    includeAllTracked: target.includeAllTracked,
    resetAuthor: target.resetAuthor,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: hint,
    branchName: parsedSummary.branchName,
    commitHash: parsedSummary.commitHash,
    subject: parsedSummary.subject,
    filesChanged: providerResult === undefined ? undefined : parseFilesChanged(providerResult.stdout),
    commitAmended: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitAmendLastCommitProviderResult): GitAmendLastCommitResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.amendLastCommit",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.amendLastCommit",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitAmendLastCommitDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      amendsCommit: true,
      rewritesHistory: true,
      resultEnvelope: parseGitAmendLastCommitResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.amendLastCommit.dryRun" : "agentCore.basicTool.git.amendLastCommit.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          includeAllTracked: normalized.target.includeAllTracked,
          noEdit: normalized.target.noEdit,
          resetAuthor: normalized.target.resetAuthor,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.amendLastCommit.dryRun" : "basicTool.git.amendLastCommit.executed"],
  };
}

export function planGitLastCommitAmend(request: GitAmendLastCommitRequest = {}): GitAmendLastCommitResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitAmendLastCommit = planGitLastCommitAmend;

export async function executeGitAmendLastCommit(request: GitAmendLastCommitRequest = {}): Promise<GitAmendLastCommitResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.amendLastCommit requires runtime.execEngine.git.runGit for real execution",
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
      "git.amendLastCommit provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
