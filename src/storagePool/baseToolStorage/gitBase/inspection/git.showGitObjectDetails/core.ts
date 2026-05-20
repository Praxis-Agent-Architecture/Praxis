/*
 * git.showGitObjectDetails storage core.
 * Owns the fixed git-show contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitShowObjectDetailsPermission = "git:read" | "filesystem:read";
export type GitObjectDetailsFormat = "summary" | "patch" | "raw";

export type GitShowObjectDetailsGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitShowObjectDetailsContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitShowObjectDetailsGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitShowObjectDetailsPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitShowObjectDetailsTarget = {
  repositoryPath: string;
  objectRef: string;
  format: GitObjectDetailsFormat;
  maxBytes: number;
};

export type GitShowObjectDetailsRequest = {
  target?: Partial<GitShowObjectDetailsTarget>;
  context?: GitShowObjectDetailsContext;
  provider?: GitShowObjectDetailsProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  objectRef?: string;
  format?: GitObjectDetailsFormat;
  maxBytes?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
};

export type GitShowObjectDetailsRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-show-read";
  allowedSubcommand: "show";
};

export type GitShowObjectDetailsRisk = {
  category: "read-only-inspection";
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitShowObjectDetailsCommitEnvelope = {
  commit?: string;
  tree?: string;
  parents: readonly string[];
  author?: string;
  committer?: string;
  subject?: string;
};

export type GitShowObjectDetailsEnvelope = {
  parser: "git-show-output-v1";
  objectRef: string;
  format: GitObjectDetailsFormat;
  lineCount: number;
  byteCount: number;
  truncated: boolean;
  stdoutPreview: string;
  commit?: GitShowObjectDetailsCommitEnvelope;
};

export type GitShowObjectDetailsOutput = {
  kind: "agentCore.basicTool.git.showGitObjectDetails";
  target: GitShowObjectDetailsTarget;
  runtimeEntry: GitShowObjectDetailsRuntimeEntry;
  risk: GitShowObjectDetailsRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitShowObjectDetailsPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitShowObjectDetailsEnvelope;
};

export type GitShowObjectDetailsPlan = {
  toolId: "git.showGitObjectDetails";
  toolKind: "git.showGitObjectDetails";
  capability: "show-git-object-details";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  objectRef: string;
  format: GitObjectDetailsFormat;
  maxBytes: number;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitShowObjectDetailsPermission[];
  runtimeEntry: GitShowObjectDetailsRuntimeEntry;
  risk: GitShowObjectDetailsRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldReadGitObject: true;
  unsafeSideEffects: false;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-show-runtime-guard";
    event: "basicTool.git.showGitObjectDetails.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitShowObjectDetailsErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitShowObjectDetailsErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_OBJECT_REF"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_OBJECT_REF"
  | "INVALID_DETAILS_FORMAT"
  | "INVALID_MAX_BYTES"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitShowObjectDetailsError = {
  code: GitShowObjectDetailsErrorCode;
  message: string;
  boundary: GitShowObjectDetailsErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitShowObjectDetailsAuditEvent = {
  type: string;
  toolId: "git.showGitObjectDetails";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitShowObjectDetailsResult =
  | {
      ok: true;
      toolId: "git.showGitObjectDetails";
      output: GitShowObjectDetailsOutput;
      plan: GitShowObjectDetailsPlan;
      audit: readonly GitShowObjectDetailsAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.showGitObjectDetails";
      error: GitShowObjectDetailsError;
      audit: readonly GitShowObjectDetailsAuditEvent[];
      events: readonly string[];
    };

export type GitShowObjectDetailsProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitShowObjectDetailsProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitShowObjectDetailsProvider = (
  request: GitShowObjectDetailsProviderRequest,
  context: GitShowObjectDetailsContext,
) => GitShowObjectDetailsProviderResult | Promise<GitShowObjectDetailsProviderResult>;

type NormalizedRequest = {
  target: GitShowObjectDetailsTarget;
  context: GitShowObjectDetailsContext;
  timeoutMs?: number;
};

export const gitShowObjectDetailsDescriptor = {
  toolId: "git.showGitObjectDetails",
  toolKind: "git.showGitObjectDetails",
  capability: "show-git-object-details",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  supportedFormats: ["summary", "patch", "raw"],
  defaultFormat: "summary",
  defaultMaxBytes: 128_000,
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-inspection",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  unsafeSideEffects: false,
} as const;

export const showGitObjectDetailsDescriptor = gitShowObjectDetailsDescriptor;

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

function dryRunEnabled(context: GitShowObjectDetailsContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitShowObjectDetailsContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.showGitObjectDetails:dry-run";
}

function runtimeId(context: GitShowObjectDetailsContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitShowObjectDetailsContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitShowObjectDetailsAuditEvent {
  return {
    type,
    toolId: gitShowObjectDetailsDescriptor.toolId,
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
  code: GitShowObjectDetailsErrorCode,
  message: string,
  boundary: GitShowObjectDetailsErrorBoundary,
  context: GitShowObjectDetailsContext | undefined,
  repositoryPath?: string,
): GitShowObjectDetailsResult {
  return {
    ok: false,
    toolId: gitShowObjectDetailsDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.showGitObjectDetails.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.showGitObjectDetails.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitShowObjectDetailsContext | GitShowObjectDetailsResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.showGitObjectDetails context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.showGitObjectDetails context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.showGitObjectDetails context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.showGitObjectDetails context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.showGitObjectDetails context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitShowObjectDetailsPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitShowObjectDetailsContext | undefined): string | GitShowObjectDetailsResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.showGitObjectDetails requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.showGitObjectDetails repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeObjectRef(value: unknown, context: GitShowObjectDetailsContext, repositoryPath: string): string | GitShowObjectDetailsResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_OBJECT_REF", "git.showGitObjectDetails requires target.objectRef", "input", context, repositoryPath);
  }
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_OBJECT_REF", "git.showGitObjectDetails target.objectRef must be a safe git object reference", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeFormat(value: unknown, context: GitShowObjectDetailsContext, repositoryPath: string): GitObjectDetailsFormat | GitShowObjectDetailsResult {
  const normalized = stringValue(value)?.trim() || gitShowObjectDetailsDescriptor.defaultFormat;
  if (normalized === "summary" || normalized === "patch" || normalized === "raw") {
    return normalized;
  }
  return failure("INVALID_DETAILS_FORMAT", "git.showGitObjectDetails target.format must be summary, patch, or raw", "input", context, repositoryPath);
}

function normalizeMaxBytes(value: unknown, context: GitShowObjectDetailsContext, repositoryPath: string): number | GitShowObjectDetailsResult {
  const normalized = value ?? gitShowObjectDetailsDescriptor.defaultMaxBytes;
  if (typeof normalized !== "number" || !Number.isInteger(normalized) || normalized < 1 || normalized > 10_000_000) {
    return failure("INVALID_MAX_BYTES", "git.showGitObjectDetails target.maxBytes must be an integer from 1 to 10000000", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(value: unknown, context: GitShowObjectDetailsContext, repositoryPath: string): number | undefined | GitShowObjectDetailsResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitShowObjectDetailsDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", `git.showGitObjectDetails timeoutMs must be an integer from 1 to ${gitShowObjectDetailsDescriptor.maxTimeoutMs}`, "input", context, repositoryPath);
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitShowObjectDetailsResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.showGitObjectDetails request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.showGitObjectDetails target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const objectRef = normalizeObjectRef(targetRecord.objectRef, context, repositoryPath);
  if (typeof objectRef !== "string") return objectRef;
  const format = normalizeFormat(targetRecord.format, context, repositoryPath);
  if (typeof format !== "string") return format;
  const maxBytes = normalizeMaxBytes(targetRecord.maxBytes ?? requestRecord.maxBytes, context, repositoryPath);
  if (typeof maxBytes !== "number") return maxBytes;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return { target: { repositoryPath, objectRef, format, maxBytes }, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitShowObjectDetailsContext | undefined): GitShowObjectDetailsResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.showGitObjectDetails target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function ensurePermissions(repositoryPath: string, context: GitShowObjectDetailsContext | undefined): GitShowObjectDetailsResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = gitShowObjectDetailsDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.showGitObjectDetails is missing permissions: ${missing.join(", ")}`, "permission", context, repositoryPath);
}

function ensureGovernance(repositoryPath: string, context: GitShowObjectDetailsContext): GitShowObjectDetailsResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.showGitObjectDetails requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitShowObjectDetailsTarget): readonly string[] {
  const args = ["show", "--no-ext-diff"];
  if (target.format === "summary") {
    args.push("--stat", "--decorate");
  } else if (target.format === "raw") {
    args.push("--no-patch", "--pretty=raw");
  } else {
    args.push("--patch");
  }
  args.push(target.objectRef);
  return args;
}

function commandPreview(target: GitShowObjectDetailsTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitShowObjectDetailsRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-show-read",
  allowedSubcommand: "show",
};

const risk: GitShowObjectDetailsRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function plan(normalized: NormalizedRequest, dispatch: GitShowObjectDetailsPlan["dispatch"], dryRun: boolean): GitShowObjectDetailsPlan {
  return {
    toolId: "git.showGitObjectDetails",
    toolKind: "git.showGitObjectDetails",
    capability: "show-git-object-details",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    objectRef: normalized.target.objectRef,
    format: normalized.target.format,
    maxBytes: normalized.target.maxBytes,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: gitShowObjectDetailsDescriptor.permissionsRequired,
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldReadGitObject: true,
    unsafeSideEffects: false,
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-show-runtime-guard",
      event: "basicTool.git.showGitObjectDetails.planned",
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

function parseRawCommit(stdout: string): GitShowObjectDetailsCommitEnvelope | undefined {
  const lines = stdout.split(/\r?\n/u);
  const commitLine = lines.find((line) => line.startsWith("commit "));
  if (commitLine === undefined) return undefined;
  const parents: string[] = [];
  let tree: string | undefined;
  let author: string | undefined;
  let committer: string | undefined;
  let subject: string | undefined;
  for (const line of lines) {
    if (line.startsWith("tree ")) tree = line.slice("tree ".length).trim();
    if (line.startsWith("parent ")) parents.push(line.slice("parent ".length).trim());
    if (line.startsWith("author ")) author = line.slice("author ".length).trim();
    if (line.startsWith("committer ")) committer = line.slice("committer ".length).trim();
    if (line.startsWith("    ") && subject === undefined) subject = line.trim();
  }
  return { commit: commitLine.slice("commit ".length).trim(), tree, parents, author, committer, subject };
}

export function parseGitShowObjectDetails(stdout: string, target: GitShowObjectDetailsTarget): GitShowObjectDetailsEnvelope {
  const byteCount = Buffer.byteLength(stdout, "utf8");
  const truncated = byteCount > target.maxBytes;
  const stdoutPreview = truncated ? stdout.slice(0, target.maxBytes) : stdout;
  return {
    parser: "git-show-output-v1",
    objectRef: target.objectRef,
    format: target.format,
    lineCount: lineCount(stdout),
    byteCount,
    truncated,
    stdoutPreview,
    commit: target.format === "raw" ? parseRawCommit(stdout) : undefined,
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitShowObjectDetailsProviderResult): GitShowObjectDetailsResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.showGitObjectDetails",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.showGitObjectDetails",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitShowObjectDetailsDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: gitShowObjectDetailsDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: parseGitShowObjectDetails(providerResult?.stdout ?? "", normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.showGitObjectDetails.dryRun" : "agentCore.basicTool.git.showGitObjectDetails.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { format: normalized.target.format, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.showGitObjectDetails.dryRun" : "basicTool.git.showGitObjectDetails.executed"],
  };
}

export function planShowGitObjectDetails(request: GitShowObjectDetailsRequest = {}): GitShowObjectDetailsResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export async function executeGitShowObjectDetails(request: GitShowObjectDetailsRequest = {}): Promise<GitShowObjectDetailsResult> {
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
      "git.showGitObjectDetails requires runtime.execEngine.git.runGit for real execution",
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
    return failure("PROVIDER_REJECTED", "git.showGitObjectDetails provider failed", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
