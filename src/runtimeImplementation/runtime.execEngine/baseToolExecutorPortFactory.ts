/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / semantic basetool executor port 工厂。
 * 核心目的：从 runtime context 构造 BaseToolExecutorPort 契约，让 semantic basetool 通过注入端口接触宿主能力。
 * 边界：承托和治理运行态，不在 factory 内实现单个工具的高层语义。
 * 对接：服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：真实可用端口和稳定 unavailable fallback 必须可区分，避免 readiness 把缺 adapter 的工具误报为 ready。
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

import type {
  BaseToolExecutorNamespace,
  BaseToolExecutorPort,
  BaseToolExecutorResult,
} from "../../basetool/types.js";
import { getSemanticBaseToolDefinition, listSemanticBaseToolDefinitions } from "../../basetool/catalog.js";
import { sandbox, type BaseToolPolicyProfile, type SandboxSpec } from "../runtimeAgentManifest.js";
import type { SandboxRuntimePrepareResult } from "../runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  runSandboxCommand,
  type SandboxRemoteWorkerAdapter,
} from "../runtime.sandboxPlane/sandboxCommandRunner.js";
import type {
  SandboxExecutionProviderPort,
  SandboxPolicyMiddlewareAuditEvent,
} from "../runtime.sandboxPlane/sandboxPolicyMiddleware.js";
import {
  createMcpRuntimeAdapter,
  type McpRuntimeServerProfile,
} from "./mcpRuntimeAdapter.js";
import { normalizeToolCwd, normalizeWorkspacePath, workspacePathMetadata, workspaceRelativePath } from "./workspacePathPolicy.js";

