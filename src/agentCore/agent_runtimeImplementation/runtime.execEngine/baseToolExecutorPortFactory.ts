/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / baseTool executor port 工厂。
 * 核心目的：从 runtime context 构造完整 BaseToolExecutorPort，让 175 个 storage-owned baseTool handler 通过注入端口接触宿主能力。
 * 能力要求1：需要提供 filesystem、shell/process/git/ripgrep/network.fetch 以及 shell guard/observation 的第一批真实 runtime adapter。
 * 能力要求2：尚未实现的长连接、设备、媒体、模型原生搜索等能力必须返回稳定 PROVIDER_UNAVAILABLE。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type {
  BaseToolExecutorPort,
  BaseToolExecutorResult,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";

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
  adapters?: Partial<BaseToolExecutorPort>;
  emitEvent?: (event: RuntimeBaseToolExecutorEvent) => void;
};

export const baseToolExecutorPortFactoryDescriptor = {
  surface: "runtime.execEngine.baseToolExecutorPortFactory",
  output: "BaseToolExecutorPort",
  classificationAxis: "storage-family-group-toolId-through-catalog",
  implementedAdapters: [
    "filesystem.readText",
    "filesystem.writeText",
    "filesystem.deletePath",
    "filesystem.list",
    "shell.run",
    "process.run",
    "git.runGit",
    "search.ripgrep",
    "network.fetch",
    "shell.validateCommand",
    "shell.controlPermission",
    "shell.enforceSandbox",
    "shell.monitorExecution",
    "shell.captureOutput",
  ],
  unavailableCode: "PROVIDER_UNAVAILABLE",
  hostOwnsRealExecution: true,
} as const;

export function listRuntimeBaseToolImplementedPortPaths(
  context: Pick<RuntimeBaseToolExecutorContext, "adapters"> = {},
): readonly string[] {
  const portPaths = new Set<string>(baseToolExecutorPortFactoryDescriptor.implementedAdapters);
  const adapters = context.adapters as Readonly<Record<string, unknown>> | undefined;
  if (adapters === undefined) return [...portPaths].sort();

  for (const [namespace, adapter] of Object.entries(adapters)) {
    if (typeof adapter !== "object" || adapter === null) continue;
    for (const [method, value] of Object.entries(adapter as Readonly<Record<string, unknown>>)) {
      if (typeof value === "function") portPaths.add(`${namespace}.${method}`);
    }
  }

  return [...portPaths].sort();
}

function success<Output>(
  output: Output,
  events: readonly string[] = [],
  metadata?: Readonly<Record<string, unknown>>,
): BaseToolExecutorResult<Output> {
  return { ok: true, output, events, metadata };
}

function failure<Output>(
  code: string,
  message: string,
  events: readonly string[] = [],
): BaseToolExecutorResult<Output> {
  return {
    ok: false,
    error: {
      code,
      message,
      publicSafe: true,
    },
    events,
  };
}

function providerUnavailable<Output>(portPath: string): BaseToolExecutorResult<Output> {
  return failure(
    "PROVIDER_UNAVAILABLE",
    `${portPath} is not implemented by runtime.execEngine.baseToolExecutorPortFactory yet`,
    [`runtime.execEngine.baseToolExecutorPort.${portPath}.unavailable`],
  );
}

function adapterMethod(context: RuntimeBaseToolExecutorContext, portPath: string): unknown {
  const [namespace, method] = portPath.split(".");
  if (namespace === undefined || method === undefined) return undefined;
  const namespaceValue = (context.adapters as Readonly<Record<string, unknown>> | undefined)?.[namespace];
  if (typeof namespaceValue !== "object" || namespaceValue === null) return undefined;
  return (namespaceValue as Readonly<Record<string, unknown>>)[method];
}

function delegatedUnavailableMethod<Output>(
  context: RuntimeBaseToolExecutorContext,
  portPath: string,
): (_request: unknown) => Promise<BaseToolExecutorResult<Output>> {
  return async (request) => {
    const method = adapterMethod(context, portPath);
    if (typeof method === "function") {
      return await (method as (value: unknown) => Promise<BaseToolExecutorResult<Output>> | BaseToolExecutorResult<Output>)(request);
    }
    return providerUnavailable<Output>(portPath);
  };
}

async function callDelegated<Output>(
  context: RuntimeBaseToolExecutorContext,
  portPath: string,
  request: unknown,
): Promise<BaseToolExecutorResult<Output> | undefined> {
  const method = adapterMethod(context, portPath);
  if (typeof method !== "function") return undefined;
  return await (method as (value: unknown) => Promise<BaseToolExecutorResult<Output>> | BaseToolExecutorResult<Output>)(request);
}

