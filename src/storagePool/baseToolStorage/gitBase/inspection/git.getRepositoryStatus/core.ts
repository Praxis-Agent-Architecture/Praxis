/*
 * 文件定位：storagePool / baseToolStorage / git.getRepositoryStatus core。
 * 核心目的：定义 Git 仓库状态读取原语的输入、计划、风险粒度、runtime 入口和稳定输出。
 * 边界：这里只允许读取 `git status --porcelain=<v1|v2> --branch`，不承载任意 git 命令执行。
 */

export type GitGetRepositoryStatusPermission = "git:read" | "filesystem:read";

export type GitGetRepositoryStatusErrorBoundary =
  | "input"
  | "scope"
  | "permission"
  | "contract"
  | "governance"
  | "provider";

export type GitRepositoryStatusGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type GitGetRepositoryStatusContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: GitRepositoryStatusGuard;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitGetRepositoryStatusPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitGetRepositoryStatusTarget = {
  repositoryPath: string;
  includeBranch?: boolean;
  includeUntracked?: boolean;
  porcelainVersion?: "v1" | "v2";
};

export type GitGetRepositoryStatusRequest = {
  target?: Partial<GitGetRepositoryStatusTarget>;
  context?: GitGetRepositoryStatusContext;
  provider?: GitRepositoryStatusProvider;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type GitRepositoryStatusEntry = {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
  originalPath?: string;
};

export type GitRepositoryStatusEnvelope = {
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  entries: readonly GitRepositoryStatusEntry[];
};

export type GitGetRepositoryStatusErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_ARGUMENT"
  | "INVALID_CONTEXT"
  | "INVALID_PORCELAIN_VERSION"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type GitGetRepositoryStatusError = {
  code: GitGetRepositoryStatusErrorCode;
  message: string;
  boundary: GitGetRepositoryStatusErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitGetRepositoryStatusAuditEvent = {
  type: string;
  toolId: "git.getRepositoryStatus";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRepositoryStatusRuntimeEntry = {
  owner: "runtime";
  port: "BaseToolExecutorPort.git.runGit";
  method: "runGit";
  binary: "git";
  argvMode: "fixed-status-read";
  allowedSubcommand: "status";
};

export type GitRepositoryStatusRisk = {
  category: "read-only-inspection";
  riskLevel: "normal";
  mutatesRepository: false;
  mutatesWorkingTree: false;
  spawnsProcess: true;
  requiresTapApproval: true;
  runtimeOwnsExecution: true;
};

export type GitGetRepositoryStatusPlan = {
  toolId: "git.getRepositoryStatus";
  capability: "get-repository-status";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  porcelainVersion: "v1" | "v2";
  includeUntracked: boolean;
  timeoutMs: number;
  requiredPermissions: readonly GitGetRepositoryStatusPermission[];
  runtimeEntry: GitRepositoryStatusRuntimeEntry;
  risk: GitRepositoryStatusRisk;
  dispatch: "dry-run" | "runtime-git-executor";
  dryRun: boolean;
  outputEnvelope: {
    exitCode?: number;
    stdoutPreview: "";
    stderrPreview: "";
    parsed: false;
  };
  audit: {
    guard: "git-status-runtime-guard";
    event: "basicTool.git.getRepositoryStatus.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GitGetRepositoryStatusOutput = {
  kind: "agentCore.basicTool.git.getRepositoryStatus";
  target: GitGetRepositoryStatusTarget;
  runtimeEntry: GitRepositoryStatusRuntimeEntry;
  risk: GitRepositoryStatusRisk;
  gitArgs: readonly string[];
  commandPreview: readonly string[];
  timeoutMs: number;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  permissionsRequired: readonly GitGetRepositoryStatusPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitRepositoryStatusEnvelope;
};

export type GitGetRepositoryStatusResult =
  | {
      ok: true;
      toolId: "git.getRepositoryStatus";
      output: GitGetRepositoryStatusOutput;
      plan?: GitGetRepositoryStatusPlan;
      audit: readonly GitGetRepositoryStatusAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.getRepositoryStatus";
      error: GitGetRepositoryStatusError;
      audit: readonly GitGetRepositoryStatusAuditEvent[];
      events: readonly string[];
    };

export type GitRepositoryStatusProviderRequest = {
  repositoryPath: string;
  args: readonly string[];
  timeoutMs?: number;
};

export type GitRepositoryStatusProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitRepositoryStatusProvider = (
  request: GitRepositoryStatusProviderRequest,
  context: GitGetRepositoryStatusContext,
) => GitRepositoryStatusProviderResult | Promise<GitRepositoryStatusProviderResult>;

type NormalizedRequest = {
  target: GitGetRepositoryStatusTarget;
  context: GitGetRepositoryStatusContext;
  timeoutMs?: number;
};

export const gitGetRepositoryStatusDescriptor = {
  toolId: "git.getRepositoryStatus",
  capability: "get-repository-status",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiresTapApproval: true,
  runtimeEntryPort: "BaseToolExecutorPort.git.runGit",
  operationRisk: "read-only-inspection",
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultPorcelainVersion: "v1",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
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
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return value;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitGetRepositoryStatusContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitGetRepositoryStatusContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "git.getRepositoryStatus:dry-run";
}

function runtimeId(context: GitGetRepositoryStatusContext | undefined): string {
  return stringValue(context?.runtimeId)?.trim() || "runtime.unspecified";
}

function auditEvent(
  type: string,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitGetRepositoryStatusAuditEvent {
  return {
    type,
    toolId: gitGetRepositoryStatusDescriptor.toolId,
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
  code: GitGetRepositoryStatusErrorCode,
  message: string,
  boundary: GitGetRepositoryStatusErrorBoundary,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath?: string,
): GitGetRepositoryStatusResult {
  return {
    ok: false,
    toolId: gitGetRepositoryStatusDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.git.getRepositoryStatus.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.getRepositoryStatus.rejected"],
  };
}

function normalizeContext(rawContext: unknown): GitGetRepositoryStatusContext | GitGetRepositoryStatusResult {
  if (rawContext === undefined) {
    return {};
  }
  if (!isRecord(rawContext)) {
    return failure("INVALID_CONTEXT", "git.getRepositoryStatus context must be an object", "input", undefined);
  }

  const guard = rawContext.guard;
  if (guard !== undefined && !isRecord(guard)) {
    return failure("INVALID_CONTEXT", "git.getRepositoryStatus context.guard must be an object", "input", undefined);
  }

  const allowedRepositoryRoots = stringArrayValue(rawContext.allowedRepositoryRoots);
  if (rawContext.allowedRepositoryRoots !== undefined && allowedRepositoryRoots === undefined) {
    return failure("INVALID_CONTEXT", "git.getRepositoryStatus context.allowedRepositoryRoots must be a string array", "input", undefined);
  }

  const grantedPermissions = stringArrayValue(rawContext.grantedPermissions);
  if (rawContext.grantedPermissions !== undefined && grantedPermissions === undefined) {
    return failure("INVALID_CONTEXT", "git.getRepositoryStatus context.grantedPermissions must be a string array", "input", undefined);
  }

  const auditMetadata = isRecord(rawContext.auditMetadata) ? rawContext.auditMetadata : undefined;
  if (rawContext.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "git.getRepositoryStatus context.auditMetadata must be an object", "input", undefined);
  }

  return {
    runtimeId: stringValue(rawContext.runtimeId),
    sessionId: stringValue(rawContext.sessionId),
    invocationId: stringValue(rawContext.invocationId),
    dryRun: booleanValue(rawContext.dryRun),
    guard:
      guard === undefined
        ? undefined
        : {
            allowed: booleanValue(guard.allowed),
            accepted: booleanValue(guard.accepted),
            reason: stringValue(guard.reason),
          },
    allowedRepositoryRoots,
    grantedPermissions: grantedPermissions as readonly GitGetRepositoryStatusPermission[] | undefined,
    auditMetadata,
  };
}

function normalizeRepositoryPath(
  repositoryPath: unknown,
  context: GitGetRepositoryStatusContext | undefined,
): string | GitGetRepositoryStatusResult {
  const normalized = stringValue(repositoryPath)?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_REPOSITORY_PATH",
      "git.getRepositoryStatus requires target.repositoryPath",
      "input",
      context,
      stringValue(repositoryPath),
    );
  }

  return normalized;
}

function normalizePorcelainVersion(
  porcelainVersion: unknown,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath: string,
): "v1" | "v2" | GitGetRepositoryStatusResult {
  const normalized = stringValue(porcelainVersion)?.trim();
  if (normalized === undefined || normalized === "" || normalized === "v1") {
    return "v1";
  }

  if (normalized === "v2") {
    return "v2";
  }

  return failure(
    "INVALID_PORCELAIN_VERSION",
    "git.getRepositoryStatus target.porcelainVersion must be v1 or v2",
    "input",
    context,
    repositoryPath,
  );
}

function normalizeTarget(
  target: unknown,
  context: GitGetRepositoryStatusContext,
): GitGetRepositoryStatusTarget | GitGetRepositoryStatusResult {
  if (target !== undefined && !isRecord(target)) {
    return failure("INVALID_ARGUMENT", "git.getRepositoryStatus target must be an object", "input", context);
  }
  const targetRecord = isRecord(target) ? target : {};

  const repositoryPath = normalizeRepositoryPath(targetRecord.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const porcelainVersion = normalizePorcelainVersion(targetRecord.porcelainVersion, context, repositoryPath);
  if (typeof porcelainVersion === "object") {
    return porcelainVersion;
  }

  return {
    repositoryPath,
    includeBranch: targetRecord.includeBranch === false ? false : true,
    includeUntracked: targetRecord.includeUntracked === false ? false : true,
    porcelainVersion,
  };
}

function normalizeTimeout(timeoutMs: unknown, context: GitGetRepositoryStatusContext, repositoryPath: string): number | undefined | GitGetRepositoryStatusResult {
  if (timeoutMs === undefined) {
    return undefined;
  }
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > gitGetRepositoryStatusDescriptor.maxTimeoutMs
  ) {
    return failure(
      "INVALID_TIMEOUT",
      `git.getRepositoryStatus timeoutMs must be an integer from 1 to ${gitGetRepositoryStatusDescriptor.maxTimeoutMs}`,
      "input",
      context,
      repositoryPath,
    );
  }
  return timeoutMs;
}

function normalizeRequest(request: unknown): NormalizedRequest | GitGetRepositoryStatusResult {
  if (request !== undefined && !isRecord(request)) {
    return failure("INVALID_ARGUMENT", "git.getRepositoryStatus request must be an object", "input", undefined);
  }
  const requestRecord = isRecord(request) ? request : {};
  const context = normalizeContext(requestRecord.context);
  if ("ok" in context) {
    return context;
  }

  const target = normalizeTarget(requestRecord.target, context);
  if ("ok" in target) {
    return target;
  }

  const timeoutMs = normalizeTimeout(requestRecord.timeoutMs, context, target.repositoryPath);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  return { target, context, timeoutMs };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(repositoryPath: string, context: GitGetRepositoryStatusContext | undefined): GitGetRepositoryStatusResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "git.getRepositoryStatus target repository is outside the allowed repository roots",
    "scope",
    context,
    repositoryPath,
  );
}

function ensurePermissions(
  repositoryPath: string,
  context: GitGetRepositoryStatusContext | undefined,
): GitGetRepositoryStatusResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = gitGetRepositoryStatusDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `git.getRepositoryStatus is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

function ensureGovernance(
  repositoryPath: string,
  context: GitGetRepositoryStatusContext,
): GitGetRepositoryStatusResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  if (context.guard?.allowed === true || context.guard?.accepted === true) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "git.getRepositoryStatus requires an affirmative runtime guard for real execution",
    "governance",
    context,
    repositoryPath,
  );
}

function providerArgs(target: GitGetRepositoryStatusTarget): readonly string[] {
  return [
    "status",
    `--porcelain=${target.porcelainVersion ?? gitGetRepositoryStatusDescriptor.defaultPorcelainVersion}`,
    "--branch",
    ...(target.includeUntracked === false ? ["--untracked-files=no"] : []),
  ];
}

function commandPreview(target: GitGetRepositoryStatusTarget): readonly string[] {
  return ["git", "-C", target.repositoryPath, ...providerArgs(target)];
}

const gitRepositoryStatusRuntimeEntry: GitRepositoryStatusRuntimeEntry = {
  owner: "runtime",
  port: "BaseToolExecutorPort.git.runGit",
  method: "runGit",
  binary: "git",
  argvMode: "fixed-status-read",
  allowedSubcommand: "status",
};

const gitRepositoryStatusRisk: GitRepositoryStatusRisk = {
  category: "read-only-inspection",
  riskLevel: "normal",
  mutatesRepository: false,
  mutatesWorkingTree: false,
  spawnsProcess: true,
  requiresTapApproval: true,
  runtimeOwnsExecution: true,
};

function gitRepositoryStatusPlan(
  normalized: NormalizedRequest,
  dispatch: GitGetRepositoryStatusPlan["dispatch"],
  dryRun: boolean,
): GitGetRepositoryStatusPlan {
  return {
    toolId: gitGetRepositoryStatusDescriptor.toolId,
    capability: gitGetRepositoryStatusDescriptor.capability,
    runtimeId: runtimeId(normalized.context),
    invocationId: invocationId(normalized.context),
    repositoryPath: normalized.target.repositoryPath,
    gitArgs: providerArgs(normalized.target),
    commandPreview: commandPreview(normalized.target),
    porcelainVersion: normalized.target.porcelainVersion ?? gitGetRepositoryStatusDescriptor.defaultPorcelainVersion,
    includeUntracked: normalized.target.includeUntracked !== false,
    timeoutMs: normalized.timeoutMs ?? gitGetRepositoryStatusDescriptor.defaultTimeoutMs,
    requiredPermissions: gitGetRepositoryStatusDescriptor.permissionsRequired,
    runtimeEntry: gitRepositoryStatusRuntimeEntry,
    risk: gitRepositoryStatusRisk,
    dispatch,
    dryRun,
    outputEnvelope: {
      stdoutPreview: "",
      stderrPreview: "",
      parsed: false,
    },
    audit: {
      guard: "git-status-runtime-guard",
      event: "basicTool.git.getRepositoryStatus.planned",
      metadata: normalized.context.auditMetadata ?? {},
    },
  };
}

function parseV1Branch(line: string, envelope: { branch?: string; upstream?: string; ahead?: number; behind?: number }): void {
  const content = line.slice(3).trim();
  const statusMatch = content.match(/\[(.+)\]$/u);
  const withoutStatus = statusMatch === null ? content : content.slice(0, statusMatch.index).trim();
  const [branch, upstream] = withoutStatus.split("...");
  if (branch !== undefined && branch.trim().length > 0) {
    envelope.branch = branch.trim();
  }
  if (upstream !== undefined && upstream.trim().length > 0) {
    envelope.upstream = upstream.trim();
  }
  const status = statusMatch?.[1] ?? "";
  const ahead = status.match(/ahead (\d+)/u)?.[1];
  const behind = status.match(/behind (\d+)/u)?.[1];
  if (ahead !== undefined) envelope.ahead = Number.parseInt(ahead, 10);
  if (behind !== undefined) envelope.behind = Number.parseInt(behind, 10);
}

function parseV1Entry(line: string): GitRepositoryStatusEntry | undefined {
  if (line.length < 4 || line.startsWith("##")) {
    return undefined;
  }
  const indexStatus = line[0] ?? " ";
  const workingTreeStatus = line[1] ?? " ";
  const rawPath = line.slice(3).trim();
  if (rawPath.length === 0) {
    return undefined;
  }
  const renameParts = rawPath.split(" -> ");
  if (renameParts.length === 2 && renameParts[0] !== undefined && renameParts[1] !== undefined) {
    return { path: renameParts[1], originalPath: renameParts[0], indexStatus, workingTreeStatus };
  }
  return { path: rawPath, indexStatus, workingTreeStatus };
}

function parseV2Entry(line: string): GitRepositoryStatusEntry | undefined {
  if (line.startsWith("? ")) {
    const path = line.slice(2).trim();
    return path.length === 0 ? undefined : { path, indexStatus: "?", workingTreeStatus: "?" };
  }
  if (line.startsWith("! ")) {
    const path = line.slice(2).trim();
    return path.length === 0 ? undefined : { path, indexStatus: "!", workingTreeStatus: "!" };
  }
  const parts = line.split(" ");
  if ((parts[0] === "1" || parts[0] === "u") && parts[1] !== undefined) {
    const path = parts.slice(8).join(" ").trim();
    if (path.length === 0) {
      return undefined;
    }
    return { path, indexStatus: parts[1][0] ?? " ", workingTreeStatus: parts[1][1] ?? " " };
  }
  if (parts[0] === "2" && parts[1] !== undefined) {
    const tabSplit = line.split("\t");
    const paths = tabSplit.length > 1 ? tabSplit.slice(1) : [parts.slice(9).join(" ").trim()];
    const path = paths[0]?.trim() ?? "";
    if (path.length === 0) {
      return undefined;
    }
    const originalPath = paths[1]?.trim();
    return {
      path,
      originalPath: originalPath === undefined || originalPath.length === 0 ? undefined : originalPath,
      indexStatus: parts[1][0] ?? " ",
      workingTreeStatus: parts[1][1] ?? " ",
    };
  }
  return undefined;
}

export function parseGitRepositoryStatus(stdout: string, porcelainVersion: "v1" | "v2" = "v1"): GitRepositoryStatusEnvelope {
  const envelope: { branch?: string; upstream?: string; ahead?: number; behind?: number; entries: GitRepositoryStatusEntry[] } = {
    entries: [],
  };

  for (const line of stdout.split(/\r?\n/u)) {
    if (line.length === 0) {
      continue;
    }
    if (porcelainVersion === "v1") {
      if (line.startsWith("## ")) {
        parseV1Branch(line, envelope);
        continue;
      }
      const entry = parseV1Entry(line);
      if (entry !== undefined) envelope.entries.push(entry);
      continue;
    }

    if (line.startsWith("# branch.head ")) {
      envelope.branch = line.slice("# branch.head ".length).trim();
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      envelope.upstream = line.slice("# branch.upstream ".length).trim();
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const ahead = line.match(/\+(\d+)/u)?.[1];
      const behind = line.match(/-(\d+)/u)?.[1];
      if (ahead !== undefined) envelope.ahead = Number.parseInt(ahead, 10);
      if (behind !== undefined) envelope.behind = Number.parseInt(behind, 10);
      continue;
    }
    if (line.startsWith("#")) {
      continue;
    }
    const entry = parseV2Entry(line);
    if (entry !== undefined) envelope.entries.push(entry);
  }

  return envelope;
}

function dryRunSuccess(
  normalized: NormalizedRequest,
): GitGetRepositoryStatusResult {
  const plan = gitRepositoryStatusPlan(normalized, "dry-run", true);
  return {
    ok: true,
    toolId: gitGetRepositoryStatusDescriptor.toolId,
    plan,
    output: {
      kind: "agentCore.basicTool.git.getRepositoryStatus",
      target: normalized.target,
      runtimeEntry: gitRepositoryStatusRuntimeEntry,
      risk: gitRepositoryStatusRisk,
      gitArgs: plan.gitArgs,
      commandPreview: plan.commandPreview,
      timeoutMs: plan.timeoutMs,
      dryRun: true,
      executionBlocked: true,
      providerCalled: false,
      permissionsRequired: gitGetRepositoryStatusDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        entries: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.git.getRepositoryStatus.dryRun", normalized.context, normalized.target.repositoryPath, {
        includeBranch: normalized.target.includeBranch,
        includeUntracked: normalized.target.includeUntracked,
        porcelainVersion: normalized.target.porcelainVersion,
      }),
    ],
    events: ["basicTool.git.getRepositoryStatus.dryRun"],
  };
}

export function planGitRepositoryStatusRead(request: GitGetRepositoryStatusRequest = {}): GitGetRepositoryStatusResult {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) {
    return normalized;
  }

  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  return dryRunSuccess(normalized);
}

export async function executeGitRepositoryStatus(
  request: GitGetRepositoryStatusRequest = {},
): Promise<GitGetRepositoryStatusResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) {
    return normalized;
  }

  const scopeFailure = ensureScope(normalized.target.repositoryPath, normalized.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(normalized.target.repositoryPath, normalized.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const governanceFailure = ensureGovernance(normalized.target.repositoryPath, normalized.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  if (dryRunEnabled(normalized.context)) {
    return dryRunSuccess(normalized);
  }

  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "git.getRepositoryStatus requires runtime.execEngine.git.runGit for real execution",
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
    const resultEnvelope = parseGitRepositoryStatus(providerResult.stdout, normalized.target.porcelainVersion);
    const plan = gitRepositoryStatusPlan(normalized, "runtime-git-executor", false);
    return {
      ok: true,
      toolId: gitGetRepositoryStatusDescriptor.toolId,
      plan,
      output: {
        kind: "agentCore.basicTool.git.getRepositoryStatus",
        target: normalized.target,
        runtimeEntry: gitRepositoryStatusRuntimeEntry,
        risk: gitRepositoryStatusRisk,
        gitArgs: plan.gitArgs,
        commandPreview: plan.commandPreview,
        timeoutMs: plan.timeoutMs,
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        exitCode: providerResult.exitCode,
        stdout: providerResult.stdout,
        stderr: providerResult.stderr,
        permissionsRequired: gitGetRepositoryStatusDescriptor.permissionsRequired,
        unsafeSideEffects: false,
        resultEnvelope,
      },
      audit: [
        auditEvent("agentCore.basicTool.git.getRepositoryStatus.executed", normalized.context, normalized.target.repositoryPath, {
          exitCode: providerResult.exitCode,
          porcelainVersion: normalized.target.porcelainVersion,
        }),
      ],
      events: ["basicTool.git.getRepositoryStatus.executed"],
    };
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "git.getRepositoryStatus provider failed",
      "provider",
      normalized.context,
      normalized.target.repositoryPath,
    );
  }
}
