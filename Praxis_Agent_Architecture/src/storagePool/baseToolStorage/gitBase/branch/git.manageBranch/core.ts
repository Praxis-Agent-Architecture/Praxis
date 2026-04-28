/*
 * git.manageBranch storage core.
 * Owns the fixed git-branch contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitManageBranchPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";
export type GitManageBranchAction = "list" | "create" | "delete" | "rename" | "set-upstream";
export type GitManageBranchRiskCategory = "read-only-inspection" | "history-mutation" | "destructive";

export type GitManageBranchGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitManageBranchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageBranchGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageBranchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageBranchTarget = {
  repositoryPath: string;
  action: GitManageBranchAction;
  branchName?: string;
  newBranchName?: string;
  startPoint?: string;
  upstream?: string;
  force: boolean;
};

export type GitManageBranchRequest = {
  target?: Partial<GitManageBranchTarget>;
  context?: GitManageBranchContext;
  provider?: GitManageBranchProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  action?: GitManageBranchAction;
  branchName?: string;
  branch?: string;
  name?: string;
  newBranchName?: string;
  newBranch?: string;
  startPoint?: string;
  upstream?: string;
  ref?: string;
  revision?: string;
  force?: boolean;
  dryRun?: boolean;
};

export type GitManageBranchRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-manage-branch";
  allowedSubcommand: "branch";
};

export type GitManageBranchRisk = {
  category: GitManageBranchRiskCategory;
  riskLevel: "normal" | "risky";
  mutatesRepository: boolean;
  mutatesWorkingTree: false;
  mutatesIndex: false;
  createsBranch: boolean;
  deletesBranch: boolean;
  renamesBranch: boolean;
  setsUpstream: boolean;
  spawnsProcess: true;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitManageBranchEnvelope = {
  parser: "git-branch-output-v1";
  action: GitManageBranchAction;
  branchName?: string;
  newBranchName?: string;
  startPoint?: string;
  upstream?: string;
  force: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  branchNames: readonly string[];
  currentBranch?: string;
  operationHint?: string;
  branchCreated: boolean;
  branchDeleted: boolean;
  branchRenamed: boolean;
  upstreamSet: boolean;
};

export type GitManageBranchOutput = {
  kind: "agentCore.basicTool.git.manageBranch";
  target: GitManageBranchTarget;
  runtimeEntry: GitManageBranchRuntimeEntry;
  risk: GitManageBranchRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitManageBranchPermission[];
  unsafeSideEffects: boolean;
  managesBranch: true;
  resultEnvelope: GitManageBranchEnvelope;
};

export type GitManageBranchPlan = {
  toolId: "git.manageBranch";
  toolKind: "git.manageBranch";
  capability: "manage-branch";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitManageBranchAction;
  branchName?: string;
  newBranchName?: string;
  startPoint?: string;
  upstream?: string;
  force: boolean;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitManageBranchPermission[];
  runtimeEntry: GitManageBranchRuntimeEntry;
  risk: GitManageBranchRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldMutateRepository: boolean;
  unsafeSideEffects: boolean;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-branch-runtime-guard";
    event: "basicTool.git.manageBranch.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageBranchErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageBranchErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_BRANCH_NAME"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_ACTION"
  | "UNSAFE_REF"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageBranchError = {
  code: GitManageBranchErrorCode;
  message: string;
  boundary: GitManageBranchErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageBranchAuditEvent = {
  type: string;
  toolId: "git.manageBranch";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageBranchResult =
  | {
      ok: true;
      toolId: "git.manageBranch";
      output: GitManageBranchOutput;
      plan: GitManageBranchPlan;
      audit: readonly GitManageBranchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageBranch";
      error: GitManageBranchError;
      audit: readonly GitManageBranchAuditEvent[];
      events: readonly string[];
    };

export type GitManageBranchProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitManageBranchProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitManageBranchProvider = (
  request: GitManageBranchProviderRequest,
  context: GitManageBranchContext,
) => GitManageBranchProviderResult | Promise<GitManageBranchProviderResult>;

type NormalizedRequest = {
  target: GitManageBranchTarget;
  context: GitManageBranchContext;
  timeoutMs?: number;
};

export const gitManageBranchDescriptor = {
  toolId: "git.manageBranch",
  toolKind: "git.manageBranch",
  capability: "manage-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
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

function dryRunEnabled(context: GitManageBranchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageBranchContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageBranch:dry-run";
}

function runtimeId(context: GitManageBranchContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageBranchContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageBranchAuditEvent {
  return {
    type,
    toolId: gitManageBranchDescriptor.toolId,
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
  code: GitManageBranchErrorCode,
  message: string,
  boundary: GitManageBranchErrorBoundary,
  context: GitManageBranchContext | undefined,
  repositoryPath?: string,
): GitManageBranchResult {
  return {
    ok: false,
    toolId: gitManageBranchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageBranch.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageBranch.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageBranchContext | GitManageBranchResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) {
    return failure("INVALID_CONTEXT", "git.manageBranch context must be an object", "input", undefined);
  }
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageBranch context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageBranch context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageBranch context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageBranch context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageBranchPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitManageBranchContext | undefined): string | GitManageBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REPOSITORY_PATH", "git.manageBranch requires target.repositoryPath", "input", context);
  }
  if (normalized.includes("\0")) {
    return failure("INVALID_ARGUMENT", "git.manageBranch repositoryPath cannot contain NUL bytes", "input", context, normalized);
  }
  return normalized;
}

function normalizeAction(value: unknown): GitManageBranchAction | GitManageBranchResult {
  if (value === undefined) return "list";
  if (value === "list" || value === "create" || value === "delete" || value === "rename" || value === "set-upstream") return value;
  return failure("INVALID_ACTION", "git.manageBranch target.action must be list, create, delete, rename, or set-upstream", "input", undefined);
}

function isUnsafeRef(value: string): boolean {
  return (
    value.length === 0 ||
    value.includes("\0") ||
    /\s/u.test(value) ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.endsWith(".lock") ||
    value.includes(":")
  );
}

function normalizeRequiredBranchName(
  value: unknown,
  action: GitManageBranchAction,
  context: GitManageBranchContext,
  repositoryPath: string,
): string | undefined | GitManageBranchResult {
  if (action === "list") return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_BRANCH_NAME", `git.manageBranch action ${action} requires target.branchName`, "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", "git.manageBranch target.branchName must be a safe ref", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeOptionalRef(
  fieldName: "newBranchName" | "startPoint" | "upstream",
  value: unknown,
  context: GitManageBranchContext,
  repositoryPath: string,
): string | undefined | GitManageBranchResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", `git.manageBranch target.${fieldName} must be a safe ref`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeRequiredRef(
  fieldName: "newBranchName" | "upstream",
  value: unknown,
  action: GitManageBranchAction,
  context: GitManageBranchContext,
  repositoryPath: string,
): string | GitManageBranchResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_REQUIRED_FIELD", `git.manageBranch action ${action} requires target.${fieldName}`, "input", context, repositoryPath);
  }
  if (isUnsafeRef(normalized)) {
    return failure("UNSAFE_REF", `git.manageBranch target.${fieldName} must be a safe ref`, "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeTimeout(
  value: unknown,
  context: GitManageBranchContext,
  repositoryPath: string,
): number | undefined | GitManageBranchResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageBranchDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageBranch timeoutMs must be an integer from 1 to ${gitManageBranchDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageBranchResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageBranch request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageBranch target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action);
  if (typeof action !== "string") return action;
  const branchName = normalizeRequiredBranchName(
    targetRecord.branchName ?? targetRecord.branch ?? targetRecord.name,
    action,
    context,
    repositoryPath,
  );
  if (branchName !== undefined && typeof branchName !== "string") return branchName;
  const newBranchName =
    action === "rename"
      ? normalizeRequiredRef("newBranchName", targetRecord.newBranchName ?? targetRecord.newBranch, action, context, repositoryPath)
      : normalizeOptionalRef("newBranchName", targetRecord.newBranchName ?? targetRecord.newBranch, context, repositoryPath);
  if (newBranchName !== undefined && typeof newBranchName !== "string") return newBranchName;
  const startPoint = normalizeOptionalRef(
    "startPoint",
    targetRecord.startPoint ?? targetRecord.ref ?? targetRecord.revision,
    context,
    repositoryPath,
  );
  if (startPoint !== undefined && typeof startPoint !== "string") return startPoint;
  const upstream =
    action === "set-upstream"
      ? normalizeRequiredRef("upstream", targetRecord.upstream, action, context, repositoryPath)
      : normalizeOptionalRef("upstream", targetRecord.upstream, context, repositoryPath);
  if (upstream !== undefined && typeof upstream !== "string") return upstream;
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: {
      repositoryPath,
      action,
      branchName,
      newBranchName,
      startPoint,
      upstream,
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

function ensureScope(repositoryPath: string, context: GitManageBranchContext | undefined): GitManageBranchResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.manageBranch target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function permissionsForTarget(target: GitManageBranchTarget): readonly GitManageBranchPermission[] {
  return target.action === "list"
    ? ["git:read", "filesystem:read"]
    : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(target: GitManageBranchTarget, context: GitManageBranchContext | undefined): GitManageBranchResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageBranch is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitManageBranchTarget, context: GitManageBranchContext): GitManageBranchResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (target.action === "list") return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageBranch requires an affirmative runtime guard for real branch mutation",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitManageBranchTarget): readonly string[] {
  if (target.action === "list") {
    return ["branch", "--list"];
  }
  if (target.action === "create") {
    return ["branch", ...(target.force ? ["--force"] : []), target.branchName ?? "", ...(target.startPoint === undefined ? [] : [target.startPoint])];
  }
  if (target.action === "delete") {
    return ["branch", target.force ? "-D" : "-d", target.branchName ?? ""];
  }
  if (target.action === "rename") {
    return ["branch", target.force ? "-M" : "-m", target.branchName ?? "", target.newBranchName ?? ""];
  }
  return ["branch", "--set-upstream-to", target.upstream ?? "", target.branchName ?? ""];
}

function commandPreview(target: GitManageBranchTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitManageBranchRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-manage-branch",
  allowedSubcommand: "branch",
};

function riskForTarget(target: GitManageBranchTarget): GitManageBranchRisk {
  const category: GitManageBranchRiskCategory =
    target.action === "list" ? "read-only-inspection" : target.action === "delete" ? "destructive" : "history-mutation";
  return {
    category,
    riskLevel: target.action === "list" ? "normal" : "risky",
    mutatesRepository: target.action !== "list",
    mutatesWorkingTree: false,
    mutatesIndex: false,
    createsBranch: target.action === "create",
    deletesBranch: target.action === "delete",
    renamesBranch: target.action === "rename",
    setsUpstream: target.action === "set-upstream",
    spawnsProcess: true,
    requiresTapApproval: target.action !== "list",
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitManageBranchPlan["dispatch"], dryRun: boolean): GitManageBranchPlan {
  const risk = riskForTarget(normalized.target);
  return {
    toolId: "git.manageBranch",
    toolKind: "git.manageBranch",
    capability: "manage-branch",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    branchName: normalized.target.branchName,
    newBranchName: normalized.target.newBranchName,
    startPoint: normalized.target.startPoint,
    upstream: normalized.target.upstream,
    force: normalized.target.force,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk,
    dispatch,
    dryRun,
    wouldMutateRepository: normalized.target.action !== "list",
    unsafeSideEffects: normalized.target.action !== "list",
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-branch-runtime-guard",
      event: "basicTool.git.manageBranch.planned",
      governanceRequired: normalized.target.action !== "list",
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

function parseBranchLine(line: string): { current: boolean; name: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  const current = trimmed.startsWith("*");
  const withoutMarker = current ? trimmed.slice(1).trim() : trimmed;
  if (withoutMarker.length === 0) return undefined;
  return { current, name: withoutMarker };
}

function parseListedBranches(stdout: string): { branchNames: readonly string[]; currentBranch?: string } {
  const parsed = stdout
    .split(/\r?\n/u)
    .map(parseBranchLine)
    .filter((entry): entry is { current: boolean; name: string } => entry !== undefined);
  return {
    branchNames: parsed.map((entry) => entry.name),
    currentBranch: parsed.find((entry) => entry.current)?.name,
  };
}

function parseRemovedBranchName(line: string): string | undefined {
  const match = line.match(/^Deleted branch ([^ ]+) /u);
  return match?.[1];
}

export function parseGitManageBranchResult(
  providerResult: GitManageBranchProviderResult | undefined,
  target: GitManageBranchTarget,
): GitManageBranchEnvelope {
  const listed = target.action === "list" && providerResult !== undefined ? parseListedBranches(providerResult.stdout) : undefined;
  return {
    parser: "git-branch-output-v1",
    action: target.action,
    branchName: target.branchName,
    newBranchName: target.newBranchName,
    startPoint: target.startPoint,
    upstream: target.upstream,
    force: target.force,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    branchNames: listed?.branchNames ?? (target.action === "delete" && providerResult !== undefined ? [parseRemovedBranchName(providerResult.stdout) ?? target.branchName ?? ""].filter(Boolean) : []),
    currentBranch: listed?.currentBranch,
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    branchCreated: providerResult?.exitCode === 0 && target.action === "create",
    branchDeleted: providerResult?.exitCode === 0 && target.action === "delete",
    branchRenamed: providerResult?.exitCode === 0 && target.action === "rename",
    upstreamSet: providerResult?.exitCode === 0 && target.action === "set-upstream",
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitManageBranchProviderResult): GitManageBranchResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  const risk = riskForTarget(normalized.target);
  return {
    ok: true,
    toolId: "git.manageBranch",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageBranch",
      target: normalized.target,
      runtimeEntry,
      risk,
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitManageBranchDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: normalized.target.action !== "list",
      managesBranch: true,
      resultEnvelope: parseGitManageBranchResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageBranch.dryRun" : "agentCore.basicTool.git.manageBranch.executed",
        normalized.context,
        normalized.target.repositoryPath,
        {
          action: normalized.target.action,
          branchName: normalized.target.branchName,
          newBranchName: normalized.target.newBranchName,
          startPoint: normalized.target.startPoint,
          upstream: normalized.target.upstream,
          exitCode: providerResult?.exitCode,
        },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageBranch.dryRun" : "basicTool.git.manageBranch.executed"],
  };
}

export function planGitBranchManagement(request: GitManageBranchRequest = {}): GitManageBranchResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitManageBranch = planGitBranchManagement;

export async function executeGitManageBranch(request: GitManageBranchRequest = {}): Promise<GitManageBranchResult> {
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
      "git.manageBranch requires runtime.execEngine.git.runGit for real execution",
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
      "git.manageBranch provider rejected the request or failed safely",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