function emit(context: RuntimeBaseToolExecutorContext, portPath: string, type: string, metadata?: Readonly<Record<string, unknown>>): void {
  context.emitEvent?.({
    type,
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    portPath,
    metadata,
  });
}

function workspaceRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.resolve(context.policy?.workspaceRoot ?? process.cwd());
}

function allowedRoots(context: RuntimeBaseToolExecutorContext): readonly string[] {
  const roots = context.policy?.allowedRoots;
  if (roots !== undefined && roots.length > 0) return roots.map((root) => path.resolve(root));
  return [workspaceRoot(context)];
}

function resolveWithinAllowedRoots(context: RuntimeBaseToolExecutorContext, targetPath: string): BaseToolExecutorResult<string> {
  const resolved = path.resolve(workspaceRoot(context), targetPath);
  const allowed = allowedRoots(context);
  const isAllowed = allowed.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  if (!isAllowed) {
    return failure("SCOPE_REJECTED", "requested path is outside runtime allowed roots", [
      "runtime.execEngine.baseToolExecutorPort.scope.rejected",
    ]);
  }
  return success(resolved);
}

function maxOutputBytes(context: RuntimeBaseToolExecutorContext): number {
  return context.resourceLimits?.maxOutputBytes ?? 1024 * 1024;
}

function genericRuntimeOutput(
  context: RuntimeBaseToolExecutorContext,
  portPath: string,
  request: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    portPath,
    provider: "runtime.execEngine.baseToolExecutorPortFactory",
    handled: true,
    source: "runtime-adapter",
    ...request,
    ...extra,
  };
}

