/*
 * git.manageSubmodule storage core.
 * Owns the fixed git submodule contract and delegates host execution to BaseToolExecutorPort.git.runGit.
 */

export type GitManageSubmoduleAction = "status" | "add" | "update" | "sync" | "deinit";
export type GitManageSubmodulePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write" | "network:egress";
export type GitManageSubmoduleRiskCategory = "read-only-inspection" | "workspace-mutation" | "remote-network" | "destructive";

export type GitManageSubmoduleGuard = { allowed?: boolean; accepted?: boolean; reason?: string };

export type GitManageSubmoduleContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitManageSubmoduleGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitManageSubmodulePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitManageSubmoduleTarget = {
  repositoryPath: string;
  action: GitManageSubmoduleAction;
  submodulePath?: string;
  remoteUrl?: string;
  branch?: string;
  recursive: boolean;
};

export type GitManageSubmoduleRequest = {
  target?: Partial<GitManageSubmoduleTarget>;
  context?: GitManageSubmoduleContext;
  provider?: GitManageSubmoduleProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  cwd?: string;
  action?: GitManageSubmoduleAction;
  submodulePath?: string;
  path?: string;
  remoteUrl?: string;
  url?: string;
  branch?: string;
  recursive?: boolean;
  dryRun?: boolean;
};

export type GitManageSubmoduleRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-manage-submodule";
  allowedSubcommand: "submodule";
};

export type GitManageSubmoduleRisk = {
  category: GitManageSubmoduleRiskCategory;
  riskLevel: "normal" | "risky" | "destructive";
  mutatesRepository: boolean;
  mutatesWorkingTree: boolean;
  mutatesFilesystem: boolean;
  mutatesGitMetadata: boolean;
  mayUseNetwork: boolean;
  spawnsProcess: true;
  requiresTapApproval: boolean;
  runtimeOwnsExecution: true;
};

export type GitSubmoduleStatusEntry = {
  raw: string;
  status?: "initialized" | "uninitialized" | "modified" | "unknown";
  commit?: string;
  path?: string;
  ref?: string;
};

export type GitManageSubmoduleEnvelope = {
  parser: "git-submodule-output-v1";
  action: GitManageSubmoduleAction;
  submodulePath?: string;
  remoteUrl?: string;
  branch?: string;
  recursive: boolean;
  exitCode?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  operationHint?: string;
  entries: readonly GitSubmoduleStatusEntry[];
  submoduleChanged: boolean;
};

export type GitManageSubmoduleOutput = {
  kind: "agentCore.basicTool.git.manageSubmodule";
  target: GitManageSubmoduleTarget;
  runtimeEntry: GitManageSubmoduleRuntimeEntry;
  risk: GitManageSubmoduleRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitManageSubmodulePermission[];
  unsafeSideEffects: boolean;
  mayUseNetwork: boolean;
  resultEnvelope: GitManageSubmoduleEnvelope;
};

