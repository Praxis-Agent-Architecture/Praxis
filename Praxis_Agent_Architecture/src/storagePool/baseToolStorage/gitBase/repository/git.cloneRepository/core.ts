/*
 * git.cloneRepository storage core.
 * Owns the fixed git clone contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

import path from "node:path";

export type GitCloneRepositoryPermission = "git:read" | "filesystem:write";
export type GitCloneRepositoryRiskCategory = "remote-network" | "workspace-mutation";

export type GitCloneRepositoryGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitCloneRepositoryContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitCloneRepositoryGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitCloneRepositoryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitCloneRepositoryTarget = {
  repositoryPath: string;
  remoteUrl: string;
  destinationPath: string;
  branch?: string;
  depth?: number;
  singleBranch: boolean;
  bare: boolean;
  mirror: boolean;
};

export type GitCloneRepositoryRequest = {
  target?: Partial<GitCloneRepositoryTarget>;
  context?: GitCloneRepositoryContext;
  provider?: GitCloneRepositoryProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  workspaceRoot?: string;
  remoteUrl?: string;
  destinationPath?: string;
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  bare?: boolean;
  mirror?: boolean;
  dryRun?: boolean;
};

export type GitCloneRepositoryRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-clone-repository";
  allowedSubcommand: "clone";
};

export type GitCloneRepositoryRisk = {
  category: GitCloneRepositoryRiskCategory;
  riskLevel: "risky";
  mutatesRepository: true;
  mutatesWorkingTree: true;
  mayUseNetwork: true;
  createsRepositoryMetadata: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitCloneRepositoryEnvelope = {
  parser: "git-clone-output-v1";
  repositoryPath: string;
  remoteUrl: string;
  destinationPath: string;
  branch?: string;
  depth?: number;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  cloned: boolean;
};

export type GitCloneRepositoryOutput = {
  kind: "agentCore.basicTool.git.cloneRepository";
  target: GitCloneRepositoryTarget;
  runtimeEntry: GitCloneRepositoryRuntimeEntry;
  risk: GitCloneRepositoryRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitCloneRepositoryPermission[];
  unsafeSideEffects: true;
  mayUseNetwork: true;
  resultEnvelope: GitCloneRepositoryEnvelope;
};

export type GitCloneRepositoryPlan = {
  toolId: "git.cloneRepository";
  toolKind: "git.cloneRepository";
  capability: "clone-repository";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  remoteUrl: string;
  destinationPath: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitCloneRepositoryPermission[];
  runtimeEntry: GitCloneRepositoryRuntimeEntry;
  risk: GitCloneRepositoryRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: true;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-repository-network-runtime-guard";
    event: "basicTool.git.cloneRepository.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitCloneRepositoryErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitCloneRepositoryErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_REQUIRED_FIELD"
  | "MISSING_TARGET_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitCloneRepositoryError = {
  code: GitCloneRepositoryErrorCode;
  message: string;
  boundary: GitCloneRepositoryErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitCloneRepositoryAuditEvent = {
  type: string;
  toolId: "git.cloneRepository";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitCloneRepositoryResult =
  | {
      ok: true;
      toolId: "git.cloneRepository";
      output: GitCloneRepositoryOutput;
      plan: GitCloneRepositoryPlan;
      audit: readonly GitCloneRepositoryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.cloneRepository";
      error: GitCloneRepositoryError;
      audit: readonly GitCloneRepositoryAuditEvent[];
      events: readonly string[];
    };

export type GitCloneRepositoryProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitCloneRepositoryProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitCloneRepositoryProvider = (
  request: GitCloneRepositoryProviderRequest,
  context: GitCloneRepositoryContext,
) => GitCloneRepositoryProviderResult | Promise<GitCloneRepositoryProviderResult>;

type NormalizedRequest = { target: GitCloneRepositoryTarget; context: GitCloneRepositoryContext; timeoutMs?: number };

export const gitCloneRepositoryDescriptor = {
  toolId: "git.cloneRepository",
  toolKind: "git.cloneRepository",
  capability: "clone-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "remote-network-workspace-mutation",
  permissionsRequired: ["git:read", "filesystem:write"],
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 900_000,
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

function dryRunEnabled(context: GitCloneRepositoryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitCloneRepositoryContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.cloneRepository:dry-run";
}

function runtimeId(context: GitCloneRepositoryContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitCloneRepositoryContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitCloneRepositoryAuditEvent {
  return {
    type,
    toolId: gitCloneRepositoryDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitCloneRepositoryErrorCode,
  message: string,
  boundary: GitCloneRepositoryErrorBoundary,
  context: GitCloneRepositoryContext | undefined,
  repositoryPath?: string,
): GitCloneRepositoryResult {
  return {
    ok: false,
    toolId: gitCloneRepositoryDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.cloneRepository.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.cloneRepository.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitCloneRepositoryContext | GitCloneRepositoryResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.cloneRepository context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.cloneRepository context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.cloneRepository context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.cloneRepository context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.cloneRepository context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitCloneRepositoryPermission[] | undefined,
    auditMetadata,
  };
}

function safeString(value: unknown, field: string, code: GitCloneRepositoryErrorCode, context: GitCloneRepositoryContext | undefined): string | GitCloneRepositoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure(code, `git.cloneRepository requires ${field}`, "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", `git.cloneRepository ${field} cannot contain NUL bytes`, "input", context, normalized);
  return normalized;
}

function safeRef(value: unknown, field: string, context: GitCloneRepositoryContext, repositoryPath: string): string | undefined | GitCloneRepositoryResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("INVALID_ARGUMENT", `git.cloneRepository ${field} cannot be blank when provided`, "input", context, repositoryPath);
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.cloneRepository ${field} must be a safe ref`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeDepth(value: unknown, context: GitCloneRepositoryContext, repositoryPath: string): number | undefined | GitCloneRepositoryResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return failure("INVALID_ARGUMENT", "git.cloneRepository target.depth must be a positive integer", "input", context, repositoryPath);
  }
  return value;
}

function normalizeTimeout(value: unknown, context: GitCloneRepositoryContext, repositoryPath: string): number | undefined | GitCloneRepositoryResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitCloneRepositoryDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.cloneRepository timeoutMs must be an integer from 1 to ${gitCloneRepositoryDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitCloneRepositoryResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.cloneRepository request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.cloneRepository target must be an object", "input", context);
  }
  const remoteUrl = safeString(targetRecord.remoteUrl, "target.remoteUrl", "MISSING_REQUIRED_FIELD", context);
  if (typeof remoteUrl !== "string") return remoteUrl;
  const destinationPath = safeString(targetRecord.destinationPath, "target.destinationPath", "MISSING_TARGET_PATH", context);
  if (typeof destinationPath !== "string") return destinationPath;
  const repositoryPath =
    stringValue(targetRecord.repositoryPath)?.trim() ||
    stringValue(requestRecord.repositoryPath)?.trim() ||
    stringValue(requestRecord.cwd)?.trim() ||
    stringValue(requestRecord.workspaceRoot)?.trim() ||
    path.dirname(destinationPath);
  if (repositoryPath.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.cloneRepository requires a repositoryPath runtime working directory", "input", context, destinationPath);
  }
  if (repositoryPath.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.cloneRepository repositoryPath cannot contain NUL bytes", "input", context, repositoryPath);
  }
  const branch = safeRef(targetRecord.branch, "target.branch", context, repositoryPath);
  if (branch !== undefined && typeof branch !== "string") return branch;
  const depth = normalizeDepth(targetRecord.depth, context, repositoryPath);
  if (depth !== undefined && typeof depth !== "number") return depth;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      remoteUrl,
      destinationPath,
      branch,
      depth,
      singleBranch: booleanValue(targetRecord.singleBranch) ?? false,
      bare: booleanValue(targetRecord.bare) ?? false,
      mirror: booleanValue(targetRecord.mirror) ?? false,
    },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function pathAllowed(targetPath: string, roots: readonly string[]): boolean {
  return roots.some((root) => targetPath === root || targetPath.startsWith(`${root}/`));
}

function ensureScope(target: GitCloneRepositoryTarget, context: GitCloneRepositoryContext | undefined): GitCloneRepositoryResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  if (!pathAllowed(target.repositoryPath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.cloneRepository runtime working directory is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  if (!pathAllowed(target.destinationPath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.cloneRepository destinationPath is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  return undefined;
}

function permissionsForTarget(_target: GitCloneRepositoryTarget): readonly GitCloneRepositoryPermission[] {
  return gitCloneRepositoryDescriptor.permissionsRequired;
}

function ensurePermissions(target: GitCloneRepositoryTarget, context: GitCloneRepositoryContext | undefined): GitCloneRepositoryResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.cloneRepository is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitCloneRepositoryTarget, context: GitCloneRepositoryContext): GitCloneRepositoryResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.cloneRepository requires an affirmative runtime guard for real clone",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitCloneRepositoryTarget): readonly string[] {
  return [
    "clone",
    ...(target.branch === undefined ? [] : ["--branch", target.branch]),
    ...(target.depth === undefined ? [] : ["--depth", String(target.depth)]),
    ...(target.singleBranch ? ["--single-branch"] : []),
    ...(target.bare ? ["--bare"] : []),
    ...(target.mirror ? ["--mirror"] : []),
    target.remoteUrl,
    target.destinationPath,
  ];
}

function commandPreview(target: GitCloneRepositoryTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitCloneRepositoryRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-clone-repository",
  allowedSubcommand: "clone",
};

function riskForTarget(_target: GitCloneRepositoryTarget): GitCloneRepositoryRisk {
  return {
    category: "remote-network",
    riskLevel: "risky",
    mutatesRepository: true,
    mutatesWorkingTree: true,
    mayUseNetwork: true,
    createsRepositoryMetadata: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitCloneRepositoryPlan["dispatch"], dryRun: boolean): GitCloneRepositoryPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.cloneRepository",
    toolKind: "git.cloneRepository",
    capability: "clone-repository",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    remoteUrl: normalized.target.remoteUrl,
    destinationPath: normalized.target.destinationPath,
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
      guard: "git-repository-network-runtime-guard",
      event: "basicTool.git.cloneRepository.planned",
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

export function parseGitCloneRepositoryResult(
  providerResult: GitCloneRepositoryProviderResult | undefined,
  target: GitCloneRepositoryTarget,
): GitCloneRepositoryEnvelope {
  return {
    parser: "git-clone-output-v1",
    repositoryPath: target.repositoryPath,
    remoteUrl: target.remoteUrl,
    destinationPath: target.destinationPath,
    branch: target.branch,
    depth: target.depth,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    cloned: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitCloneRepositoryProviderResult): GitCloneRepositoryResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.cloneRepository",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.cloneRepository",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitCloneRepositoryDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      mayUseNetwork: true,
      resultEnvelope: parseGitCloneRepositoryResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.cloneRepository.dryRun" : "agentCore.basicTool.git.cloneRepository.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { destinationPath: normalized.target.destinationPath, branch: normalized.target.branch, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.cloneRepository.dryRun" : "basicTool.git.cloneRepository.executed"],
  };
}

export function planGitRepositoryClone(request: GitCloneRepositoryRequest = {}): GitCloneRepositoryResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitCloneRepository = planGitRepositoryClone;

export async function executeGitCloneRepository(request: GitCloneRepositoryRequest = {}): Promise<GitCloneRepositoryResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return success(normalized, true);
  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.cloneRepository requires runtime.execEngine.git.runGit for real execution",
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
      "git.cloneRepository provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