export type RuntimeBaseToolExecutorEvent = {
  type: string;
  runtimeId: string;
  sessionId: string;
  portPath: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeBaseToolExecutorPolicy = {
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  allowedWriteRoots?: readonly string[];
  allowShellExecution?: boolean;
  allowGitExecution?: boolean;
  allowProcessExecution?: boolean;
  allowFilesystemWrite?: boolean;
  allowFilesystemDelete?: boolean;
  allowRipgrep?: boolean;
  allowNetworkFetch?: boolean;
  allowNetworkSearch?: boolean;
};

export type RuntimeBaseToolExecutorResourceLimits = {
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxReadBytes?: number;
  maxListEntries?: number;
};

export type RuntimeBaseToolExecutorSandbox = {
  providerFamily?: string;
  profile?: string;
  isolationLevel?: string;
  ready?: boolean;
  policyProfile?: string;
  mountPolicy?: {
    readonlyRoot?: boolean;
    allowedWriteRoots?: readonly string[];
  };
  networkPolicy?: {
    outbound?: string;
  };
  probe?: {
    status?: string;
    publicSafeMessage?: string;
  };
  smoke?: {
    status?: string;
    publicSafeMessage?: string;
  };
};

export type RuntimeBaseToolExecutorContext = {
  runtimeId: string;
  sessionId: string;
  policy?: RuntimeBaseToolExecutorPolicy;
  resourceLimits?: RuntimeBaseToolExecutorResourceLimits;
  sandbox?: RuntimeBaseToolExecutorSandbox;
  sandboxSpec?: SandboxSpec;
  preparedSandbox?: SandboxRuntimePrepareResult;
  policyProfile?: BaseToolPolicyProfile;
  sandboxProvider?: SandboxExecutionProviderPort;
  sandboxAudit?: (event: SandboxPolicyMiddlewareAuditEvent) => Promise<void> | void;
  remoteSandboxWorker?: SandboxRemoteWorkerAdapter;
  mcpServers?: readonly McpRuntimeServerProfile[];
  environment?: Readonly<Record<string, string | undefined>>;
  adapters?: Partial<BaseToolExecutorPort>;
  emitEvent?: (event: RuntimeBaseToolExecutorEvent) => void;
};

export const baseToolExecutorPortFactoryDescriptor = {
  surface: "runtime.execEngine.baseToolExecutorPortFactory",
  output: "BaseToolExecutorPort",
  classificationAxis: "semantic-basetool-runtime-port",
  implementedAdapters: [
    "artifact.store",
    "filesystem.readText",
    "filesystem.writeText",
    "filesystem.deletePath",
    "filesystem.list",
    "shell.run",
    "process.run",
    "process.wait",
    "process.kill",
    "git.runGit",
    "search.ripgrep",
    "network.fetch",
    "plan.update",
    "tool.discover",
    "tool.describe",
    "sandbox.run",
    "output.truncate",
  ],
} as const;

const unavailablePortMarker = "__praxisUnavailablePortFallback";

type RuntimePortFunction = ((request: any) => any) & {
  __praxisUnavailablePortFallback?: true;
};

function ok(output: unknown, metadata?: Readonly<Record<string, unknown>>): BaseToolExecutorResult {
  return { ok: true, output, value: output, metadata };
}

function fail(code: string, message: string, metadata?: Readonly<Record<string, unknown>>): BaseToolExecutorResult {
  return { ok: false, error: { code, message, publicSafe: true }, metadata };
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function unavailable(portPath: string): BaseToolExecutorResult {
  return fail("PROVIDER_UNAVAILABLE", `${portPath} is not implemented by the semantic basetool runtime port factory.`);
}

function markUnavailableFallback(fn: (request: any) => any): RuntimePortFunction {
  const marked = fn as RuntimePortFunction;
  marked[unavailablePortMarker] = true;
  return marked;
}

function isUnavailableFallback(value: unknown): boolean {
  return typeof value === "function" && (value as RuntimePortFunction)[unavailablePortMarker] === true;
}

function workspaceRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.resolve(context.policy?.workspaceRoot ?? process.cwd());
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSecretPath(candidate: string): boolean {
  return path.basename(candidate) === ".env" || path.basename(candidate).startsWith(".env.");
}

function resolvePath(context: RuntimeBaseToolExecutorContext, inputPath: unknown): BaseToolExecutorResult<string> {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    return fail("INVALID_PATH", "A non-empty path is required.");
  }
  const root = workspaceRoot(context);
  const absolute = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(root, inputPath);
  const profile = policyProfileForContext(context);
  const allowedRoots = (context.policy?.allowedRoots ?? [root]).map((item) => path.resolve(item));
  if (!allowedRoots.some((allowedRoot) => isInside(allowedRoot, absolute))) {
    return ok(absolute, {
      workspaceRoot: root,
      allowedRoots,
      requestedPath: inputPath,
      normalizedPath: absolute,
      workspaceOutsideAllowedRoots: true,
      policyProfile: profile,
    });
  }
  if (profile !== "yolo" && isSecretPath(absolute)) {
    return fail("SECRET_PATH_DENIED", "Secret environment files require explicit runtime approval before model-visible tools may access them.", {
      needsApproval: true,
      path: inputPath,
      policyProfile: profile,
    });
  }
  return ok(absolute);
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let used = 0;
  let output = "";
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (used + size > maxBytes) break;
    output += char;
    used += size;
  }
  return output;
}

function truncate(context: RuntimeBaseToolExecutorContext, value: string, requestedMaxBytes?: unknown): string {
  const requestMax = typeof requestedMaxBytes === "number" && Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.floor(requestedMaxBytes)
    : undefined;
  const max = requestMax ?? context.resourceLimits?.maxOutputBytes ?? 256_000;
  return truncateUtf8(value, max);
}

function emit(context: RuntimeBaseToolExecutorContext, portPath: string, type: string, metadata?: Readonly<Record<string, unknown>>): void {
  context.emitEvent?.({ type, runtimeId: context.runtimeId, sessionId: context.sessionId, portPath, metadata });
}

function policyProfileForContext(context: RuntimeBaseToolExecutorContext): BaseToolPolicyProfile {
  return context.policyProfile ?? (typeof context.sandbox?.policyProfile === "string" ? context.sandbox.policyProfile as BaseToolPolicyProfile : "standard");
}

function strongSandboxFamily(value: string | undefined): boolean {
  return value === "linux-bubblewrap" || value === "macos-containerization" || value === "windows-sandbox" || value === "remote-worker";
}

