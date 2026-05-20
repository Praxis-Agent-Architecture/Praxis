/*
 * git.archiveRepository storage core.
 * Owns the fixed git archive contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitArchiveRepositoryPermission = "git:read" | "filesystem:write";
export type GitArchiveRepositoryRiskCategory = "workspace-mutation";
export type GitArchiveFormat = "tar" | "zip";

export type GitArchiveRepositoryGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitArchiveRepositoryContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitArchiveRepositoryGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitArchiveRepositoryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitArchiveRepositoryTarget = {
  repositoryPath: string;
  outputPath: string;
  ref: string;
  format: GitArchiveFormat;
  pathspecs: readonly string[];
  prefix?: string;
};

export type GitArchiveRepositoryRequest = {
  target?: Partial<GitArchiveRepositoryTarget>;
  context?: GitArchiveRepositoryContext;
  provider?: GitArchiveRepositoryProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  outputPath?: string;
  ref?: string;
  format?: GitArchiveFormat;
  pathspecs?: readonly string[];
  prefix?: string;
  dryRun?: boolean;
};

export type GitArchiveRepositoryRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-archive-repository";
  allowedSubcommand: "archive";
};

export type GitArchiveRepositoryRisk = {
  category: GitArchiveRepositoryRiskCategory;
  riskLevel: "risky";
  mutatesRepository: false;
  mutatesWorkingTree: true;
  writesArchiveFile: true;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitArchiveRepositoryEnvelope = {
  parser: "git-archive-output-v1";
  repositoryPath: string;
  outputPath: string;
  ref: string;
  format: GitArchiveFormat;
  pathspecCount: number;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  archiveCreated: boolean;
};

export type GitArchiveRepositoryOutput = {
  kind: "agentCore.basicTool.git.archiveRepository";
  target: GitArchiveRepositoryTarget;
  runtimeEntry: GitArchiveRepositoryRuntimeEntry;
  risk: GitArchiveRepositoryRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitArchiveRepositoryPermission[];
  unsafeSideEffects: true;
  resultEnvelope: GitArchiveRepositoryEnvelope;
};

export type GitArchiveRepositoryPlan = {
  toolId: "git.archiveRepository";
  toolKind: "git.archiveRepository";
  capability: "archive-repository";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  outputPath: string;
  ref: string;
  format: GitArchiveFormat;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitArchiveRepositoryPermission[];
  runtimeEntry: GitArchiveRepositoryRuntimeEntry;
  risk: GitArchiveRepositoryRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: false;
  unsafeSideEffects: true;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-archive-runtime-guard";
    event: "basicTool.git.archiveRepository.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitArchiveRepositoryErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitArchiveRepositoryErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_TARGET_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitArchiveRepositoryError = {
  code: GitArchiveRepositoryErrorCode;
  message: string;
  boundary: GitArchiveRepositoryErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitArchiveRepositoryAuditEvent = {
  type: string;
  toolId: "git.archiveRepository";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitArchiveRepositoryResult =
  | {
      ok: true;
      toolId: "git.archiveRepository";
      output: GitArchiveRepositoryOutput;
      plan: GitArchiveRepositoryPlan;
      audit: readonly GitArchiveRepositoryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.archiveRepository";
      error: GitArchiveRepositoryError;
      audit: readonly GitArchiveRepositoryAuditEvent[];
      events: readonly string[];
    };

export type GitArchiveRepositoryProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitArchiveRepositoryProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitArchiveRepositoryProvider = (
  request: GitArchiveRepositoryProviderRequest,
  context: GitArchiveRepositoryContext,
) => GitArchiveRepositoryProviderResult | Promise<GitArchiveRepositoryProviderResult>;

type NormalizedRequest = { target: GitArchiveRepositoryTarget; context: GitArchiveRepositoryContext; timeoutMs?: number };

export const gitArchiveRepositoryDescriptor = {
  toolId: "git.archiveRepository",
  toolKind: "git.archiveRepository",
  capability: "archive-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "workspace-mutation",
  permissionsRequired: ["git:read", "filesystem:write"],
  defaultTimeoutMs: 60_000,
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

function dryRunEnabled(context: GitArchiveRepositoryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitArchiveRepositoryContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.archiveRepository:dry-run";
}

function runtimeId(context: GitArchiveRepositoryContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitArchiveRepositoryContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitArchiveRepositoryAuditEvent {
  return {
    type,
    toolId: gitArchiveRepositoryDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitArchiveRepositoryErrorCode,
  message: string,
  boundary: GitArchiveRepositoryErrorBoundary,
  context: GitArchiveRepositoryContext | undefined,
  repositoryPath?: string,
): GitArchiveRepositoryResult {
  return {
    ok: false,
    toolId: gitArchiveRepositoryDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.archiveRepository.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.archiveRepository.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitArchiveRepositoryContext | GitArchiveRepositoryResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.archiveRepository context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.archiveRepository context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.archiveRepository context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.archiveRepository context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.archiveRepository context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitArchiveRepositoryPermission[] | undefined,
    auditMetadata,
  };
}

function requiredPath(value: unknown, field: string, code: GitArchiveRepositoryErrorCode, context: GitArchiveRepositoryContext | undefined): string | GitArchiveRepositoryResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure(code, `git.archiveRepository requires ${field}`, "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", `git.archiveRepository ${field} cannot contain NUL bytes`, "input", context, normalized);
  return normalized;
}

function safeRef(value: unknown, context: GitArchiveRepositoryContext, repositoryPath: string): string | GitArchiveRepositoryResult {
  const normalized = stringValue(value)?.trim() || "HEAD";
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.archiveRepository target.ref must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeFormat(value: unknown): GitArchiveFormat {
  return value === "zip" ? "zip" : "tar";
}

function normalizePathspecs(value: unknown, context: GitArchiveRepositoryContext, repositoryPath: string): readonly string[] | GitArchiveRepositoryResult {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return failure("INVALID_ARGUMENT", "git.archiveRepository target.pathspecs must be a string array", "input", context, repositoryPath);
  }
  const normalized = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
  if (normalized.some((item) => item.includes("\0"))) {
    return failure("INVALID_ARGUMENT", "git.archiveRepository target.pathspecs cannot contain NUL bytes", "input", context, repositoryPath);
  }
  return normalized;
}

function safeOptionalPath(value: unknown, field: string, context: GitArchiveRepositoryContext, repositoryPath: string): string | undefined | GitArchiveRepositoryResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("INVALID_ARGUMENT", `git.archiveRepository ${field} cannot be blank when provided`, "input", context, repositoryPath);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", `git.archiveRepository ${field} cannot contain NUL bytes`, "input", context, repositoryPath);
  return normalized;
}

function normalizeTimeout(value: unknown, context: GitArchiveRepositoryContext, repositoryPath: string): number | undefined | GitArchiveRepositoryResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitArchiveRepositoryDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.archiveRepository timeoutMs must be an integer from 1 to ${gitArchiveRepositoryDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitArchiveRepositoryResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.archiveRepository request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.archiveRepository target must be an object", "input", context);
  }
  const repositoryPath = requiredPath(targetRecord.repositoryPath, "target.repositoryPath", "MISSING_REPOSITORY_PATH", context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const outputPath = requiredPath(targetRecord.outputPath, "target.outputPath", "MISSING_TARGET_PATH", context);
  if (typeof outputPath !== "string") return outputPath;
  const ref = safeRef(targetRecord.ref, context, repositoryPath);
  if (typeof ref !== "string") return ref;
  const pathspecs = normalizePathspecs(targetRecord.pathspecs, context, repositoryPath);
  if ("ok" in pathspecs) return pathspecs;
  const prefix = safeOptionalPath(targetRecord.prefix, "target.prefix", context, repositoryPath);
  if (prefix !== undefined && typeof prefix !== "string") return prefix;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      outputPath,
      ref,
      format: normalizeFormat(targetRecord.format),
      pathspecs,
      prefix,
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

function ensureScope(target: GitArchiveRepositoryTarget, context: GitArchiveRepositoryContext | undefined): GitArchiveRepositoryResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  if (!pathAllowed(target.repositoryPath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.archiveRepository target repository is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  if (!pathAllowed(target.outputPath, allowedRoots)) {
    return failure("SCOPE_REJECTED", "git.archiveRepository outputPath is outside the allowed repository roots", "scope", context, target.repositoryPath);
  }
  return undefined;
}

function permissionsForTarget(_target: GitArchiveRepositoryTarget): readonly GitArchiveRepositoryPermission[] {
  return gitArchiveRepositoryDescriptor.permissionsRequired;
}

function ensurePermissions(target: GitArchiveRepositoryTarget, context: GitArchiveRepositoryContext | undefined): GitArchiveRepositoryResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.archiveRepository is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitArchiveRepositoryTarget, context: GitArchiveRepositoryContext): GitArchiveRepositoryResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.archiveRepository requires an affirmative runtime guard for real archive output",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitArchiveRepositoryTarget): readonly string[] {
  return [
    "archive",
    `--format=${target.format}`,
    "--output",
    target.outputPath,
    ...(target.prefix === undefined ? [] : [`--prefix=${target.prefix}`]),
    target.ref,
    ...target.pathspecs,
  ];
}

function commandPreview(target: GitArchiveRepositoryTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitArchiveRepositoryRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-archive-repository",
  allowedSubcommand: "archive",
};

function riskForTarget(_target: GitArchiveRepositoryTarget): GitArchiveRepositoryRisk {
  return {
    category: "workspace-mutation",
    riskLevel: "risky",
    mutatesRepository: false,
    mutatesWorkingTree: true,
    writesArchiveFile: true,
    spawnsProcess: true,
    requiresTapApproval: true,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitArchiveRepositoryPlan["dispatch"], dryRun: boolean): GitArchiveRepositoryPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.archiveRepository",
    toolKind: "git.archiveRepository",
    capability: "archive-repository",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    outputPath: normalized.target.outputPath,
    ref: normalized.target.ref,
    format: normalized.target.format,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: false,
    unsafeSideEffects: true,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-archive-runtime-guard",
      event: "basicTool.git.archiveRepository.planned",
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

export function parseGitArchiveRepositoryResult(
  providerResult: GitArchiveRepositoryProviderResult | undefined,
  target: GitArchiveRepositoryTarget,
): GitArchiveRepositoryEnvelope {
  return {
    parser: "git-archive-output-v1",
    repositoryPath: target.repositoryPath,
    outputPath: target.outputPath,
    ref: target.ref,
    format: target.format,
    pathspecCount: target.pathspecs.length,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    archiveCreated: providerResult?.exitCode === 0,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitArchiveRepositoryProviderResult): GitArchiveRepositoryResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.archiveRepository",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.archiveRepository",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitArchiveRepositoryDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: true,
      resultEnvelope: parseGitArchiveRepositoryResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.archiveRepository.dryRun" : "agentCore.basicTool.git.archiveRepository.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { outputPath: normalized.target.outputPath, ref: normalized.target.ref, format: normalized.target.format, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.archiveRepository.dryRun" : "basicTool.git.archiveRepository.executed"],
  };
}

export function planGitRepositoryArchive(request: GitArchiveRepositoryRequest = {}): GitArchiveRepositoryResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitArchiveRepository = planGitRepositoryArchive;

export async function executeGitArchiveRepository(request: GitArchiveRepositoryRequest = {}): Promise<GitArchiveRepositoryResult> {
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
      "git.archiveRepository requires runtime.execEngine.git.runGit for real execution",
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
      "git.archiveRepository provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