function commandRisk(command: string): { verdict: "allowed" | "requires-approval" | "blocked"; reasons: readonly string[]; requiresTapApproval: boolean } {
  const first = command.trim().split(/\s+/u)[0] ?? "";
  if (["rm", "mkfs", "dd", "shutdown", "reboot", "poweroff"].includes(first)) {
    return { verdict: "blocked", reasons: ["command is blocked by runtime shell validation"], requiresTapApproval: true };
  }
  if (/\bsudo\b|&&|\|\||;|\||>|<|`|\$\(/u.test(command)) {
    return { verdict: "requires-approval", reasons: ["command requires TAP approval before execution"], requiresTapApproval: true };
  }
  return { verdict: "allowed", reasons: ["command passed runtime shell validation"], requiresTapApproval: false };
}

function timeoutMs(context: RuntimeBaseToolExecutorContext, requested?: number): number {
  return requested ?? context.resourceLimits?.timeoutMs ?? 30_000;
}

function sandboxFamily(context: RuntimeBaseToolExecutorContext): string {
  return context.sandbox?.providerFamily ?? "host-observed";
}

function sandboxMetadata(context: RuntimeBaseToolExecutorContext, applied: boolean): Readonly<Record<string, unknown>> {
  return {
    providerFamily: sandboxFamily(context),
    profile: context.sandbox?.profile ?? "host-observed",
    isolationLevel: context.sandbox?.isolationLevel ?? (applied ? "process-namespace" : "none"),
    ready: context.sandbox?.ready ?? true,
    applied,
    probeStatus: context.sandbox?.probe?.status,
    smokeStatus: context.sandbox?.smoke?.status,
  };
}

function sandboxUnavailable(context: RuntimeBaseToolExecutorContext): BaseToolExecutorResult<never> | undefined {
  const family = sandboxFamily(context);
  if (family === "host-observed" || family === "workspace-policy") return undefined;
  if (family === "linux-bubblewrap" && context.sandbox?.ready === true) return undefined;
  if (family === "linux-bubblewrap") {
    return failure("SANDBOX_UNAVAILABLE", context.sandbox?.probe?.publicSafeMessage ?? "linux-bubblewrap sandbox is not ready for runtime process execution", [
      "runtime.execEngine.baseToolExecutorPort.sandbox.unavailable",
    ]);
  }
  return failure("SANDBOX_PROVIDER_UNSUPPORTED", `${family} sandbox cannot execute BaseTool host processes in this runtime build`, [
    "runtime.execEngine.baseToolExecutorPort.sandbox.unsupported",
  ]);
}

function sandboxCwd(cwd: string, context: RuntimeBaseToolExecutorContext): BaseToolExecutorResult<string> {
  const root = workspaceRoot(context);
  const relative = path.relative(root, cwd);
  if (relative === "") return success("/workspace");
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return failure("SCOPE_REJECTED", "linux-bubblewrap process cwd must stay inside runtime workspace root", [
      "runtime.execEngine.baseToolExecutorPort.sandbox.scope.rejected",
    ]);
  }
  return success(`/workspace/${relative.split(path.sep).join("/")}`);
}

function linuxBubblewrapProcessCommand(
  request: {
    command: string;
    args?: readonly string[];
    shell?: boolean | string;
  },
  context: RuntimeBaseToolExecutorContext,
  cwd: string,
): BaseToolExecutorResult<{ command: string; args: readonly string[]; cwd: string; shell: false; sandboxApplied: true }> {
  const insideCwd = sandboxCwd(cwd, context);
  if (!insideCwd.ok) return insideCwd;

  const shellCommand = request.shell === true || typeof request.shell === "string";
  const shellBinary = typeof request.shell === "string" ? request.shell : "sh";
  const target = shellCommand
    ? [shellBinary, "-lc", request.command]
    : [request.command, ...(request.args ?? [])];

  return success({
    command: "bwrap",
    args: [
      "--unshare-all",
      "--die-with-parent",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--bind",
      workspaceRoot(context),
      "/workspace",
      "--chdir",
      insideCwd.output,
      "/usr/bin/env",
      ...target,
    ],
    cwd: workspaceRoot(context),
    shell: false,
    sandboxApplied: true,
  });
}

function processCommand(
  request: {
    command: string;
    args?: readonly string[];
    shell?: boolean | string;
  },
  context: RuntimeBaseToolExecutorContext,
  cwd: string,
): BaseToolExecutorResult<{ command: string; args: readonly string[]; cwd: string; shell: boolean | string | undefined; sandboxApplied: boolean }> {
  const unavailable = sandboxUnavailable(context);
  if (unavailable !== undefined) return unavailable;

  if (sandboxFamily(context) === "linux-bubblewrap") {
    return linuxBubblewrapProcessCommand(request, context, cwd);
  }

  return success({
    command: request.command,
    args: request.args ?? [],
    cwd,
    shell: request.shell,
    sandboxApplied: false,
  });
}

async function runChildProcess(request: {
  command: string;
  args?: readonly string[];
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  shell?: boolean | string;
  env?: Readonly<Record<string, string>>;
  intent?: string;
}, context: RuntimeBaseToolExecutorContext, portPath: string): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string; durationMs?: number }>> {
  const cwdResult = request.cwd === undefined ? success(workspaceRoot(context)) : resolveWithinAllowedRoots(context, request.cwd);
  if (!cwdResult.ok) return cwdResult;

  emit(context, portPath, "runtime.execEngine.baseToolExecutorPort.process.started", {
    command: request.command,
    cwd: cwdResult.output,
    intent: request.intent,
  });

  const startedAt = Date.now();
  const outputLimit = maxOutputBytes(context);
  const commandTimeoutMs = timeoutMs(context, request.timeoutMs);
  const spawnSpec = processCommand(request, context, cwdResult.output);
  if (!spawnSpec.ok) return spawnSpec;
  const sandbox = sandboxMetadata(context, spawnSpec.output.sandboxApplied);

  return await new Promise((resolve) => {
    const child = spawn(spawnSpec.output.command, [...spawnSpec.output.args], {
      cwd: spawnSpec.output.cwd,
      env: request.env === undefined ? undefined : { ...process.env, ...request.env },
      shell: spawnSpec.output.shell,
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const append = (current: string, chunk: Buffer, currentBytes: number): { text: string; bytes: number } => {
      const nextBytes = currentBytes + chunk.byteLength;
      if (currentBytes >= outputLimit) return { text: current, bytes: nextBytes };
      const remaining = Math.max(0, outputLimit - currentBytes);
      return { text: current + chunk.subarray(0, remaining).toString("utf8"), bytes: nextBytes };
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve(failure("EXECUTION_TIMEOUT", "runtime process execution timed out", [
        `runtime.execEngine.baseToolExecutorPort.${portPath}.timeout`,
      ]));
    }, commandTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const next = append(stdout, chunk, stdoutBytes);
      stdout = next.text;
      stdoutBytes = next.bytes;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const next = append(stderr, chunk, stderrBytes);
      stderr = next.text;
      stderrBytes = next.bytes;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(failure("PROVIDER_FAILURE", error.message, [`runtime.execEngine.baseToolExecutorPort.${portPath}.failed`]));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      emit(context, portPath, "runtime.execEngine.baseToolExecutorPort.process.finished", { exitCode: code ?? 0, sandbox });
      resolve(
        success(
          {
            exitCode: code ?? 0,
            stdout,
            stderr,
            durationMs: Date.now() - startedAt,
          },
          [`runtime.execEngine.baseToolExecutorPort.${portPath}.finished`],
          {
            stdoutTruncated: stdoutBytes > outputLimit,
            stderrTruncated: stderrBytes > outputLimit,
            sandbox,
          },
        ),
      );
    });

    if (request.stdin !== undefined) {
      child.stdin.end(request.stdin);
    } else {
      child.stdin.end();
    }
  });
}

async function listDirectory(
  rootPath: string,
  options: { depth: number; maxEntries: number; includeGlobs?: readonly string[]; excludeGlobs?: readonly string[] },
): Promise<readonly string[]> {
  const entries: string[] = [];
  const excluded = options.excludeGlobs ?? [];
  const included = options.includeGlobs ?? [];

  async function walk(current: string, depthRemaining: number): Promise<void> {
    if (entries.length >= options.maxEntries) return;
    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      if (entries.length >= options.maxEntries) return;
      const full = path.join(current, child.name);
      const relative = path.relative(rootPath, full).split(path.sep).join("/");
      if (excluded.some((pattern) => relative.includes(pattern.replaceAll("*", "")))) continue;
      if (included.length > 0 && !included.some((pattern) => relative.includes(pattern.replaceAll("*", "")))) continue;
      entries.push(relative);
      if (child.isDirectory() && depthRemaining > 0) await walk(full, depthRemaining - 1);
    }
  }

  await walk(rootPath, options.depth);
  return entries;
}

async function searchTextFiles(
  rootPath: string,
  request: {
    query: string;
    fileGlob?: string;
    maxMatches: number;
    literal: boolean;
    caseSensitive: boolean;
    includeHidden: boolean;
  },
): Promise<readonly { path: string; line: number; column?: number; text: string }[]> {
  const matches: { path: string; line: number; column?: number; text: string }[] = [];
  const needle = request.caseSensitive ? request.query : request.query.toLowerCase();
  const regex = request.literal
    ? undefined
    : new RegExp(request.query, request.caseSensitive ? "u" : "iu");

  async function walk(current: string): Promise<void> {
    if (matches.length >= request.maxMatches) return;
    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      if (matches.length >= request.maxMatches) return;
      if (!request.includeHidden && child.name.startsWith(".")) continue;
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!child.isFile()) continue;
      const relative = path.relative(rootPath, full).split(path.sep).join("/");
      if (request.fileGlob !== undefined && !relative.includes(request.fileGlob.replaceAll("*", ""))) continue;
      let content: string;
      try {
        content = await readFile(full, "utf8");
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/u);
      for (const [index, line] of lines.entries()) {
        const haystack = request.caseSensitive ? line : line.toLowerCase();
        const column = regex === undefined ? haystack.indexOf(needle) : line.search(regex);
        if (column === -1) continue;
        matches.push({ path: relative, line: index + 1, column: column + 1, text: line });
        if (matches.length >= request.maxMatches) return;
      }
    }
  }

  await walk(rootPath);
  return matches;
}

function createFilesystemExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["filesystem"]> {
  return {
    async readText(request) {
      const resolved = resolveWithinAllowedRoots(context, request.path);
      if (!resolved.ok) return resolved;
      try {
        const bytes = await readFile(resolved.output);
        const maxBytes = request.maxBytes ?? context.resourceLimits?.maxReadBytes;
        const contentBytes = maxBytes === undefined ? bytes : bytes.subarray(0, maxBytes);
        emit(context, "filesystem.readText", "runtime.execEngine.baseToolExecutorPort.filesystem.readText");
        return success({
          content: contentBytes.toString(request.encoding === "utf16le" ? "utf16le" : "utf8"),
          truncated: maxBytes !== undefined && bytes.byteLength > maxBytes,
        });
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "filesystem read failed");
      }
    },
    async writeText(request) {
      if (context.policy?.allowFilesystemWrite !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime filesystem write requires allowFilesystemWrite=true");
      }
      const resolved = resolveWithinAllowedRoots(context, request.path);
      if (!resolved.ok) return resolved;
      try {
        await mkdir(path.dirname(resolved.output), { recursive: true });
        const encoding = request.encoding === "utf16le" ? "utf16le" : "utf8";
        await writeFile(resolved.output, request.content, { encoding });
        emit(context, "filesystem.writeText", "runtime.execEngine.baseToolExecutorPort.filesystem.writeText");
        return success({ bytesWritten: Buffer.byteLength(request.content, encoding) });
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "filesystem write failed");
      }
    },
    async deletePath(request) {
      if (context.policy?.allowFilesystemDelete !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime filesystem delete requires allowFilesystemDelete=true");
      }
      const resolved = resolveWithinAllowedRoots(context, request.path);
      if (!resolved.ok) return resolved;
      try {
        await rm(resolved.output, { recursive: request.recursive === true, force: true });
        emit(context, "filesystem.deletePath", "runtime.execEngine.baseToolExecutorPort.filesystem.deletePath");
        return success({ deleted: true });
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "filesystem delete failed");
      }
    },
    async list(request) {
      const resolved = resolveWithinAllowedRoots(context, request.path);
      if (!resolved.ok) return resolved;
      try {
        const maxEntries = request.maxEntries ?? context.resourceLimits?.maxListEntries ?? 200;
        const entries = await listDirectory(resolved.output, {
          depth: request.depth ?? 1,
          maxEntries,
          includeGlobs: request.includeGlobs,
          excludeGlobs: request.excludeGlobs,
        });
        emit(context, "filesystem.list", "runtime.execEngine.baseToolExecutorPort.filesystem.list");
        return success({ entries });
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "filesystem list failed");
      }
    },
  };
}

function createShellExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["shell"]> {
  return {
    async assembleArguments(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.assembleArguments", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.assembleArguments", { input: request.input, context: request.context }));
    },
    async generateCommand(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.generateCommand", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.generateCommand", { input: request.input, context: request.context }));
    },
    async buildExecutionGuard(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.buildExecutionGuard", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.buildExecutionGuard", { input: request.input, context: request.context }, {
        guardRequired: true,
        runtimeOwnsApproval: true,
      }));
    },
    async constructInvocation(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.constructInvocation", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.constructInvocation", { input: request.input, context: request.context }));
    },
    async generateScript(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.generateScript", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.generateScript", { input: request.input, context: request.context }));
    },
    async validateCommand(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.validateCommand", request);
      if (delegated !== undefined) return delegated;
      const risk = commandRisk(request.command);
      emit(context, "shell.validateCommand", "runtime.execEngine.baseToolExecutorPort.shell.validateCommand");
      return success(genericRuntimeOutput(context, "shell.validateCommand", { command: request.command, workingDirectory: request.workingDirectory, shell: request.shell }, risk));
    },
    async controlPermission(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.controlPermission", request);
      if (delegated !== undefined) return delegated;
      const allowed = request.riskLevel === "low";
      emit(context, "shell.controlPermission", "runtime.execEngine.baseToolExecutorPort.shell.controlPermission");
      return success(genericRuntimeOutput(context, "shell.controlPermission", { command: request.command, workingDirectory: request.workingDirectory }, {
        decision: allowed ? "allowed" : "pending",
        allowed,
        requiresTapApproval: !allowed,
        requestedPermissions: request.requestedPermissions,
        riskLevel: request.riskLevel,
      }));
    },
    async enforceSandbox(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.enforceSandbox", request);
      if (delegated !== undefined) return delegated;
      const deniedPath = request.requestedPaths.find((requestedPath) => {
        const resolved = resolveWithinAllowedRoots(context, requestedPath);
        return !resolved.ok;
      });
      emit(context, "shell.enforceSandbox", "runtime.execEngine.baseToolExecutorPort.shell.enforceSandbox");
      return success(genericRuntimeOutput(context, "shell.enforceSandbox", { command: request.command, workingDirectory: request.workingDirectory }, {
        enforced: deniedPath === undefined,
        allowed: deniedPath === undefined,
        deniedPath,
        requestedPaths: request.requestedPaths,
        accessIntents: request.accessIntents,
      }));
    },
    async run(request) {
      if (context.policy?.allowShellExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime shell execution requires allowShellExecution=true");
      }
      const shell = request.args === undefined || request.args.length === 0;
      const result = await runChildProcess({ ...request, shell }, context, "shell.run");
      if (!result.ok) return result;
      const { durationMs: _durationMs, ...output } = result.output;
      return success(output, result.events, result.metadata);
    },
    spawnProcess: delegatedUnavailableMethod(context, "shell.spawnProcess"),
    startBackground: delegatedUnavailableMethod(context, "shell.startBackground"),
    startDetached: delegatedUnavailableMethod(context, "shell.startDetached"),
    terminateProcess: delegatedUnavailableMethod(context, "shell.terminateProcess"),
    async monitorExecution(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.monitorExecution", request);
      if (delegated !== undefined) return delegated;
      emit(context, "shell.monitorExecution", "runtime.execEngine.baseToolExecutorPort.shell.monitorExecution");
      return success(genericRuntimeOutput(context, "shell.monitorExecution", { target: request.target, observation: request.observation }, {
        status: "unknown",
        stale: false,
        runtimeOwnsProcessHandles: true,
      }));
    },
    async captureOutput(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.captureOutput", request);
      if (delegated !== undefined) return delegated;
      emit(context, "shell.captureOutput", "runtime.execEngine.baseToolExecutorPort.shell.captureOutput");
      return success(genericRuntimeOutput(context, "shell.captureOutput", { target: request.target }, {
        stdout: "",
        stderr: "",
        chunks: [],
        truncated: false,
      }));
    },
    controlInteractive: delegatedUnavailableMethod(context, "shell.controlInteractive"),
    handlePrompt: delegatedUnavailableMethod(context, "shell.handlePrompt"),
    feedStdin: delegatedUnavailableMethod(context, "shell.feedStdin"),
    manageLifecycle: delegatedUnavailableMethod(context, "shell.manageLifecycle"),
    manageProcess: delegatedUnavailableMethod(context, "shell.manageProcess"),
    manageResource: delegatedUnavailableMethod(context, "shell.manageResource"),
    manageSession: delegatedUnavailableMethod(context, "shell.manageSession"),
  };
}

function createProcessExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["process"]> {
  return {
    async run(request) {
      if (context.policy?.allowProcessExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime process execution requires allowProcessExecution=true");
      }
      return await runChildProcess({ ...request, shell: false }, context, "process.run");
    },
  };
}

function createGitExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["git"]> {
  return {
    async runGit(request) {
      if (context.policy?.allowGitExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime git execution requires allowGitExecution=true");
      }
      const resolved = resolveWithinAllowedRoots(context, request.repositoryPath);
      if (!resolved.ok) return resolved;
      const accessResult = await access(resolved.output, fsConstants.R_OK)
        .then(() => true)
        .catch(() => false);
      if (!accessResult) return failure("SCOPE_REJECTED", "repository path is not readable by runtime");
      const result = await runChildProcess(
        { command: "git", args: request.args, cwd: resolved.output, timeoutMs: request.timeoutMs, shell: false, intent: "git" },
        context,
        "git.runGit",
      );
      if (!result.ok) return result;
      const { durationMs: _durationMs, ...output } = result.output;
      return success(output, result.events, result.metadata);
    },
  };
}

function createSearchExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["search"]> {
  return {
    async ripgrep(request) {
      if (context.policy?.allowRipgrep !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime ripgrep execution requires allowRipgrep=true");
      }
      const resolved = resolveWithinAllowedRoots(context, request.directoryPath);
      if (!resolved.ok) return resolved;
      if (request.command.length === 0 || request.command[0] === "rg") {
        try {
          const matches = await searchTextFiles(resolved.output, {
            query: request.query,
            fileGlob: request.fileGlob,
            maxMatches: request.maxMatches,
            literal: request.literal,
            caseSensitive: request.caseSensitive,
            includeHidden: request.includeHidden,
          });
          emit(context, "search.ripgrep", "runtime.execEngine.baseToolExecutorPort.search.ripgrep");
          return success({
            exitCode: matches.length > 0 ? 0 : 1,
            matches,
            stderr: "",
          });
        } catch (error) {
          return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "runtime ripgrep-style search failed");
        }
      }
      const args = request.command.length > 0
        ? request.command.slice(1)
        : [
            "--line-number",
            "--column",
            "--max-count",
            String(request.maxMatches),
            ...(request.literal ? ["--fixed-strings"] : []),
            ...(request.caseSensitive ? [] : ["--ignore-case"]),
            ...(request.includeHidden ? ["--hidden"] : []),
            ...(request.multiline ? ["--multiline"] : []),
            ...(request.contextLines > 0 ? ["--context", String(request.contextLines)] : []),
            ...(request.fileGlob ? ["--glob", request.fileGlob] : []),
            request.query,
            resolved.output,
          ];
      const command = request.command[0] ?? "rg";
      const result = await runChildProcess({ command, args, cwd: workspaceRoot(context), shell: false, intent: "ripgrep" }, context, "search.ripgrep");
      if (!result.ok) return result;
      const matches = result.output.stdout
        .split(/\r?\n/u)
        .filter(Boolean)
        .slice(0, request.maxMatches)
        .map((line) => {
          const parts = line.split(":");
          const filePath = parts.shift() ?? "";
          const lineNumber = Number(parts.shift() ?? "0");
          const column = Number(parts.shift() ?? "0");
          return {
            path: path.isAbsolute(filePath) ? path.relative(resolved.output, filePath).split(path.sep).join("/") : filePath,
            line: Number.isFinite(lineNumber) ? lineNumber : 0,
            column: Number.isFinite(column) ? column : undefined,
            text: parts.join(":"),
          };
        });
      return success({
        exitCode: result.output.exitCode,
        matches,
        stderr: result.output.stderr,
      }, result.events, result.metadata);
    },
  };
}

function headersToRecord(headers: Headers): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function createNetworkExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["network"]> {
  return {
    async fetch(request) {
      const delegated = await callDelegated<{
        status: number;
        headers: Readonly<Record<string, string>>;
        body: string;
        finalUrl?: string;
      }>(context, "network.fetch", request);
      if (delegated !== undefined) return delegated;
      if (context.policy?.allowNetworkFetch !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime network.fetch requires allowNetworkFetch=true");
      }
      try {
        const response = await fetch(request.url, {
          method: request.method ?? "GET",
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(timeoutMs(context, request.timeoutMs)),
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const maxBytes = request.maxBytes ?? maxOutputBytes(context);
        const body = Buffer.from(bytes.subarray(0, maxBytes)).toString("utf8");
        emit(context, "network.fetch", "runtime.execEngine.baseToolExecutorPort.network.fetch", { url: request.url, status: response.status });
        return success({
          status: response.status,
          headers: headersToRecord(response.headers),
          body,
          finalUrl: response.url,
        }, ["runtime.execEngine.baseToolExecutorPort.network.fetch.finished"], { truncated: bytes.byteLength > maxBytes });
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "runtime network fetch failed");
      }
    },
    async search(request) {
      const delegated = await callDelegated<{
        results: readonly { title: string; url: string; snippet?: string; raw?: unknown }[];
        providerMetadata?: Readonly<Record<string, unknown>>;
        raw?: unknown;
      }>(context, "network.search", request);
      if (delegated !== undefined) return delegated;
      if (context.policy?.allowNetworkSearch !== true) {
        return failure("PROVIDER_UNAVAILABLE", "runtime network.search requires an injected search adapter");
      }
      return providerUnavailable("network.search");
    },
    async nativeWebSearch(request) {
      const delegated = await callDelegated<{
        answer?: string;
        sources: readonly {
          title?: string;
          url: string;
          snippet?: string;
          kind?: "search_result" | "citation" | "provider_native";
          raw?: unknown;
        }[];
        citations?: readonly {
          url: string;
          title?: string;
          snippet?: string;
          providerReference?: string;
          raw?: unknown;
        }[];
        providerMetadata?: Readonly<Record<string, unknown>>;
        raw?: unknown;
      }>(context, "network.nativeWebSearch", request);
      if (delegated !== undefined) return delegated;
      return providerUnavailable("network.nativeWebSearch");
    },
    async ground(request) {
      const delegated = await callDelegated<{
        answer?: string;
        grounded: boolean;
        status: "grounded" | "partially-grounded" | "unsupported";
        confidence: "high" | "medium" | "low" | "not-evaluated";
        citations: readonly {
          url: string;
          title?: string;
          snippet?: string;
          providerReference?: string;
          raw?: unknown;
        }[];
        sources: readonly {
          title?: string;
          url: string;
          snippet?: string;
          kind?: "search_result" | "citation" | "provider_native";
          raw?: unknown;
        }[];
        providerMetadata?: Readonly<Record<string, unknown>>;
        raw?: unknown;
      }>(context, "network.ground", request);
      if (delegated !== undefined) return delegated;
      return providerUnavailable("network.ground");
    },
  };
}

export function createRuntimeBaseToolExecutorPort(
  context: RuntimeBaseToolExecutorContext,
): BaseToolExecutorPort {
  return {
    filesystem: createFilesystemExecutor(context),
    shell: createShellExecutor(context),
    git: createGitExecutor(context),
    process: createProcessExecutor(context),
    debug: {
      launch: delegatedUnavailableMethod(context, "debug.launch"),
      captureState: delegatedUnavailableMethod(context, "debug.captureState"),
      collectLogs: delegatedUnavailableMethod(context, "debug.collectLogs"),
    },
    lsp: {
      locateDefinition: delegatedUnavailableMethod(context, "lsp.locateDefinition"),
      locateTypeDefinition: delegatedUnavailableMethod(context, "lsp.locateTypeDefinition"),
      traceReferences: delegatedUnavailableMethod(context, "lsp.traceReferences"),
      traceImplementations: delegatedUnavailableMethod(context, "lsp.traceImplementations"),
      scanDocumentSymbols: delegatedUnavailableMethod(context, "lsp.scanDocumentSymbols"),
      searchWorkspaceSymbols: delegatedUnavailableMethod(context, "lsp.searchWorkspaceSymbols"),
      suggestCodeActions: delegatedUnavailableMethod(context, "lsp.suggestCodeActions"),
      applyCodeActionPreview: delegatedUnavailableMethod(context, "lsp.applyCodeActionPreview"),
      renameSymbolPreview: delegatedUnavailableMethod(context, "lsp.renameSymbolPreview"),
      completeCode: delegatedUnavailableMethod(context, "lsp.completeCode"),
      assistSignature: delegatedUnavailableMethod(context, "lsp.assistSignature"),
      explainSymbol: delegatedUnavailableMethod(context, "lsp.explainSymbol"),
      inspectSymbol: delegatedUnavailableMethod(context, "lsp.inspectSymbol"),
      inspectDiagnostics: delegatedUnavailableMethod(context, "lsp.inspectDiagnostics"),
      formatDocumentPreview: delegatedUnavailableMethod(context, "lsp.formatDocumentPreview"),
      formatRangePreview: delegatedUnavailableMethod(context, "lsp.formatRangePreview"),
    },
    search: createSearchExecutor(context),
    network: createNetworkExecutor(context),
    mcp: {
      authenticate: delegatedUnavailableMethod(context, "mcp.authenticate"),
      authorize: delegatedUnavailableMethod(context, "mcp.authorize"),
      cache: delegatedUnavailableMethod(context, "mcp.cache"),
      invalidateCache: delegatedUnavailableMethod(context, "mcp.invalidateCache"),
      connect: delegatedUnavailableMethod(context, "mcp.connect"),
      disconnect: delegatedUnavailableMethod(context, "mcp.disconnect"),
      subscribe: delegatedUnavailableMethod(context, "mcp.subscribe"),
      unsubscribe: delegatedUnavailableMethod(context, "mcp.unsubscribe"),
      callTool: delegatedUnavailableMethod(context, "mcp.callTool"),
      streamTool: delegatedUnavailableMethod(context, "mcp.streamTool"),
      cancelExecution: delegatedUnavailableMethod(context, "mcp.cancelExecution"),
      nativeExecute: delegatedUnavailableMethod(context, "mcp.nativeExecute"),
      listTools: delegatedUnavailableMethod(context, "mcp.listTools"),
      registerTool: delegatedUnavailableMethod(context, "mcp.registerTool"),
      updateTool: delegatedUnavailableMethod(context, "mcp.updateTool"),
      unregisterTool: delegatedUnavailableMethod(context, "mcp.unregisterTool"),
      listResources: delegatedUnavailableMethod(context, "mcp.listResources"),
      readResource: delegatedUnavailableMethod(context, "mcp.readResource"),
      createResource: delegatedUnavailableMethod(context, "mcp.createResource"),
      updateResource: delegatedUnavailableMethod(context, "mcp.updateResource"),
      deleteResource: delegatedUnavailableMethod(context, "mcp.deleteResource"),
      ping: delegatedUnavailableMethod(context, "mcp.ping"),
      checkHealth: delegatedUnavailableMethod(context, "mcp.checkHealth"),
    },
    device: {
      captureScreenshot: delegatedUnavailableMethod(context, "device.captureScreenshot"),
      captureCameraPhoto: delegatedUnavailableMethod(context, "device.captureCameraPhoto"),
      recordAudio: delegatedUnavailableMethod(context, "device.recordAudio"),
    },
    computeruse: {
      captureScreenshot: delegatedUnavailableMethod(context, "computeruse.captureScreenshot"),
      pointerAction: delegatedUnavailableMethod(context, "computeruse.pointerAction"),
      keyboardAction: delegatedUnavailableMethod(context, "computeruse.keyboardAction"),
      locateCursor: delegatedUnavailableMethod(context, "computeruse.locateCursor"),
      requestPermission: delegatedUnavailableMethod(context, "computeruse.requestPermission"),
      releasePermission: delegatedUnavailableMethod(context, "computeruse.releasePermission"),
      selectDevice: delegatedUnavailableMethod(context, "computeruse.selectDevice"),
      captureCameraPhoto: delegatedUnavailableMethod(context, "computeruse.captureCameraPhoto"),
      analyzeCameraFrame: delegatedUnavailableMethod(context, "computeruse.analyzeCameraFrame"),
      startRecording: delegatedUnavailableMethod(context, "computeruse.startRecording"),
      stopRecording: delegatedUnavailableMethod(context, "computeruse.stopRecording"),
      recordAudio: delegatedUnavailableMethod(context, "computeruse.recordAudio"),
    },
    artifact: {
      store: delegatedUnavailableMethod(context, "artifact.store"),
    },
    office: {
      decodeDocument: delegatedUnavailableMethod(context, "office.decodeDocument"),
    },
    omni: {
      transformMedia: delegatedUnavailableMethod(context, "omni.transformMedia"),
    },
    skill: {
      runSkill: delegatedUnavailableMethod(context, "skill.runSkill"),
    },
    custom: {
      invokeCustomTool: delegatedUnavailableMethod(context, "custom.invokeCustomTool"),
    },
  };
}