function legacySandboxSpec(value: RuntimeBaseToolExecutorSandbox | undefined, profile: BaseToolPolicyProfile): SandboxSpec | undefined {
  if (value === undefined) return undefined;
  if (value.providerFamily === "host-observed") return sandbox.hostObserved();
  if (value.providerFamily === "workspace-policy") return sandbox.workspaceOnly();
  if (value.providerFamily === "linux-bubblewrap") return profile === "yolo" ? sandbox.linuxBubblewrapWorkspaceWrite() : sandbox.linuxBubblewrap();
  if (value.providerFamily === "macos-containerization") return sandbox.macosContainerization();
  if (value.providerFamily === "windows-sandbox") return sandbox.windowsSandbox();
  if (value.providerFamily === "remote-worker") return sandbox.remoteWorker();
  return undefined;
}

function legacyPreparedSandbox(value: RuntimeBaseToolExecutorSandbox | undefined): SandboxRuntimePrepareResult | undefined {
  if (value === undefined || value.providerFamily === undefined || value.profile === undefined || value.ready === undefined || value.probe === undefined) return undefined;
  return {
    providerFamily: value.providerFamily as SandboxRuntimePrepareResult["providerFamily"],
    profile: value.profile as SandboxRuntimePrepareResult["profile"],
    ready: value.ready,
    probe: value.probe as SandboxRuntimePrepareResult["probe"],
    smoke: value.smoke as SandboxRuntimePrepareResult["smoke"],
    events: [],
  };
}

function sandboxModeForContext(context: RuntimeBaseToolExecutorContext): "none" | "workspace-rollback" | "isolated" {
  const profile = policyProfileForContext(context);
  const explicitProviderFamily = context.sandboxSpec?.providerFamily ?? context.sandbox?.providerFamily;
  const prepared = context.preparedSandbox ?? legacyPreparedSandbox(context.sandbox);
  if (strongSandboxFamily(explicitProviderFamily)) {
    return prepared?.ready === true ? "isolated" : "workspace-rollback";
  }
  if (profile === "yolo") return "workspace-rollback";
  return "isolated";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function approvedByRuntimeContext(value: unknown): boolean {
  const context = isRecord(value) ? value : {};
  const approval = isRecord(context.approval) ? context.approval : {};
  return approval.accepted === true && approval.runtimeApproved === true;
}

function resolveCommandCwd(context: RuntimeBaseToolExecutorContext, inputCwd: string | undefined): BaseToolExecutorResult<string> {
  const root = workspaceRoot(context);
  const profile = policyProfileForContext(context);
  if (profile === "bapr") {
    return ok(path.resolve(inputCwd === undefined || inputCwd.trim().length === 0 ? root : inputCwd), {
      workspaceRoot: root,
      allowedRoots: ["*"],
      mappingSource: "bapr",
    });
  }
  const result = normalizeToolCwd(inputCwd, {
    workspaceRoot: root,
    allowedRoots: context.policy?.allowedRoots ?? [root],
  });
  if (!result.ok) return fail(result.reason, result.message, workspacePathMetadata(result, "cwd"));
  return ok(result.normalizedPath, workspacePathMetadata(result, "cwd"));
}

function resolveCommandPathArgument(context: RuntimeBaseToolExecutorContext, inputPath: string | undefined): BaseToolExecutorResult<string> {
  const root = workspaceRoot(context);
  const profile = policyProfileForContext(context);
  if (profile === "bapr") {
    return ok(inputPath === undefined || inputPath.trim().length === 0 ? "." : inputPath, {
      workspaceRoot: root,
      allowedRoots: ["*"],
      mappingSource: "bapr",
    });
  }
  const result = normalizeWorkspacePath(inputPath ?? ".", {
    workspaceRoot: root,
    allowedRoots: context.policy?.allowedRoots ?? [root],
    kind: "path",
  });
  if (!result.ok) return fail(result.reason, result.message, workspacePathMetadata(result, "path"));
  const relative = workspaceRelativePath(result.normalizedPath, root);
  return ok(relative ?? result.normalizedPath, workspacePathMetadata(result, "path"));
}

function secretPathsAreHidden(context: RuntimeBaseToolExecutorContext): boolean {
  const profile = policyProfileForContext(context);
  return profile !== "bapr" && profile !== "yolo";
}

function parseProcessId(value: unknown): number | undefined {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/u.test(text)) return undefined;
  const pid = Number(text);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EPERM";
  }
}

function adapter(context: RuntimeBaseToolExecutorContext, namespace: string, method: string): ((request: any) => any) | undefined {
  return context.adapters?.[namespace]?.[method];
}