export type GitManageSubmodulePlan = {
  toolId: "git.manageSubmodule";
  toolKind: "git.manageSubmodule";
  capability: "manage-git-submodule";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  action: GitManageSubmoduleAction;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  requiredPermissions: readonly GitManageSubmodulePermission[];
  runtimeEntry: GitManageSubmoduleRuntimeEntry;
  risk: GitManageSubmoduleRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  wouldModifyGitMetadata: boolean;
  wouldUseNetwork: boolean;
  unsafeSideEffects: boolean;
  outputEnvelope: { stdoutPreview: ""; stderrPreview: ""; parsed: false };
  audit: {
    guard: "git-submodule-runtime-guard";
    event: "basicTool.git.manageSubmodule.planned";
    governanceRequired: boolean;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitManageSubmoduleErrorBoundary = "input" | "scope" | "permission" | "governance" | "provider";
export type GitManageSubmoduleErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_SUBMODULE_PATH"
  | "MISSING_REMOTE_URL"
  | "INVALID_ACTION"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitManageSubmoduleError = {
  code: GitManageSubmoduleErrorCode;
  message: string;
  boundary: GitManageSubmoduleErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitManageSubmoduleAuditEvent = {
  type: string;
  toolId: "git.manageSubmodule";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitManageSubmoduleResult =
  | {
      ok: true;
      toolId: "git.manageSubmodule";
      output: GitManageSubmoduleOutput;
      plan: GitManageSubmodulePlan;
      audit: readonly GitManageSubmoduleAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.manageSubmodule";
      error: GitManageSubmoduleError;
      audit: readonly GitManageSubmoduleAuditEvent[];
      events: readonly string[];
    };

export type GitManageSubmoduleProviderRequest = { repositoryPath: string; args: readonly string[]; timeoutMs?: number };
export type GitManageSubmoduleProviderResult = { exitCode: number; stdout: string; stderr: string };
export type GitManageSubmoduleProvider = (
  request: GitManageSubmoduleProviderRequest,
  context: GitManageSubmoduleContext,
) => GitManageSubmoduleProviderResult | Promise<GitManageSubmoduleProviderResult>;

type NormalizedRequest = { target: GitManageSubmoduleTarget; context: GitManageSubmoduleContext; timeoutMs?: number };

export const gitManageSubmoduleDescriptor = {
  toolId: "git.manageSubmodule",
  toolKind: "git.manageSubmodule",
  capability: "manage-git-submodule",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  defaultDryRun: true,
  defaultDispatch: "dry-run",
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "submodule-management",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 900_000,
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

function dryRunEnabled(context: GitManageSubmoduleContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitManageSubmoduleContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.manageSubmodule:dry-run";
}

function runtimeId(context: GitManageSubmoduleContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitManageSubmoduleContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitManageSubmoduleAuditEvent {
  return {
    type,
    toolId: gitManageSubmoduleDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: GitManageSubmoduleErrorCode,
  message: string,
  boundary: GitManageSubmoduleErrorBoundary,
  context: GitManageSubmoduleContext | undefined,
  repositoryPath?: string,
): GitManageSubmoduleResult {
  return {
    ok: false,
    toolId: gitManageSubmoduleDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.manageSubmodule.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.manageSubmodule.rejected"],
  };
}

function normalizeContext(rawContext: unknown, legacyRequest: Record<string, unknown>): GitManageSubmoduleContext | GitManageSubmoduleResult {
  const contextRecord = rawContext === undefined ? {} : rawContext;
  if (!isRecord(contextRecord)) return failure("INVALID_CONTEXT", "git.manageSubmodule context must be an object", "input", undefined);
  const guard = contextRecord.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.manageSubmodule context.guard must be an object", "input", undefined);
  }
  const allowedRepositoryRoots = stringArrayValue(contextRecord.allowedRepositoryRoots);
  if (contextRecord.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.manageSubmodule context.allowedRepositoryRoots must be a string array", "input", undefined);
  }
  const grantedPermissions = stringArrayValue(contextRecord.grantedPermissions);
  if (contextRecord.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.manageSubmodule context.grantedPermissions must be a string array", "input", undefined);
  }
  const auditMetadata = isRecord(contextRecord.auditMetadata) ? contextRecord.auditMetadata : undefined;
  if (contextRecord.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.manageSubmodule context.auditMetadata must be an object", "input", undefined);
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
    grantedPermissions: grantedPermissions as readonly GitManageSubmodulePermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(value: unknown, context: GitManageSubmoduleContext | undefined): string | GitManageSubmoduleResult {
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return failure("MISSING_REPOSITORY_PATH", "git.manageSubmodule requires target.repositoryPath", "input", context);
  if (normalized.includes("\0")) return failure("INVALID_ARGUMENT", "git.manageSubmodule repositoryPath cannot contain NUL bytes", "input", context, normalized);
  return normalized;
}

function normalizeSubmodulePath(
  value: unknown,
  context: GitManageSubmoduleContext,
  repositoryPath: string,
  required: boolean,
): string | undefined | GitManageSubmoduleResult {
  const raw = stringValue(value)?.trim() ?? "";
  if (raw.length === 0) {
    return required ? failure("MISSING_SUBMODULE_PATH", "git.manageSubmodule requires target.submodulePath", "input", context, repositoryPath) : undefined;
  }
  const normalized = raw.replaceAll("\\", "/").replace(/\/+$/u, "");
  if (normalized.includes("\0") || normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    return failure("INVALID_ARGUMENT", "git.manageSubmodule target.submodulePath must be repository-relative", "input", context, repositoryPath);
  }
  return normalized;
}

function safeRefLike(
  value: unknown,
  field: string,
  context: GitManageSubmoduleContext,
  repositoryPath: string,
): string | undefined | GitManageSubmoduleResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", `git.manageSubmodule ${field} must be a safe ref-like value`, "input", context, repositoryPath);
  }
  return normalized;
}

function safeRemoteUrl(value: unknown, context: GitManageSubmoduleContext, repositoryPath: string): string | undefined | GitManageSubmoduleResult {
  if (value === undefined) return undefined;
  const normalized = stringValue(value)?.trim() ?? "";
  if (normalized.length === 0) return undefined;
  if (normalized.includes("\0") || /\s/u.test(normalized) || normalized.startsWith("-")) {
    return failure("INVALID_ARGUMENT", "git.manageSubmodule target.remoteUrl must be a safe URL or repository path", "input", context, repositoryPath);
  }
  return normalized;
}

function normalizeAction(value: unknown, context: GitManageSubmoduleContext, repositoryPath: string): GitManageSubmoduleAction | GitManageSubmoduleResult {
  if (value === undefined || value === "status") return "status";
  if (value === "add" || value === "update" || value === "sync" || value === "deinit") return value;
  return failure("INVALID_ACTION", "git.manageSubmodule target.action must be status, add, update, sync, or deinit", "input", context, repositoryPath);
}

function normalizeTimeout(value: unknown, context: GitManageSubmoduleContext, repositoryPath: string): number | undefined | GitManageSubmoduleResult {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > gitManageSubmoduleDescriptor.maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `git.manageSubmodule timeoutMs must be an integer from 1 to ${gitManageSubmoduleDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return value;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitManageSubmoduleResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.manageSubmodule request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context, requestRecord);
  if ("ok" in context) return context;
  const targetRecord = isRecord(requestRecord.target) ? requestRecord.target : requestRecord;
  if (requestRecord.target !== undefined && !isRecord(requestRecord.target)) {
    return failure("INVALID_ARGUMENT", "git.manageSubmodule target must be an object", "input", context);
  }
  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath ?? requestRecord.repositoryPath ?? requestRecord.cwd, context);
  if (typeof repositoryPath !== "string") return repositoryPath;
  const action = normalizeAction(targetRecord.action ?? requestRecord.action, context, repositoryPath);
  if (typeof action !== "string") return action;
  const submodulePath = normalizeSubmodulePath(
    targetRecord.submodulePath ?? targetRecord.path ?? requestRecord.submodulePath ?? requestRecord.path,
    context,
    repositoryPath,
    action === "add" || action === "deinit",
  );
  if (submodulePath !== undefined && typeof submodulePath !== "string") return submodulePath;
  const remoteUrl = safeRemoteUrl(targetRecord.remoteUrl ?? targetRecord.url ?? requestRecord.remoteUrl ?? requestRecord.url, context, repositoryPath);
  if (remoteUrl !== undefined && typeof remoteUrl !== "string") return remoteUrl;
  if (action === "add" && remoteUrl === undefined) {
    return failure("MISSING_REMOTE_URL", "git.manageSubmodule add requires target.remoteUrl", "input", context, repositoryPath);
  }
  const branch = safeRefLike(targetRecord.branch ?? requestRecord.branch, "target.branch", context, repositoryPath);
  if (branch !== undefined && typeof branch !== "string") return branch;
  const recursiveValue = targetRecord.recursive ?? requestRecord.recursive;
  const recursive = recursiveValue === undefined ? true : booleanValue(recursiveValue);
  if (typeof recursive !== "boolean") {
    return failure("INVALID_ARGUMENT", "git.manageSubmodule target.recursive must be a boolean", "input", context, repositoryPath);
  }
  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") return timeoutMs;
  return {
    target: { repositoryPath, action, submodulePath, remoteUrl, branch, recursive },
    context,
    timeoutMs,
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

function ensureScope(repositoryPath: string, context: GitManageSubmoduleContext | undefined): GitManageSubmoduleResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) return undefined;
  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  return allowed
    ? undefined
    : failure("SCOPE_REJECTED", "git.manageSubmodule target repository is outside the allowed repository roots", "scope", context, repositoryPath);
}

function mayUseNetwork(target: GitManageSubmoduleTarget): boolean {
  return target.action === "add" || target.action === "update";
}

function mutates(target: GitManageSubmoduleTarget): boolean {
  return target.action !== "status";
}

function permissionsForTarget(target: GitManageSubmoduleTarget): readonly GitManageSubmodulePermission[] {
  if (!mutates(target)) return ["git:read", "filesystem:read"];
  return [
    "git:read",
    "git:write",
    "filesystem:read",
    "filesystem:write",
    ...(mayUseNetwork(target) ? ["network:egress" as const] : []),
  ];
}

function ensurePermissions(target: GitManageSubmoduleTarget, context: GitManageSubmoduleContext | undefined): GitManageSubmoduleResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) return undefined;
  const missing = permissionsForTarget(target).filter((permission) => !granted.includes(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `git.manageSubmodule is missing permissions: ${missing.join(", ")}`, "permission", context, target.repositoryPath);
}

function ensureGovernance(target: GitManageSubmoduleTarget, context: GitManageSubmoduleContext): GitManageSubmoduleResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (!mutates(target)) return undefined;
  if (context.guard?.allowed === true || context.guard?.accepted === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.manageSubmodule requires an affirmative runtime guard for submodule mutations",
    "governance",
    context,
    target.repositoryPath,
  );
}

function providerArgs(target: GitManageSubmoduleTarget): readonly string[] {
  if (target.action === "status") {
    return ["submodule", "status", ...(target.recursive ? ["--recursive"] : []), ...(target.submodulePath === undefined ? [] : ["--", target.submodulePath])];
  }
  if (target.action === "add") {
    return [
      "submodule",
      "add",
      ...(target.branch === undefined ? [] : ["-b", target.branch]),
      target.remoteUrl ?? "",
      target.submodulePath ?? "",
    ];
  }
  if (target.action === "update") {
    return ["submodule", "update", "--init", ...(target.recursive ? ["--recursive"] : []), ...(target.submodulePath === undefined ? [] : ["--", target.submodulePath])];
  }
  if (target.action === "sync") {
    return ["submodule", "sync", ...(target.recursive ? ["--recursive"] : []), ...(target.submodulePath === undefined ? [] : ["--", target.submodulePath])];
  }
  return ["submodule", "deinit", "--", target.submodulePath ?? ""];
}

function commandPreview(target: GitManageSubmoduleTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const runtimeEntry: GitManageSubmoduleRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-manage-submodule",
  allowedSubcommand: "submodule",
};

function riskForTarget(target: GitManageSubmoduleTarget): GitManageSubmoduleRisk {
  const changes = mutates(target);
  const network = mayUseNetwork(target);
  const destructive = target.action === "deinit";
  return {
    category: !changes ? "read-only-inspection" : destructive ? "destructive" : network ? "remote-network" : "workspace-mutation",
    riskLevel: !changes ? "normal" : destructive ? "destructive" : "risky",
    mutatesRepository: changes,
    mutatesWorkingTree: changes,
    mutatesFilesystem: changes,
    mutatesGitMetadata: changes,
    mayUseNetwork: network,
    spawnsProcess: true,
    requiresTapApproval: changes,
    runtimeOwnsExecution: true,
  };
}

function plan(normalized: NormalizedRequest, dispatch: GitManageSubmodulePlan["dispatch"], dryRun: boolean): GitManageSubmodulePlan {
  return {
    toolId: "git.manageSubmodule",
    toolKind: "git.manageSubmodule",
    capability: "manage-git-submodule",
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    action: normalized.target.action,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    requiredPermissions: permissionsForTarget(normalized.target),
    runtimeEntry,
    risk: riskForTarget(normalized.target),
    dispatch,
    dryRun,
    wouldModifyGitMetadata: mutates(normalized.target),
    wouldUseNetwork: mayUseNetwork(normalized.target),
    unsafeSideEffects: mutates(normalized.target),
    outputEnvelope: { stdoutPreview: "", stderrPreview: "", parsed: false },
    audit: {
      guard: "git-submodule-runtime-guard",
      event: "basicTool.git.manageSubmodule.planned",
      governanceRequired: mutates(normalized.target),
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

function parseStatusLine(line: string): GitSubmoduleStatusEntry | undefined {
  const raw = line.trimEnd();
  if (raw.trim().length === 0) return undefined;
  const statusChar = raw[0];
  const rest = raw.slice(1).trim();
  const match = rest.match(/^(\S+)\s+(\S+)(?:\s+\(([^)]+)\))?/u);
  if (match === null) return { raw, status: "unknown" };
  return {
    raw,
    status: statusChar === " " ? "initialized" : statusChar === "-" ? "uninitialized" : statusChar === "+" ? "modified" : "unknown",
    commit: match[1],
    path: match[2],
    ref: match[3],
  };
}

export function parseGitManageSubmoduleResult(
  providerResult: GitManageSubmoduleProviderResult | undefined,
  target: GitManageSubmoduleTarget,
): GitManageSubmoduleEnvelope {
  const entries = target.action === "status"
    ? (providerResult?.stdout ?? "")
        .split(/\r?\n/u)
        .map(parseStatusLine)
        .filter((entry): entry is GitSubmoduleStatusEntry => entry !== undefined)
    : [];
  return {
    parser: "git-submodule-output-v1",
    action: target.action,
    submodulePath: target.submodulePath,
    remoteUrl: target.remoteUrl,
    branch: target.branch,
    recursive: target.recursive,
    exitCode: providerResult?.exitCode,
    stdoutLineCount: lineCount(providerResult?.stdout ?? ""),
    stderrLineCount: lineCount(providerResult?.stderr ?? ""),
    operationHint: providerResult === undefined ? undefined : firstOutputLine(providerResult.stdout, providerResult.stderr),
    entries,
    submoduleChanged: providerResult?.exitCode === 0 && mutates(target),
  };
}

function success(normalized: NormalizedRequest, dryRun: boolean, providerResult?: GitManageSubmoduleProviderResult): GitManageSubmoduleResult {
  const executionPlan = plan(normalized, dryRun ? "dry-run" : "runtime-git-executor", dryRun);
  return {
    ok: true,
    toolId: "git.manageSubmodule",
    plan: executionPlan,
    output: {
      kind: "agentCore.basicTool.git.manageSubmodule",
      target: normalized.target,
      runtimeEntry,
      risk: riskForTarget(normalized.target),
      gitArgs: executionPlan.gitArgs,
      commandPreview: executionPlan.commandPreview,
      timeoutMs: normalized.timeoutMs ?? gitManageSubmoduleDescriptor.defaultTimeoutMs,
      dryRun,
      executionBlocked: dryRun,
      providerCalled: providerResult !== undefined,
      exitCode: providerResult?.exitCode,
      stdout: providerResult?.stdout,
      stderr: providerResult?.stderr,
      permissionsRequired: permissionsForTarget(normalized.target),
      unsafeSideEffects: mutates(normalized.target),
      mayUseNetwork: mayUseNetwork(normalized.target),
      resultEnvelope: parseGitManageSubmoduleResult(providerResult, normalized.target),
    },
    audit: [
      auditEvent(
        dryRun ? "agentCore.basicTool.git.manageSubmodule.dryRun" : "agentCore.basicTool.git.manageSubmodule.executed",
        normalized.context,
        normalized.target.repositoryPath,
        { action: normalized.target.action, submodulePath: normalized.target.submodulePath, exitCode: providerResult?.exitCode },
      ),
    ],
    events: [dryRun ? "basicTool.git.manageSubmodule.dryRun" : "basicTool.git.manageSubmodule.executed"],
  };
}

export function planManageSubmodule(request: GitManageSubmoduleRequest = {}): GitManageSubmoduleResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  return success(normalized, true);
}

export const planGitSubmoduleManagement = planManageSubmodule;
export const planGitManageSubmodule = planManageSubmodule;

export async function executeGitManageSubmodule(request: GitManageSubmoduleRequest = {}): Promise<GitManageSubmoduleResult> {
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
    return failure("PROVIDER_UNAVAILABLE", "git.manageSubmodule requires runtime.execEngine.git.runGit for real execution", "provider", normalized.context, normalized.target.repositoryPath);
  }
  try {
    const providerResult = await request.provider(
      { repositoryPath: normalized.target.repositoryPath, args: providerArgs(normalized.target), timeoutMs: normalized.timeoutMs },
      normalized.context,
    );
    return success(normalized, false, providerResult);
  } catch {
    return failure("PROVIDER_REJECTED", "git.manageSubmodule provider rejected the request or failed safely", "provider", normalized.context, normalized.target.repositoryPath);
  }
}
