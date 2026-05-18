/*
 * git.createCommit storage core.
 * Owns the fixed git-commit contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitCreateCommitPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitCreateCommitRiskCategory = "history-mutation";

export type GitCreateCommitGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitCreateCommitContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitCreateCommitGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitCreateCommitPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitCreateCommitTarget = {
  repositoryPath: string;
  commitMessage: string;
  includeAllTracked: boolean;
  allowEmpty: boolean;
  signoff: boolean;
};

export type GitCreateCommitRequest = {
  target?: Partial<GitCreateCommitTarget>;
  context?: GitCreateCommitContext;
  provider?: GitCreateCommitProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  commitMessage?: string;
  message?: string;
  includeAllTracked?: boolean;
  all?: boolean;
  allowEmpty?: boolean;
  signoff?: boolean;
  dryRun?: boolean;
};

export type GitCreateCommitRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-create-commit";
  allowedSubcommand: "commit";
};

export type GitCreateCommitRisk = {
  category: GitCreateCommitRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: false;
  mutatesIndex: true;
  createsCommit: true;
  mayStageTrackedChanges: boolean;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitCreateCommitEnvelope = {
  parser: "git-commit-output-v1";
  commitMessage: string;
  includeAllTracked: boolean;
  allowEmpty: boolean;
  signoff: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  branchName?: string;
  commitHash?: string;
  subject?: string;
  filesChanged?: number;
  commitCreated: boolean;
};

export type GitCreateCommitOutput = {
  kind: "agentCore.basicTool.git.createCommit";
  target: GitCreateCommitTarget;
  runtimeEntry: GitCreateCommitRuntimeEntry;
  risk: GitCreateCommitRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitCreateCommitPermission[];
  unsafeSideEffects: true;
  createsCommit: true;
  resultEnvelope: GitCreateCommitEnvelope;
};

export type GitCreateCommitPlan = {
  toolId: "git.createCommit";
  toolKind: "git.createCommit";
  capability: "create-commit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  commitMessage: string;
  includeAllTracked: boolean;
  allowEmpty: boolean;
  signoff: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitCreateCommitPermission[];
  runtimeEntry: GitCreateCommitRuntimeEntry;
  risk: GitCreateCommitRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-commit-runtime-guard";
    event: "basicTool.git.createCommit.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitCreateCommitErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitCreateCommitErrorCode =
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

export type GitCreateCommitError = {
  code: GitCreateCommitErrorCode;
  message: string;
  boundary: GitCreateCommitErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitCreateCommitAuditEvent = {
  type: string;
  toolId: "git.createCommit";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitCreateCommitResult =
  | {
      ok: true;
      toolId: "git.createCommit";
      output: GitCreateCommitOutput;
      plan: GitCreateCommitPlan;
      audit: readonly GitCreateCommitAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.createCommit";
      error: GitCreateCommitError;
      audit: readonly GitCreateCommitAuditEvent[];
      events: readonly string[];
    };

export type GitCreateCommitProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitCreateCommitProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitCreateCommitProvider = (
  request: GitCreateCommitProviderRequest,
  context: GitCreateCommitContext,
) => GitCreateCommitProviderResult | Promise<GitCreateCommitProviderResult>;

type NormalizedRequest = {
  target: GitCreateCommitTarget;
  context: GitCreateCommitContext;
  timeoutMs?: number;
};

export const gitCreateCommitDescriptor = {
  toolId: "git.createCommit",
  toolKind: "git.createCommit",
  capability: "create-commit",
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

function dryRunEnabled(context: GitCreateCommitContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitCreateCommitContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.createCommit:dry-run";
}

function runtimeId(context: GitCreateCommitContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitCreateCommitContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitCreateCommitAuditEvent {
  return {
    type,
    toolId: gitCreateCommitDescriptor.toolId,
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
  code: GitCreateCommitErrorCode,
  message: string,
  boundary: GitCreateCommitErrorBoundary,
  context: GitCreateCommitContext | undefined,
  repositoryPath?: string,
): GitCreateCommitResult {
  return {
    ok: false,
    toolId: gitCreateCommitDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.createCommit.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.createCommit.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitCreateCommitContext | GitCreateCommitResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.createCommit context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.createCommit context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.createCommit context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.createCommit context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.createCommit context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitCreateCommitPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitCreateCommitContext | undefined): string | GitCreateCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.createCommit requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.createCommit repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeCommitMessage(
  value: unknown,
  context: GitCreateCommitContext,
  repositoryPath: string,
): string | GitCreateCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REQUIRED_FIELD", "git.createCommit requires target.commitMessage", "input", context, repositoryPath);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.createCommit target.commitMessage cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitCreateCommitContext,
  repositoryPath: string,
): number | undefined | GitCreateCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitCreateCommitDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.createCommit timeoutMs must be an integer from 1 to ${gitCreateCommitDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitCreateCommitResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.createCommit request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.createCommit target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const commitMessage = normalizeCommitMessage(targetRecord.commitMessage ?? targetRecord.message, context, repositoryPath);
  if (typeof commitMessage !== "string") return commitMessage;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      commitMessage,
      includeAllTracked: booleanValue(targetRecord.includeAllTracked) ?? booleanValue(targetRecord.all) ?? false,
      allowEmpty: booleanValue(targetRecord.allowEmpty) ?? false,
      signoff: booleanValue(targetRecord.signoff) ?? false,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitCreateCommitContext | undefined): GitCreateCommitResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.createCommit target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(_target: GitCreateCommitTarget): readonly GitCreateCommitPermission[] {
  return gitCreateCommitDescriptor.permissionsRequired;
}

function ensurePermissions(target: GitCreateCommitTarget, context: GitCreateCommitContext | undefined): GitCreateCommitResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.createCommit is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitCreateCommitTarget, context: GitCreateCommitContext): GitCreateCommitResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.createCommit requires an affirmative runtime guard for real commit creation",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitCreateCommitTarget): readonly string[] {
  return [
    "commit",
    ...(target.includeAllTracked ? ["--all"] : []),
    ...(target.allowEmpty ? ["--allow-empty"] : []),
    ...(target.signoff ? ["--signoff"] : []),
    "-m",
    target.commitMessage,
  ];
}

function commandPreview(target: GitCreateCommitTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitCreateCommitRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-create-commit",
  allowedSubcommand: "commit",
};

function riskForTarget(target: GitCreateCommitTarget): GitCreateCommitRisk {
  return {
    category: "history-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: false,
    mutatesIndex: true,
    createsCommit: true,
    mayStageTrackedChanges: target.includeAllTracked,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitCreateCommitPlan["dispatch"], dryRun: boolean): GitCreateCommitPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.createCommit",
    toolKind: "git.createCommit",
    capability: "create-commit",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    commitMessage: normalized.target.commitMessage,
    includeAllTracked: normalized.target.includeAllTracked,
    allowEmpty: normalized.target.allowEmpty,
    signoff: normalized.target.signoff,
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
      event: "basicTool.git.createCommit.planned",
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

export function parseGitCreateCommitResult(
  providerResult: GitCreateCommitProviderResult | undefined,
  target: GitCreateCommitTarget,
): GitCreateCommitEnvelope {
  const hint = providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr);
  const parsedSummary = parseCommitSummaryLine(hint);
  return {
    parser: "git-commit-output-v1",
    commitMessage: target.commitMessage,
    includeAllTracked: target.includeAllTracked,
    allowEmpty: target.allowEmpty,
    signoff: target.signoff,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: hint,
    branchName: parsedSummary.branchName,
    commitHash: parsedSummary.commitHash,
    subject: parsedSummary.subject,
    filesChanged: providerResult === undefined ? undefined : parseFilesChanged(providerResult.stdout),
    commitCreated: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitCreateCommitProviderResult): GitCreateCommitResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.createCommit",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.createCommit",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitCreateCommitDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      createsCommit: true,
      resultEnvelope: parseGitCreateCommitResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.createCommit.dryRun" : "agentCore.basicTool.git.createCommit.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          includeAllTracked: normalized.target.includeAllTracked,
          allowEmpty: normalized.target.allowEmpty,
          signoff: normalized.target.signoff,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.createCommit.dryRun" : "basicTool.git.createCommit.executed"],
  };
}

export function planGitCommitCreation(request: GitCreateCommitRequest = {}): GitCreateCommitResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitCreateCommit = planGitCommitCreation;

export async function executeGitCreateCommit(request: GitCreateCommitRequest = {}): Promise<GitCreateCommitResult> {
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
      "git.createCommit requires runtime.execEngine.git.runGit for real execution",
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
      "git.createCommit provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