function withAdapter(context: RuntimeBaseToolExecutorContext, namespace: string, method: string, fallback: (request: any) => unknown): (request: any) => Promise<BaseToolExecutorResult> {
  return async (request: any) => {
    const delegated = adapter(context, namespace, method);
    if (delegated !== undefined) return delegated(request);
    const output = await fallback(request);
    return output && typeof output === "object" && "ok" in output ? output as BaseToolExecutorResult : ok(output);
  };
}

function createFilesystemExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    readText: withAdapter(context, "filesystem", "readText", async (request) => {
      const resolved = resolvePath(context, request?.path ?? request?.targetPath);
      if (!resolved.ok) return resolved;
      let content: string;
      try {
        content = await readFile(String(resolved.output), "utf8");
      } catch (error) {
        const code = nodeErrorCode(error);
        if (code === "ENOENT" || code === "ENOTDIR") {
          return fail("FILE_NOT_FOUND", `File ${request?.path ?? request?.targetPath} was not found.`, {
            path: resolved.output,
          });
        }
        if (code === "EISDIR") {
          return fail("PATH_IS_DIRECTORY", `Path ${request?.path ?? request?.targetPath} is a directory, not a file.`, {
            path: resolved.output,
          });
        }
        return fail("FILE_READ_FAILED", error instanceof Error ? error.message : "File read failed.", {
          path: resolved.output,
        });
      }
      return ok({ content: truncate(context, content, request?.maxBytes), path: resolved.output }, resolved.metadata);
    }),
    writeText: withAdapter(context, "filesystem", "writeText", async (request) => {
      if (context.policy?.allowFilesystemWrite === false) return fail("FILESYSTEM_WRITE_DISABLED", "Filesystem writes are disabled by runtime policy.");
      const resolved = resolvePath(context, request?.path ?? request?.targetPath);
      if (!resolved.ok) return resolved;
      await mkdir(path.dirname(String(resolved.output)), { recursive: true });
      await writeFile(String(resolved.output), String(request?.content ?? ""), "utf8");
      return { path: resolved.output, bytesWritten: Buffer.byteLength(String(request?.content ?? "")) };
    }),
    deletePath: withAdapter(context, "filesystem", "deletePath", async (request) => {
      if (context.policy?.allowFilesystemDelete !== true) return fail("FILESYSTEM_DELETE_DISABLED", "Filesystem deletes require explicit runtime policy.");
      const resolved = resolvePath(context, request?.path ?? request?.targetPath);
      if (!resolved.ok) return resolved;
      await rm(String(resolved.output), { recursive: true, force: true });
      return { path: resolved.output, deleted: true };
    }),
    list: withAdapter(context, "filesystem", "list", async (request) => {
      const resolved = resolvePath(context, request?.path ?? ".");
      if (!resolved.ok) return resolved;
      const entries = (await readdir(String(resolved.output)))
        .filter((entry) => !secretPathsAreHidden(context) || !isSecretPath(entry));
      return { path: resolved.output, entries: entries.slice(0, context.resourceLimits?.maxListEntries ?? 1000) };
    }),
  };
}

