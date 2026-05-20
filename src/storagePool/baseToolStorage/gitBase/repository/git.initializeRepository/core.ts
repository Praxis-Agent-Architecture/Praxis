/*
 * git.initializeRepository storage core.
 * Owns the fixed git init contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitInitializeRepositoryPermission = "git:write" | "filesystem:write";
export type GitInitializeRepositoryRiskCategory = "workspace-mutation";

export type GitInitializeRepositoryGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitInitializeRepositoryContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitInitializeRepositoryGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitInitializeRepositoryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitInitializeRepositoryTarget = {
  repositoryPath: string;
  initialBranch?: string;
  bare: boolean;
  separateGitDir?: string;
};

export type GitInitializeRepositoryRequest = {
  target?: Partial<GitInitializeRepositoryTarget>;
  context?: GitInitializeRepositoryContext;
  provider?: GitInitializeRepositoryProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  initialBranch?: string;
  bare?: boolean;
  separateGitDir?: string;
  dryRun?: boolean;
};

export type GitInitializeRepositoryRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-initialize-repository";
  allowedSubcommand: "init";
};

export type GitInitializeRepositoryRisk = {
  category: GitInitializeRepositoryRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  createsRepositoryMetadata: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitInitializeRepositoryEnvelope = {
  parser: "git-init-output-v1";
  repositoryPath: string;
  initialBranch?: string;
  bare: boolean;
  separateGitDir?: string;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  initialized: boolean;
};

export type GitInitializeRepositoryOutput = {
  kind: "agentCore.basicTool.git.initializeRepository";
  target: GitInitializeRepositoryTarget;
  runtimeEntry: GitInitializeRepositoryRuntimeEntry;
  risk: GitInitializeRepositoryRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitInitializeRepositoryPermission[];
  unsafeSideEffects: true;
  resultEnvelope: GitInitializeRepositoryEnvelope;
};

export type GitInitializeRepositoryPlan = {
  toolId: "git.initializeRepository";
  toolKind: "git.initializeRepository";
  capability: "initialize-repository";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  initialBranch?: string;
  bare: boolean;
  separateGitDir?: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitInitializeRepositoryPermission[];
  runtimeEntry: GitInitializeRepositoryRuntimeEntry;
  risk: GitInitializeRepositoryRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-repository-mutation-runtime-guard";
    event: "basicTool.git.initializeRepository.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitInitializeRepositoryErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitInitializeRepositoryErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitInitializeRepositoryError = {
  code: GitInitializeRepositoryErrorCode;
  message: string;
  boundary: GitInitializeRepositoryErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitInitializeRepositoryAuditEvent = {
  type: string;
  toolId: "git.initializeRepository";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitInitializeRepositoryResult =
  | {
      ok: true;
      toolId: "git.initializeRepository";
      output: GitInitializeRepositoryOutput;
      plan: GitInitializeRepositoryPlan;
      audit: readonly GitInitializeRepositoryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.initializeRepository";
      error: GitInitializeRepositoryError;
      audit: readonly GitInitializeRepositoryAuditEvent[];
      events: readonly string[];
    };

export type GitInitializeRepositoryProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitInitializeRepositoryProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitInitializeRepositoryProvider = (
  request: GitInitializeRepositoryProviderRequest,
  context: GitInitializeRepositoryContext,
) => GitInitializeRepositoryProviderResult | Promise<GitInitializeRepositoryProviderResult>;

type NormalizedRequest = { target: GitInitializeRepositoryTarget; context: GitInitializeRepositoryContext; timeoutMs?: number };

export const gitInitializeRepositoryDescriptor = {
  toolId: "git.initializeRepository",
  toolKind: "git.initializeRepository",
  capability: "initialize-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "workspace-mutation",
  permissionsRequired: ["git:write", "filesystem:write"],
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

function dryRunEnabled(context: GitInitializeRepositoryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitInitializeRepositoryContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.initializeRepository:dry-run";
}

function runtimeId(context: GitInitializeRepositoryContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitInitializeRepositoryContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitInitializeRepositoryAuditEvent {
  return {
    type,
    toolId: gitInitializeRepositoryDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitInitializeRepositoryErrorCode,
  message: string,
  boundary: GitInitializeRepositoryErrorBoundary,
  context: GitInitializeRepositoryContext | undefined,
  repositoryPath?: string,
): GitInitializeRepositoryResult {
  return {
    ok: false,
    toolId: gitInitializeRepositoryDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.initializeRepository.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.initializeRepository.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitInitializeRepositoryContext | GitInitializeRepositoryResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.initializeRepository context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.initializeRepository context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.initializeRepository context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.initializeRepository context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.initializeRepository context.auditMetadata must be an object", "input", undefined);
  }
  return {
    runtimeId: stringValue(contextRecord.runtimeId) ?? stringValue(legacyRequest.runtimeId),
    sessionId: stringValue(contextRecord.sessionId),
    invocationId: stringValue(contextRecord.invocationId) ?? stringValue(legacyRequest.invocationId),
    dryRun: booleanValue(contextRecord.dryRun) ?? booleanValue(legacyRequest.dryRun),
    guard:
      guard === undefined
        ? undefined
        : { allowed: booleanValue(guard.allowed), accepted: booleanValue(guard.accepted), reason: stringValue(guard.reason) },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitInitializeRepositoryPermission[] | undefined,
    auditMetadata,
  };
}

function safePath(value: unknown, field: string, context: GitInitializeRepositoryContext | undefined): string | undefined | GitInitializeRepositoryResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("INVALID_ARGUMENT", `git.initializeRepository ${field} cannot be blank when provided`, "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", `git.initializeRepository ${field} cannot contain NUL bytes`, "input", context, normalized);
  }
  return normalized;
}

function safeBranch(value: unknown, context: GitInitializeRepositoryContext, repositoryPath: string): string | undefined | GitInitializeRepositoryResult {
  const normalized = safePath(value, "target.initialBranch", context);
  if (normalized === undefined || typeof normalized !== "string") return normalized;
  if (/\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.initializeRepository target.initialBranch must be a safe branch name", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeRepositoryPath(value: unknown, context: GitInitializeRepositoryContext | undefined): string | GitInitializeRepositoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.initializeRepository requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.initializeRepository repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitInitializeRepositoryContext,
  repositoryPath: string,
): number | undefined | GitInitializeRepositoryResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitInitializeRepositoryDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.initializeRepository timeoutMs must be an integer from 1 to ${gitInitializeRepositoryDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitInitializeRepositoryResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.initializeRepository request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.initializeRepository target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const initialBranch = safeBranch(targetRecord.initialBranch, context, repositoryPath);
  if (initialBranch !== undefined && typeof initialBranch !== "string") return initialBranch;
  const separateGitDir = safePath(targetRecord.separateGitDir, "target.separateGitDir", context);
  if (separateGitDir !== undefined && typeof separateGitDir !== "string") return separateGitDir;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      initialBranch,
      bare: booleanValue(targetRecord.bare) ?? false,
      separateGitDir,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitInitializeRepositoryContext | undefined): GitInitializeRepositoryResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.initializeRepository target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(_target: GitInitializeRepositoryTarget): readonly GitInitializeRepositoryPermission[] {
  return gitInitializeRepositoryDescriptor.permissionsRequired;
}

function ensurePermissions(
  target: GitInitializeRepositoryTarget,
  context: GitInitializeRepositoryContext | undefined,
): GitInitializeRepositoryResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.initializeRepository is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitInitializeRepositoryTarget, context: GitInitializeRepositoryContext): GitInitializeRepositoryResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.initializeRepository requires an affirmative runtime guard for real repository initialization",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitInitializeRepositoryTarget): readonly string[] {
  return [
    "init",
    ...(target.initialBranch === undefined ? [] : ["--initial-branch", target.initialBranch]),
    ...(target.bare ? ["--bare"] : []),
    ...(target.separateGitDir === undefined ? [] : ["--separate-git-dir", target.separateGitDir]),
  ];
}

function commandPreview(target: GitInitializeRepositoryTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitInitializeRepositoryRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-initialize-repository",
  allowedSubcommand: "init",
};

function riskForTarget(_target: GitInitializeRepositoryTarget): GitInitializeRepositoryRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    createsRepositoryMetadata: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitInitializeRepositoryPlan["dispatch"], dryRun: boolean): GitInitializeRepositoryPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.initializeRepository",
    toolKind: "git.initializeRepository",
    capability: "initialize-repository",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    initialBranch: normalized.target.initialBranch,
    bare: normalized.target.bare,
    separateGitDir: normalized.target.separateGitDir,
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
      guard: "git-repository-mutation-runtime-guard",
      event: "basicTool.git.initializeRepository.planned",
      governanceRequired: true,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).filter((line) => line.length > 0).length;
}

function firstOutputLine(stdout: string, stderr: string): string | undefined {
  return `${stdout}\n${stderr}`.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
}

export function parseGitInitializeRepositoryResult(
  providerResult: GitInitializeRepositoryProviderResult | undefined,
  target: GitInitializeRepositoryTarget,
): GitInitializeRepositoryEnvelope {
  return {
    parser: "git-init-output-v1",
    repositoryPath: target.repositoryPath,
    initialBranch: target.initialBranch,
    bare: target.bare,
    separateGitDir: target.separateGitDir,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    initialized: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitInitializeRepositoryProviderResult): GitInitializeRepositoryResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.initializeRepository",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.initializeRepository",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitInitializeRepositoryDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      resultEnvelope: parseGitInitializeRepositoryResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.initializeRepository.dryRun" : "agentCore.basicTool.git.initializeRepository.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { initialBranch: normalized.target.initialBranch, bare: normalized.target.bare, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.initializeRepository.dryRun" : "basicTool.git.initializeRepository.executed"],
  };
}

export function planGitRepositoryInitialization(request: GitInitializeRepositoryRequest = {}): GitInitializeRepositoryResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitInitializeRepository = planGitRepositoryInitialization;

export async function executeGitInitializeRepository(request: GitInitializeRepositoryRequest = {}): Promise<GitInitializeRepositoryResult> {
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
      "git.initializeRepository requires runtime.execEngine.git.runGit for real execution",
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
    return failure(
      "PROVIDER_REJECTED",
      "git.initializeRepository provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
