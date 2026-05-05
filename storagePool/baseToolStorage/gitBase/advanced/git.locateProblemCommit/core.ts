/*
 * git.locateProblemCommit storage core.
 * Owns the fixed read-only candidate search contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitLocateProblemCommitPermission = "git:read" | "filesystem:read";
export type GitLocateProblemCommitRiskCategory = "read-only-inspection";

export type GitLocateProblemCommitGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitLocateProblemCommitContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitLocateProblemCommitGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitLocateProblemCommitPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitLocateProblemCommitTarget = {
  repositoryPath: string;
  knownGoodRef: string;
  knownBadRef: string;
  verificationCommand?: string;
  maxSteps: number;
};

export type GitLocateProblemCommitRequest = {
  target?: Partial<GitLocateProblemCommitTarget>;
  context?: GitLocateProblemCommitContext;
  provider?: GitLocateProblemCommitProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  knownGoodRef?: string;
  knownBadRef?: string;
  goodRef?: string;
  badRef?: string;
  verificationCommand?: string;
  maxSteps?: number;
  dryRun?: boolean;
};

export type GitLocateProblemCommitRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-locate-problem-commit";
  allowedSubcommand: "rev-list";
};

export type GitLocateProblemCommitRisk = {
  category: GitLocateProblemCommitRiskCategory;
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  mutatesFilesystem: false;
  mutatesGitMetadata: false;
  mayUseNetwork: false;
  spawnsProcess: true;
  requiresTapApproval: false;
  runtimeOwnsExecution: true;
};

export type GitLocateProblemCommitCandidate = {
  raw: string;
  commit?: string;
  distance?: number;
};

export type GitLocateProblemCommitEnvelope = {
  parser: "git-rev-list-bisect-output-v1";
  knownGoodRef: string;
  knownBadRef: string;
  verificationCommand?: string;
  verificationCommandExecuted: false;
  maxSteps: number;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  candidateCount: number;
  bestCandidate?: string;
  located: boolean;
  candidates: readonly GitLocateProblemCommitCandidate[];
};

export type GitLocateProblemCommitOutput = {
  kind: "agentCore.basicTool.git.locateProblemCommit";
  target: GitLocateProblemCommitTarget;
  runtimeEntry: GitLocateProblemCommitRuntimeEntry;
  risk: GitLocateProblemCommitRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitLocateProblemCommitPermission[];
  unsafeSideEffects: false;
  wouldRunGitBisect: false;
  wouldExecuteVerificationCommand: false;
  verificationCommandExecuted: false;
  resultEnvelope: GitLocateProblemCommitEnvelope;
};

export type GitLocateProblemCommitPlan = {
  toolId: "git.locateProblemCommit";
  toolKind: "git.locateProblemCommit";
  capability: "locate-problem-commit";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  knownGoodRef: string;
  knownBadRef: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitLocateProblemCommitPermission[];
  runtimeEntry: GitLocateProblemCommitRuntimeEntry;
  risk: GitLocateProblemCommitRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  strategy: "rev-list-bisect-candidate-read";
  wouldRunGitBisect: false;
  wouldExecuteVerificationCommand: false;
  unsafeSideEffects: false;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-locate-problem-commit-runtime-guard";
    event: "basicTool.git.locateProblemCommit.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitLocateProblemCommitErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitLocateProblemCommitErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_KNOWN_GOOD_REF"
  | "MISSING_KNOWN_BAD_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "INVALID_MAX_STEPS"
  | "REFS_MUST_DIFFER"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitLocateProblemCommitError = {
  code: GitLocateProblemCommitErrorCode;
  message: string;
  boundary: GitLocateProblemCommitErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitLocateProblemCommitAuditEvent = {
  type: string;
  toolId: "git.locateProblemCommit";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitLocateProblemCommitResult =
  | {
      ok: true;
      toolId: "git.locateProblemCommit";
      output: GitLocateProblemCommitOutput;
      plan: GitLocateProblemCommitPlan;
      audit: readonly GitLocateProblemCommitAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.locateProblemCommit";
      error: GitLocateProblemCommitError;
      audit: readonly GitLocateProblemCommitAuditEvent[];
      events: readonly string[];
    };

export type GitLocateProblemCommitProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitLocateProblemCommitProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitLocateProblemCommitProvider = (
  request: GitLocateProblemCommitProviderRequest,
  context: GitLocateProblemCommitContext,
) => GitLocateProblemCommitProviderResult | Promise<GitLocateProblemCommitProviderResult>;

type NormalizedRequest = { target: GitLocateProblemCommitTarget; context: GitLocateProblemCommitContext; timeoutMs?: number };

export const gitLocateProblemCommitDescriptor = {
  toolId: "git.locateProblemCommit",
  toolKind: "git.locateProblemCommit",
  capability: "locate-problem-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: false,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-bisect-candidate-search",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultMaxSteps: 64,
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 900_000,
  unsafeSideEffects: false,
} as const;

export const locateProblemCommitDescriptor = gitLocateProblemCommitDescriptor;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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

function dryRunEnabled(context: GitLocateProblemCommitContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitLocateProblemCommitContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.locateProblemCommit:dry-run";
}

function runtimeId(context: GitLocateProblemCommitContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitLocateProblemCommitContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitLocateProblemCommitAuditEvent {
  return {
    type,
    toolId: gitLocateProblemCommitDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitLocateProblemCommitErrorCode,
  message: string,
  boundary: GitLocateProblemCommitErrorBoundary,
  context: GitLocateProblemCommitContext | undefined,
  repositoryPath?: string,
): GitLocateProblemCommitResult {
  return {
    ok: false,
    toolId: gitLocateProblemCommitDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.locateProblemCommit.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.locateProblemCommit.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitLocateProblemCommitContext | GitLocateProblemCommitResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.locateProblemCommit context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.locateProblemCommit context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.locateProblemCommit context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.locateProblemCommit context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.locateProblemCommit context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitLocateProblemCommitPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitLocateProblemCommitContext | undefined): string | GitLocateProblemCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.locateProblemCommit requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.locateProblemCommit repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function normalizeSafeRef(
  value: unknown,
  missingCode: "MISSING_KNOWN_GOOD_REF" | "MISSING_KNOWN_BAD_REF",
  field: string,
  context: GitLocateProblemCommitContext,
  repositoryPath?: string,
): string | GitLocateProblemCommitResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(missingCode, `git.locateProblemCommit requires target.${field}`, "input", context, repositoryPath);
  }
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.locateProblemCommit target.${field} must be a safe git ref string`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeVerificationCommand(
  value: unknown,
  context: GitLocateProblemCommitContext,
  repositoryPath: string,
): string | undefined | GitLocateProblemCommitResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || normalized.length > 4096) {
    return failure(
      "INVALID_ARGUMENT",
      "git.locateProblemCommit verificationCommand must be a public-safe preview string without NUL bytes",
      "input",
      context,
      repositoryPath,
    );
  }
  return normalized;
}

function normalizeMaxSteps(value: unknown, context: GitLocateProblemCommitContext, repositoryPath: string): number | GitLocateProblemCommitResult {
  const maxSteps = numberValue(value) ?? gitLocateProblemCommitDescriptor.defaultMaxSteps;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1024) {
    return failure("INVALID_MAX_STEPS", "git.locateProblemCommit maxSteps must be an integer between 1 and 1024", "input", context, repositoryPath);
  }
  return maxSteps;
}

function normalizeTimeout(value: unknown, context: GitLocateProblemCommitContext, repositoryPath: string): number | undefined | GitLocateProblemCommitResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitLocateProblemCommitDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.locateProblemCommit timeoutMs must be an integer from 1 to ${gitLocateProblemCommitDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitLocateProblemCommitResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.locateProblemCommit request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.locateProblemCommit target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const knownGoodRef = normalizeSafeRef(
    targetRecord.knownGoodRef ?? targetRecord.goodRef ?? requestRecord.knownGoodRef ?? requestRecord.goodRef,
    "MISSING_KNOWN_GOOD_REF",
    "knownGoodRef",
    context,
    repositoryPath,
  );
  if (typeof knownGoodRef !== "string") return knownGoodRef;
  const knownBadRef = normalizeSafeRef(
    targetRecord.knownBadRef ?? targetRecord.badRef ?? requestRecord.knownBadRef ?? requestRecord.badRef,
    "MISSING_KNOWN_BAD_REF",
    "knownBadRef",
    context,
    repositoryPath,
  );
  if (typeof knownBadRef !== "string") return knownBadRef;
  if (knownGoodRef === knownBadRef) {
    return failure("REFS_MUST_DIFFER", "git.locateProblemCommit knownGoodRef and knownBadRef must differ", "input", context, repositoryPath);
  }
  const verificationCommand = normalizeVerificationCommand(
    targetRecord.verificationCommand ?? requestRecord.verificationCommand,
    context,
    repositoryPath,
  );
  if (verificationCommand !== undefined && typeof verificationCommand !== "string") return verificationCommand;
  const maxSteps = normalizeMaxSteps(targetRecord.maxSteps ?? requestRecord.maxSteps, context, repositoryPath);
  if (typeof maxSteps !== "number") return maxSteps;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: { repositoryPath, knownGoodRef, knownBadRef, verificationCommand, maxSteps },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitLocateProblemCommitContext | undefined): GitLocateProblemCommitResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure(
        "SCOPE_REJECTED",
        "git.locateProblemCommit target repository is outside the allowed repository roots",
        "scope",
        context,
        repositoryPath,
      );
}

function permissionsForTarget(_target: GitLocateProblemCommitTarget): readonly GitLocateProblemCommitPermission[] {
  return ["git:read", "filesystem:read"];
}

function ensurePermissions(target: GitLocateProblemCommitTarget, context: GitLocateProblemCommitContext | undefined): GitLocateProblemCommitResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.locateProblemCommit is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitLocateProblemCommitTarget, context: GitLocateProblemCommitContext): GitLocateProblemCommitResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.locateProblemCommit requires an affirmative runtime guard for real runtime execution",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitLocateProblemCommitTarget): readonly string[] {
  return ["rev-list", "--bisect-all", `${target.knownGoodRef}..${target.knownBadRef}`];
}

function commandPreview(target: GitLocateProblemCommitTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitLocateProblemCommitRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-locate-problem-commit",
  allowedSubcommand: "rev-list",
};

const risk: GitLocateProblemCommitRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  mutatesFilesystem: false,
  mutatesGitMetadata: false,
  mayUseNetwork: false,
  spawnsProcess: true,
  requiresTapApproval: false,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitLocateProblemCommitPlan["dispatch"], dryRun: boolean): GitLocateProblemCommitPlan {
  return {
    toolId: "git.locateProblemCommit",
    toolKind: "git.locateProblemCommit",
    capability: "locate-problem-commit",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    knownGoodRef: normalized.target.knownGoodRef,
    knownBadRef: normalized.target.knownBadRef,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    strategy: "rev-list-bisect-candidate-read",
    wouldRunGitBisect: false,
    wouldExecuteVerificationCommand: false,
    unsafeSideEffects: false,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-locate-problem-commit-runtime-guard",
      event: "basicTool.git.locateProblemCommit.planned",
      governanceRequired: !dryRun,
      tapCanWrap: true,
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).filter((line) => line.length > 0).length;
}

function parseCandidateLine(line: string): GitLocateProblemCommitCandidate | undefined {
  const raw = line.trim();
  if (raw.length === 0) return undefined;
  const match = raw.match(/^([0-9a-fA-F]{7,64})(?:\s+\(dist=(\d+)\))?/u);
  if (match === null) return { raw };
  return {
    raw,
    commit: match[1],
    distance: match[2] === undefined ? undefined : Number(match[2]),
  };
}

export function parseGitLocateProblemCommitResult(
  providerResult: GitLocateProblemCommitProviderResult | undefined,
  target: GitLocateProblemCommitTarget,
): GitLocateProblemCommitEnvelope {
  const candidates = (providerResult?.stdout ?? "")
    .split(/\r?\n/u)
    .map(parseCandidateLine)
    .filter((entry): entry is GitLocateProblemCommitCandidate => entry !== undefined)
    .slice(0, target.maxSteps);
  const bestCandidate = candidates.find((candidate) => candidate.commit !== undefined)?.commit;
  return {
    parser: "git-rev-list-bisect-output-v1",
    knownGoodRef: target.knownGoodRef,
    knownBadRef: target.knownBadRef,
    verificationCommand: target.verificationCommand,
    verificationCommandExecuted: false,
    maxSteps: target.maxSteps,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    candidateCount: candidates.length,
    bestCandidate,
    located: providerResult?.exitCode === 0 && bestCandidate !== undefined,
    candidates,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitLocateProblemCommitProviderResult): GitLocateProblemCommitResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.locateProblemCommit",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.locateProblemCommit",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitLocateProblemCommitDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: false,
      wouldRunGitBisect: false,
      wouldExecuteVerificationCommand: false,
      verificationCommandExecuted: false,
      resultEnvelope: parseGitLocateProblemCommitResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.locateProblemCommit.dryRun" : "agentCore.basicTool.git.locateProblemCommit.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          knownGoodRef: normalized.target.knownGoodRef,
          knownBadRef: normalized.target.knownBadRef,
          exitCode: providerResult?.exitCode,
          verificationCommandExecuted: false,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.locateProblemCommit.dryRun" : "basicTool.git.locateProblemCommit.executed"],
  };
}

export function planLocateProblemCommit(request: GitLocateProblemCommitRequest = {}): GitLocateProblemCommitResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitLocateProblemCommit = planLocateProblemCommit;

export async function executeGitLocateProblemCommit(request: GitLocateProblemCommitRequest = {}): Promise<GitLocateProblemCommitResult> {
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
      "git.locateProblemCommit requires runtime.execEngine.git.runGit for real execution",
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
      "git.locateProblemCommit provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