async function runCommand(
  context: RuntimeBaseToolExecutorContext,
  command: string,
  args: readonly string[] = [],
  cwd?: string,
  input: {
    toolId?: string;
    invocationId?: string;
    shellScript?: boolean;
    timeoutMs?: number;
    network?: "allow" | "deny" | "approval" | "provider-policy";
    approved?: boolean;
  } = {},
): Promise<BaseToolExecutorResult> {
  const profile = policyProfileForContext(context);
  const spec = context.sandboxSpec ?? legacySandboxSpec(context.sandbox, profile);
  const program = input.shellScript === true ? "sh" : command;
  const finalArgs = input.shellScript === true ? ["-lc", command] : [...args];
  const resolvedCwd = resolveCommandCwd(context, cwd);
  if (!resolvedCwd.ok) return resolvedCwd;
  const commandCwd = String(resolvedCwd.output);
  const root = workspaceRoot(context);
  const approvedWriteRoots = input.approved === true
    ? context.policy?.allowedWriteRoots ?? [root]
    : context.policy?.allowedWriteRoots;
  if (spec !== undefined) {
    const result = await runSandboxCommand({
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      invocationId: input.invocationId ?? `${context.sessionId}:${input.toolId ?? "command"}:${Date.now()}`,
      toolId: input.toolId ?? "process.run",
      command: program,
      args: finalArgs,
      cwd: commandCwd,
      env: context.environment,
      timeoutMs: input.timeoutMs ?? context.resourceLimits?.timeoutMs,
      maxOutputBytes: context.resourceLimits?.maxOutputBytes,
      sandbox: spec,
      preparedSandbox: context.preparedSandbox ?? legacyPreparedSandbox(context.sandbox),
      policyProfile: profile,
      sandboxMode: sandboxModeForContext(context),
      filesystem: {
        workspaceRoot: root,
        allowedReadRoots: context.policy?.allowedRoots ?? [root],
        ...(approvedWriteRoots === undefined ? {} : { allowedWriteRoots: approvedWriteRoots }),
        ...(input.approved === true ? { readonlyRoot: false } : {}),
      },
      network: input.network,
    }, {
      remoteWorker: context.remoteSandboxWorker,
      sandboxProvider: context.sandboxProvider,
      audit: context.sandboxAudit,
    });
    if (!result.ok) {
      return fail(result.error.code, result.error.message, {
        sandbox: result.plan,
        denial: result.error.denial,
        rollback: result.rollback,
      });
    }
    return ok({
      exitCode: result.exitCode,
      stdout: truncate(context, result.stdout),
      stderr: truncate(context, result.stderr),
    }, {
      ...resolvedCwd.metadata,
      sandbox: result.plan,
      rollback: result.rollback,
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(program, finalArgs, {
      cwd: commandCwd,
      env: { ...process.env, ...(context.environment ?? {}) },
      shell: false,
    });
    const timeoutMs = input.timeoutMs ?? context.resourceLimits?.timeoutMs;
    const timeout = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.pid !== undefined && processExists(child.pid)) child.kill("SIGKILL");
        }, 1_000).unref();
        resolve(fail("COMMAND_TIMEOUT", `Command timed out after ${Math.floor(timeoutMs)}ms.`, {
          exitCode: 124,
          stdout: truncate(context, stdout),
          stderr: truncate(context, stderr),
          ...resolvedCwd.metadata,
        }));
      }, timeoutMs)
      : undefined;
    timeout?.unref();
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve(fail("PROCESS_SPAWN_FAILED", error.message));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve(ok({
      exitCode: exitCode ?? 0,
      stdout: truncate(context, stdout),
      stderr: truncate(context, stderr),
      }, resolvedCwd.metadata));
    });
  });
}

function createShellExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    run: withAdapter(context, "shell", "run", async (request) => {
      if (context.policy?.allowShellExecution === false) return fail("SHELL_EXECUTION_DISABLED", "Shell execution is disabled by runtime policy.");
      const command = String(request?.command ?? "");
      if (command.trim().length === 0) return fail("INVALID_COMMAND", "A non-empty command is required.");
      emit(context, "shell.run", "runtime.execEngine.shell.run");
      return runCommand(context, command, [], typeof request?.cwd === "string" ? request.cwd : undefined, {
        toolId: "shell.run",
        invocationId: typeof request?.toolCallId === "string" ? request.toolCallId : undefined,
        shellScript: true,
        timeoutMs: typeof request?.timeoutMs === "number" ? request.timeoutMs : undefined,
        approved: approvedByRuntimeContext(request?.context),
      });
    }),
  };
}

function createProcessExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    run: withAdapter(context, "process", "run", async (request) => {
      if (context.policy?.allowProcessExecution === false) return fail("PROCESS_EXECUTION_DISABLED", "Process execution is disabled by runtime policy.");
      return runCommand(context, String(request?.command ?? ""), Array.isArray(request?.args) ? request.args.map(String) : [], typeof request?.cwd === "string" ? request.cwd : undefined, {
        toolId: "process.run",
        invocationId: typeof request?.toolCallId === "string" ? request.toolCallId : undefined,
        timeoutMs: typeof request?.timeoutMs === "number" ? request.timeoutMs : undefined,
        approved: approvedByRuntimeContext(request?.context),
      });
    }),
    wait: withAdapter(context, "process", "wait", async (request) => {
      const pid = parseProcessId(request?.processId ?? request?.pid);
      if (pid === undefined) return fail("INVALID_PROCESS_ID", "process.wait requires a numeric processId.");
      const timeoutMs = typeof request?.timeoutMs === "number" && request.timeoutMs > 0 ? request.timeoutMs : 10_000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (!processExists(pid)) return { processId: String(pid), status: "exited", waitedMs: Date.now() - startedAt };
        await sleep(100);
      }
      return { processId: String(pid), status: "running", timedOut: true, waitedMs: Date.now() - startedAt };
    }),
    kill: withAdapter(context, "process", "kill", async (request) => {
      const pid = parseProcessId(request?.processId ?? request?.pid);
      if (pid === undefined) return fail("INVALID_PROCESS_ID", "process.kill requires a numeric processId.");
      const profile = policyProfileForContext(context);
      if (profile !== "bapr" && profile !== "yolo" && !approvedByRuntimeContext(request?.context)) {
        return fail("PROCESS_KILL_APPROVAL_REQUIRED", `process.kill requires runtime approval under ${profile}.`, {
          needsApproval: true,
          approvalScopeKey: `process.kill:process:${pid}`,
          approvalScopeKind: "process",
          processId: String(pid),
          policyProfile: profile,
        });
      }
      const signal = typeof request?.signal === "string" && request.signal.trim().length > 0 ? request.signal : "SIGTERM";
      try {
        process.kill(pid, signal);
        return { processId: String(pid), signal, killed: true };
      } catch (error) {
        return fail("PROCESS_KILL_FAILED", error instanceof Error ? error.message : "process.kill failed", {
          processId: String(pid),
          signal,
        });
      }
    }),
  };
}

function createGitExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    runGit: withAdapter(context, "git", "runGit", async (request) => {
      if (context.policy?.allowGitExecution === false) return fail("GIT_EXECUTION_DISABLED", "Git execution is disabled by runtime policy.");
      return runCommand(context, "git", Array.isArray(request?.args) ? request.args.map(String) : ["status", "--short"], typeof request?.cwd === "string" ? request.cwd : undefined, {
        toolId: "git.runGit",
        invocationId: typeof request?.toolCallId === "string" ? request.toolCallId : undefined,
      });
    }),
  };
}

function createSearchExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    ripgrep: withAdapter(context, "search", "ripgrep", async (request) => {
      if (context.policy?.allowRipgrep === false) return fail("RIPGREP_DISABLED", "Ripgrep is disabled by runtime policy.");
      const query = String(request?.query ?? request?.pattern ?? "");
      if (query.trim().length === 0) return fail("INVALID_QUERY", "A non-empty query is required.");
      const searchTarget = resolveCommandPathArgument(context, typeof request?.cwd === "string" ? request.cwd : undefined);
      if (!searchTarget.ok) return searchTarget;
      const searchMetadata = searchTarget.metadata as { normalizedPath?: unknown } | undefined;
      if (secretPathsAreHidden(context) && typeof searchMetadata?.normalizedPath === "string" && isSecretPath(searchMetadata.normalizedPath)) {
        return fail("SECRET_PATH_DENIED", "Secret environment files require explicit runtime approval before model-visible tools may access them.", {
          needsApproval: true,
          path: request?.cwd,
          policyProfile: policyProfileForContext(context),
        });
      }
      const args = ["--line-number", "--no-heading"];
      if (typeof request?.glob === "string" && request.glob.trim().length > 0) args.push("--glob", request.glob);
      if (secretPathsAreHidden(context)) args.push("--glob", "!.env", "--glob", "!.env.*", "--glob", "!**/.env", "--glob", "!**/.env.*");
      args.push(query, String(searchTarget.value));
      return runCommand(context, "rg", args, workspaceRoot(context), {
        toolId: "file.search",
        invocationId: typeof request?.toolCallId === "string" ? request.toolCallId : undefined,
      });
    }),
  };
}

function createNetworkExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    fetch: withAdapter(context, "network", "fetch", async (request) => {
      if (context.policy?.allowNetworkFetch === false) return fail("NETWORK_FETCH_DISABLED", "Network fetch is disabled by runtime policy.");
      const url = String(request?.url);
      const profile = policyProfileForContext(context);
      const outbound = context.sandboxSpec?.networkPolicy?.outbound ?? context.sandbox?.networkPolicy?.outbound ?? "approval";
      let domain = "unknown-domain";
      try {
        domain = new URL(url).hostname.toLowerCase();
      } catch {
        return fail("INVALID_URL", "Network fetch requires a valid URL.");
      }
      const requiresApproval = profile !== "bapr" && profile !== "yolo" && (outbound === "deny" || outbound === "approval");
      if (requiresApproval && !approvedByRuntimeContext(request?.context)) {
        return fail("NETWORK_POLICY_DENIED", `Network access to ${domain} requires runtime approval under ${profile}.`, {
          needsApproval: true,
          approvalScopeKey: `web.fetch:domain:${domain}`,
          approvalScopeKind: "domain",
          domain,
          outbound,
          policyProfile: profile,
        });
      }
      const response = await fetch(url);
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: truncate(context, await response.text(), request?.maxBytes) };
    }),
    search: withUnavailableAdapter(context, "network", "search"),
    ground: withUnavailableAdapter(context, "network", "ground"),
    nativeWebSearch: withUnavailableAdapter(context, "network", "nativeWebSearch"),
  };
}

function createToolExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    discover: withAdapter(context, "tool", "discover", async (request) => {
      const query = typeof request?.query === "string" ? request.query.trim().toLowerCase() : undefined;
      const layer = typeof request?.layer === "string" ? request.layer.trim() : undefined;
      const tools = listSemanticBaseToolDefinitions()
        .filter((definition) => layer === undefined || layer.length === 0 || definition.layer === layer)
        .filter((definition) => {
          if (query === undefined || query.length === 0) return true;
          return [
            definition.toolId,
            definition.title,
            definition.description,
            definition.family,
            definition.group,
          ].some((item) => String(item).toLowerCase().includes(query));
        })
        .map((definition) => ({
          toolId: definition.toolId,
          title: definition.title,
          description: definition.description,
          layer: definition.layer,
          family: definition.family,
          group: definition.group,
          policyRisk: definition.policyRisk,
          runtimePorts: definition.runtimePorts,
        }));
      return { tools, total: tools.length };
    }),
    describe: withAdapter(context, "tool", "describe", async (request) => {
      const toolId = typeof request?.toolId === "string" ? request.toolId.trim() : "";
      if (toolId.length === 0) return fail("INVALID_TOOL_ID", "A non-empty toolId is required.");
      const definition = getSemanticBaseToolDefinition(toolId);
      if (definition === undefined) return fail("UNKNOWN_TOOL", `BaseTool ${toolId} is not registered.`);
      return {
        toolId: definition.toolId,
        title: definition.title,
        description: definition.description,
        layer: definition.layer,
        family: definition.family,
        group: definition.group,
        visibility: definition.visibility,
        riskLevel: definition.riskLevel,
        policyRisk: definition.policyRisk,
        permissionHints: definition.permissionHints,
        runtimePorts: definition.runtimePorts,
        inputSchema: definition.inputSchema,
        dependencies: definition.dependencies,
        toolSkill: definition.toolSkill,
        manual: definition.metadata?.profileDescriptionOverlay ?? definition.metadata ?? {},
      };
    }),
  };
}

function createUnavailableNamespace(namespace: string, methods: readonly string[]): BaseToolExecutorNamespace {
  return Object.fromEntries(methods.map((method) => [
    method,
    markUnavailableFallback(async () => unavailable(`${namespace}.${method}`)),
  ]));
}

function withUnavailableAdapter(
  context: RuntimeBaseToolExecutorContext,
  namespace: string,
  method: string,
): RuntimePortFunction {
  const delegated = adapter(context, namespace, method);
  if (delegated !== undefined) return delegated as RuntimePortFunction;
  return markUnavailableFallback(async () => unavailable(`${namespace}.${method}`));
}

function createMcpExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  const configured = context.mcpServers !== undefined && context.mcpServers.length > 0
    ? createMcpRuntimeAdapter({ servers: context.mcpServers })
    : undefined;
  const base = configured ?? createUnavailableNamespace("mcp", [
    "connect",
    "ping",
    "listTools",
    "call",
    "stream",
    "listResources",
    "readResource",
    "listPrompts",
    "getPrompt",
    "setRoots",
    "reportProgress",
    "createSamplingMessage",
    "elicit",
    "setLoggingLevel",
  ]);
  const callTool = base.callTool ?? base.call;
  const streamTool = base.streamTool ?? base.stream;
  return {
    ...base,
    ...(callTool === undefined ? {} : { call: callTool, callTool }),
    ...(streamTool === undefined ? {} : { stream: streamTool, streamTool }),
    ...(context.adapters?.mcp ?? {}),
  };
}

export function listRuntimeBaseToolImplementedPortPaths(
  context: Pick<RuntimeBaseToolExecutorContext, "adapters" | "mcpServers"> = {},
): readonly string[] {
  const ports = new Set<string>(baseToolExecutorPortFactoryDescriptor.implementedAdapters);
  if (context.mcpServers !== undefined && context.mcpServers.length > 0) {
    for (const portPath of [
      "mcp.connect",
      "mcp.call",
      "mcp.callTool",
      "mcp.listTools",
      "mcp.listResources",
      "mcp.readResource",
      "mcp.listPrompts",
      "mcp.getPrompt",
      "mcp.setRoots",
      "mcp.reportProgress",
      "mcp.createSamplingMessage",
      "mcp.elicit",
      "mcp.setLoggingLevel",
    ]) {
      ports.add(portPath);
    }
  }
  for (const [namespace, methods] of Object.entries(context.adapters ?? {})) {
    if (methods === undefined) continue;
    for (const [method, handler] of Object.entries(methods)) {
      if (!isUnavailableFallback(handler)) ports.add(`${namespace}.${method}`);
    }
  }
  return [...ports].sort();
}

export function createRuntimeBaseToolExecutorPort(
  context: RuntimeBaseToolExecutorContext,
): BaseToolExecutorPort {
  const port: BaseToolExecutorPort = {
    filesystem: createFilesystemExecutor(context),
    shell: createShellExecutor(context),
    process: createProcessExecutor(context),
    git: createGitExecutor(context),
    search: createSearchExecutor(context),
    network: createNetworkExecutor(context),
    web: createNetworkExecutor(context),
    mcp: createMcpExecutor(context),
    artifact: {
      store: withAdapter(context, "artifact", "store", async (request) => ({ artifactId: request?.artifactId ?? `artifact:${Date.now()}`, stored: true })),
    },
    plan: {
      update: withAdapter(context, "plan", "update", async (request) => ({ accepted: true, plan: request })),
    },
    userInteraction: {
      ask: withUnavailableAdapter(context, "userInteraction", "ask"),
    },
    context: createUnavailableNamespace("context", ["load"]),
    skill: createUnavailableNamespace("skill", ["load", "management", "summarize", "ripgrep"]),
    lsp: createUnavailableNamespace("lsp", ["inspectDiagnostics", "completeCode", "locateDefinition"]),
    debug: createUnavailableNamespace("debug", ["captureState", "collectLogs", "launch"]),
    computer: createUnavailableNamespace("computer", ["captureScreenshot", "keyboardAction", "pointerAction"]),
    media: createUnavailableNamespace("media", ["viewImage", "generateImage", "listenAudio", "generateVideo", "transformMedia"]),
    device: createUnavailableNamespace("device", ["requestPermission", "releasePermission"]),
    work: createUnavailableNamespace("work", ["read", "write"]),
    approval: createUnavailableNamespace("approval", ["request", "check"]),
    sandbox: {
      run: withAdapter(context, "sandbox", "run", async (request) => {
        const command = String(request?.command ?? "");
        if (command.trim().length === 0) return fail("INVALID_COMMAND", "sandbox.run requires a command.");
        return runCommand(context, command, Array.isArray(request?.args) ? request.args.map(String) : [], typeof request?.cwd === "string" ? request.cwd : undefined, {
          toolId: typeof request?.toolId === "string" ? request.toolId : "sandbox.run",
          invocationId: typeof request?.invocationId === "string" ? request.invocationId : undefined,
          network: request?.network === "allow" ? "allow" : undefined,
        });
      }),
    },
    output: {
      truncate: withAdapter(context, "output", "truncate", async (request) => ({ text: truncate(context, String(request?.text ?? "")) })),
    },
    tool: createToolExecutor(context),
  };
  for (const [namespace, methods] of Object.entries(context.adapters ?? {})) {
    port[namespace] = {
      ...(port[namespace] ?? {}),
      ...(methods ?? {}),
    };
  }
  return port;
}
