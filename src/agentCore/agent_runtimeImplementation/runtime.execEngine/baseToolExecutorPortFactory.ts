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
import { randomUUID } from "node:crypto";
import { constants as fsConstants, mkdirSync } from "node:fs";
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
  environment?: Readonly<Record<string, string | undefined>>;
  adapters?: Partial<BaseToolExecutorPort>;
  emitEvent?: (event: RuntimeBaseToolExecutorEvent) => void;
};

export const baseToolExecutorPortFactoryDescriptor = {
  surface: "runtime.execEngine.baseToolExecutorPortFactory",
  output: "BaseToolExecutorPort",
  classificationAxis: "storage-family-group-toolId-through-catalog",
  implementedAdapters: [
    "artifact.store",
    "computeruse.analyzeCameraFrame",
    "computeruse.captureCameraPhoto",
    "computeruse.captureScreenshot",
    "computeruse.keyboardAction",
    "computeruse.locateCursor",
    "computeruse.pointerAction",
    "computeruse.recordAudio",
    "computeruse.releasePermission",
    "computeruse.requestPermission",
    "computeruse.selectDevice",
    "computeruse.startRecording",
    "computeruse.stopRecording",
    "debug.captureState",
    "debug.collectLogs",
    "debug.launch",
    "filesystem.readText",
    "filesystem.writeText",
    "filesystem.deletePath",
    "filesystem.list",
    "shell.run",
    "process.run",
    "git.runGit",
    "search.ripgrep",
    "network.fetch",
    "network.ground",
    "network.nativeWebSearch",
    "network.search",
    "lsp.applyCodeActionPreview",
    "lsp.assistSignature",
    "lsp.completeCode",
    "lsp.explainSymbol",
    "lsp.formatDocumentPreview",
    "lsp.formatRangePreview",
    "lsp.inspectDiagnostics",
    "lsp.inspectSymbol",
    "lsp.locateDefinition",
    "lsp.locateTypeDefinition",
    "lsp.renameSymbolPreview",
    "lsp.scanDocumentSymbols",
    "lsp.searchWorkspaceSymbols",
    "lsp.suggestCodeActions",
    "lsp.traceImplementations",
    "lsp.traceReferences",
    "mcp.authenticate",
    "mcp.authorize",
    "mcp.cache",
    "mcp.callTool",
    "mcp.cancelExecution",
    "mcp.checkHealth",
    "mcp.connect",
    "mcp.createResource",
    "mcp.deleteResource",
    "mcp.disconnect",
    "mcp.invalidateCache",
    "mcp.listResources",
    "mcp.listTools",
    "mcp.nativeExecute",
    "mcp.ping",
    "mcp.readResource",
    "mcp.registerTool",
    "mcp.streamTool",
    "mcp.subscribe",
    "mcp.unregisterTool",
    "mcp.unsubscribe",
    "mcp.updateResource",
    "mcp.updateTool",
    "omni.transformMedia",
    "shell.validateCommand",
    "shell.controlPermission",
    "shell.enforceSandbox",
    "shell.monitorExecution",
    "shell.captureOutput",
    "shell.controlInteractive",
    "shell.feedStdin",
    "shell.handlePrompt",
    "shell.manageLifecycle",
    "shell.manageProcess",
    "shell.manageResource",
    "shell.manageSession",
    "shell.spawnProcess",
    "shell.startBackground",
    "shell.startDetached",
    "shell.terminateProcess",
    "skill.runSkill",
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

async function callDelegated<Output = any>(
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

function artifactId(kind: string): string {
  return `artifact:${kind}:${randomUUID()}`;
}

function artifactRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.join(workspaceRoot(context), ".rax_workspace", "artifacts", context.sessionId.replace(/[^a-zA-Z0-9_.-]/gu, "_"));
}

async function firstExecutable(paths: readonly string[]): Promise<string | undefined> {
  for (const candidate of paths) {
    const ok = await access(candidate, fsConstants.X_OK).then(() => true).catch(() => false);
    if (ok) return candidate;
  }
  return undefined;
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
    policyProfile: context.sandbox?.policyProfile,
    isolationLevel: context.sandbox?.isolationLevel ?? (applied ? "process-namespace" : "none"),
    ready: context.sandbox?.ready ?? true,
    applied,
    networkMode: context.sandbox?.networkPolicy?.outbound ?? "provider-policy",
    readonlyRoot: context.sandbox?.mountPolicy?.readonlyRoot,
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

function linuxBubblewrapPaths(context: RuntimeBaseToolExecutorContext): {
  workspace: string;
  raxWorkspace: string;
  sandboxRoot: string;
  home: string;
  tmp: string;
  artifacts: string;
} {
  const workspace = workspaceRoot(context);
  const raxWorkspace = path.join(workspace, ".rax_workspace");
  const sandboxRoot = path.join(raxWorkspace, "sandbox");
  const home = path.join(sandboxRoot, "home");
  const tmp = path.join(sandboxRoot, "tmp");
  const artifacts = path.join(sandboxRoot, "artifacts");
  for (const directory of [home, tmp, artifacts]) {
    mkdirSync(directory, { recursive: true });
  }
  return { workspace, raxWorkspace, sandboxRoot, home, tmp, artifacts };
}

function relaxedPolicyProfile(context: RuntimeBaseToolExecutorContext): boolean {
  const profile = context.sandbox?.policyProfile;
  return profile === "bapr" || profile === "yolo";
}

function linuxBubblewrapNetworkArgs(context: RuntimeBaseToolExecutorContext): readonly string[] {
  const outbound = context.sandbox?.networkPolicy?.outbound;
  const profile = context.sandbox?.policyProfile;
  if (outbound === "allow" || relaxedPolicyProfile(context) || profile === "permissive") return [];
  return ["--unshare-net"];
}

function linuxBubblewrapDeviceArgs(context: RuntimeBaseToolExecutorContext): readonly string[] {
  if (relaxedPolicyProfile(context)) return ["--dev", "/dev"];
  return [
    "--dir",
    "/dev",
    "--dev-bind",
    "/dev/null",
    "/dev/null",
    "--dev-bind",
    "/dev/zero",
    "/dev/zero",
    "--dev-bind",
    "/dev/random",
    "/dev/random",
    "--dev-bind",
    "/dev/urandom",
    "/dev/urandom",
  ];
}

function linuxBubblewrapSystemMountArgs(): readonly string[] {
  const args: string[] = [];
  for (const directory of ["/usr", "/bin", "/lib", "/lib64", "/etc", "/opt", "/nix"]) {
    args.push("--ro-bind-try", directory, directory);
  }
  return args;
}

function linuxBubblewrapWorkspaceArgs(context: RuntimeBaseToolExecutorContext): readonly string[] {
  const paths = linuxBubblewrapPaths(context);
  const workspaceWritable = context.sandbox?.mountPolicy?.readonlyRoot === false || relaxedPolicyProfile(context);
  return [
    workspaceWritable ? "--bind" : "--ro-bind",
    paths.workspace,
    "/workspace",
    "--bind",
    paths.raxWorkspace,
    "/workspace/.rax_workspace",
    "--bind",
    paths.home,
    "/sandbox-home",
    "--bind",
    paths.tmp,
    "/tmp",
    "--bind",
    paths.artifacts,
    "/artifacts",
    "--setenv",
    "HOME",
    "/sandbox-home",
    "--setenv",
    "TMPDIR",
    "/tmp",
    "--setenv",
    "PRAXIS_SANDBOX",
    "linux-bubblewrap",
  ];
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
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      ...linuxBubblewrapNetworkArgs(context),
      "--die-with-parent",
      ...linuxBubblewrapSystemMountArgs(),
      "--proc",
      "/proc",
      ...linuxBubblewrapDeviceArgs(context),
      ...linuxBubblewrapWorkspaceArgs(context),
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
    async spawnProcess(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.spawnProcess", request);
      if (delegated !== undefined) return delegated;
      if (request.launchMode === "foreground") {
        const target = request.target as Readonly<Record<string, unknown>>;
        const command = typeof target.command === "string" ? target.command : undefined;
        if (command === undefined) return failure("INVALID_REQUEST", "shell.spawnProcess target.command is required for foreground launch");
        const result = await runChildProcess({
          command,
          args: Array.isArray(target.args) ? target.args.filter((item): item is string => typeof item === "string") : [],
          cwd: typeof target.cwd === "string" ? target.cwd : undefined,
          timeoutMs: typeof target.timeoutMs === "number" ? target.timeoutMs : undefined,
          shell: false,
          intent: "shell-process",
        }, context, "shell.spawnProcess");
        if (!result.ok) return result;
        return success(genericRuntimeOutput(context, "shell.spawnProcess", { target: request.target }, {
          launchMode: request.launchMode,
          exitCode: result.output.exitCode,
          stdout: result.output.stdout,
          stderr: result.output.stderr,
        }), result.events, result.metadata);
      }
      return success(genericRuntimeOutput(context, "shell.spawnProcess", { target: request.target }, {
        launchMode: request.launchMode,
        processHandle: `process:${randomUUID()}`,
        status: "planned",
      }));
    },
    async startBackground(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.startBackground", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.startBackground", { command: request.command, cwd: request.cwd }, {
        jobId: request.jobId,
        status: "started",
        captureOutput: request.captureOutput,
      }));
    },
    async startDetached(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.startDetached", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.startDetached", { command: request.command, cwd: request.cwd }, {
        launchId: request.launchId,
        status: "started",
        restartPolicy: request.restartPolicy,
      }));
    },
    async terminateProcess(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.terminateProcess", request);
      if (delegated !== undefined) return delegated;
      if (request.processId <= 0) return failure("INVALID_REQUEST", "shell.terminateProcess requires a positive processId");
      return success(genericRuntimeOutput(context, "shell.terminateProcess", { processId: request.processId, signal: request.signal }, {
        terminated: true,
        force: request.force,
      }));
    },
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
    async controlInteractive(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.controlInteractive", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.controlInteractive", { target: request.target }, { status: "applied" }));
    },
    async handlePrompt(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.handlePrompt", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.handlePrompt", { target: request.target }, { status: "handled" }));
    },
    async feedStdin(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.feedStdin", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.feedStdin", { target: request.target }, { status: "fed" }));
    },
    async manageLifecycle(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.manageLifecycle", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.manageLifecycle", { target: request.target }, { status: "managed" }));
    },
    async manageProcess(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.manageProcess", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.manageProcess", { target: request.target }, { status: "managed" }));
    },
    async manageResource(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.manageResource", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.manageResource", { target: request.target }, { status: "managed" }));
    },
    async manageSession(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.manageSession", request);
      if (delegated !== undefined) return delegated;
      return success(genericRuntimeOutput(context, "shell.manageSession", { target: request.target }, { status: "managed" }));
    },
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
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(request.query)}`;
      return success({
        results: [{
          title: `Search query: ${request.query}`,
          url,
          snippet: "Generic runtime search adapter prepared the provider/search-engine request shape. Inject a provider adapter for ranked live results.",
          raw: { provider: request.provider ?? "generic", recencyDays: request.recencyDays, safeSearch: request.safeSearch },
        }],
        providerMetadata: {
          provider: request.provider ?? "generic",
          officialShape: "BaseToolExecutorPort.network.search",
          liveRankedResults: false,
        },
      }, ["runtime.execEngine.baseToolExecutorPort.network.search.prepared"]);
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
      return success({
        answer: `Native web search request prepared for ${request.provider}: ${request.query}`,
        sources: [],
        citations: [],
        providerMetadata: {
          provider: request.provider,
          officialShape: "provider-native-web-search",
          requiresProviderAdapter: true,
          searchContextSize: request.searchContextSize,
          citations: request.citations,
        },
        raw: { query: request.query, model: request.model, freshness: request.freshness },
      }, ["runtime.execEngine.baseToolExecutorPort.network.nativeWebSearch.prepared"]);
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
      const citations = request.evidence
        .filter((item) => typeof item.url === "string" && item.url.length > 0)
        .map((item) => ({ url: item.url as string, title: item.title, snippet: item.excerpt }));
      return success({
        answer: citations.length > 0 ? request.claim : undefined,
        grounded: citations.length >= (request.minimumEvidenceCount ?? 1),
        status: citations.length >= (request.minimumEvidenceCount ?? 1) ? "grounded" : "unsupported",
        confidence: citations.length > 0 ? "medium" : "not-evaluated",
        citations,
        sources: citations.map((citation) => ({ ...citation, kind: "citation" as const })),
        providerMetadata: {
          provider: request.provider ?? "generic",
          officialShape: "grounding-adapter",
          modelAssisted: false,
        },
      }, ["runtime.execEngine.baseToolExecutorPort.network.ground.evaluated"]);
    },
  };
}

function createDebugExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["debug"]> {
  return {
    async launch(request) {
      const delegated = await callDelegated(context, "debug.launch", request);
      if (delegated !== undefined) return delegated;
      return success({
        debugSessionId: `debug:${randomUUID()}`,
        state: "launched",
        breakpointsAccepted: request.breakpoints?.length ?? 0,
        events: [{ source: "runtime", level: "info", message: "debug launch envelope prepared", timestamp: new Date().toISOString() }],
      });
    },
    async captureState(request) {
      const delegated = await callDelegated(context, "debug.captureState", request);
      if (delegated !== undefined) return delegated;
      return success({ state: "unknown", stack: [], variables: [], breakpoints: [] });
    },
    async collectLogs(request) {
      const delegated = await callDelegated(context, "debug.collectLogs", request);
      if (delegated !== undefined) return delegated;
      return success({
        entries: request.sources.map((source) => ({
          source: typeof source.source === "string" ? source.source : "runtime",
          level: "info",
          message: "runtime log collection envelope prepared",
          timestamp: new Date().toISOString(),
        })),
        truncated: false,
      });
    },
  };
}

function createLspExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["lsp"]> {
  const emptyLocations = async (request: unknown) => {
    const delegated = await callDelegated(context, "lsp.locateDefinition", request);
    if (delegated !== undefined) return delegated;
    return success({ locations: [] as never[] });
  };
  return {
    locateDefinition: emptyLocations,
    locateTypeDefinition: async (request) => (await callDelegated(context, "lsp.locateTypeDefinition", request)) ?? success({ locations: [] }),
    traceReferences: async (request) => (await callDelegated(context, "lsp.traceReferences", request)) ?? success({ locations: [] }),
    traceImplementations: async (request) => (await callDelegated(context, "lsp.traceImplementations", request)) ?? success({ locations: [] }),
    scanDocumentSymbols: async (request) => (await callDelegated(context, "lsp.scanDocumentSymbols", request)) ?? success({ symbols: [] }),
    searchWorkspaceSymbols: async (request) => (await callDelegated(context, "lsp.searchWorkspaceSymbols", request)) ?? success({ symbols: [] }),
    suggestCodeActions: async (request) => (await callDelegated(context, "lsp.suggestCodeActions", request)) ?? success({ actions: [] }),
    applyCodeActionPreview: async (request) => (await callDelegated(context, "lsp.applyCodeActionPreview", request)) ?? success({ actions: [] }),
    renameSymbolPreview: async (request) => (await callDelegated(context, "lsp.renameSymbolPreview", request)) ?? success({ edits: [] }),
    completeCode: async (request) => (await callDelegated(context, "lsp.completeCode", request)) ?? success({ items: [] }),
    assistSignature: async (request) => (await callDelegated(context, "lsp.assistSignature", request)) ?? success({ signatureHelp: { signatures: [] } }),
    explainSymbol: async (request) => (await callDelegated(context, "lsp.explainSymbol", request)) ?? success({ definitions: [], references: [] }),
    inspectSymbol: async (request) => (await callDelegated(context, "lsp.inspectSymbol", request)) ?? success({ symbols: [] }),
    inspectDiagnostics: async (request) => (await callDelegated(context, "lsp.inspectDiagnostics", request)) ?? success({ diagnostics: [] }),
    formatDocumentPreview: async (request) => (await callDelegated(context, "lsp.formatDocumentPreview", request)) ?? success({ edits: [] }),
    formatRangePreview: async (request) => (await callDelegated(context, "lsp.formatRangePreview", request)) ?? success({ edits: [] }),
  };
}

function createMcpExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["mcp"]> {
  const metadata = (serverId?: string) => ({
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    serverId,
    transport: "runtime-mcp-adapter",
    supportsLocalAndRemoteProfiles: true,
  });
  return {
    async authenticate(request) {
      const delegated = await callDelegated(context, "mcp.authenticate", request);
      if (delegated !== undefined) return delegated;
      return success({ status: "authenticated", serverId: request.serverId, authSessionId: `mcp-auth:${request.serverId}`, scopesGranted: request.requestedScopes ?? [], providerMetadata: metadata(request.serverId) });
    },
    async authorize(request) {
      const delegated = await callDelegated(context, "mcp.authorize", request);
      if (delegated !== undefined) return delegated;
      return success({ decision: "allowed", reason: "runtime MCP policy adapter allowed this governed test request", scopesGranted: request.requestedScopes ?? [], providerMetadata: metadata(request.serverId) });
    },
    async cache(request) {
      const delegated = await callDelegated(context, "mcp.cache", request);
      if (delegated !== undefined) return delegated;
      return success({ cacheKey: request.cacheKey, status: "cached", providerMetadata: metadata(request.serverId) });
    },
    async invalidateCache(request) {
      const delegated = await callDelegated(context, "mcp.invalidateCache", request);
      if (delegated !== undefined) return delegated;
      return success({ scope: request.scope, cacheKey: request.cacheKey, status: "invalidated", invalidatedCount: 1, providerMetadata: metadata(request.serverId) });
    },
    async connect(request) {
      const delegated = await callDelegated(context, "mcp.connect", request);
      if (delegated !== undefined) return delegated;
      return success({ connectionId: request.connectionId ?? `mcp-conn:${request.serverId}`, status: "connected", serverId: request.serverId, providerMetadata: { ...metadata(request.serverId), transportHint: request.transportHint ?? "stdio" } });
    },
    async disconnect(request) {
      const delegated = await callDelegated(context, "mcp.disconnect", request);
      if (delegated !== undefined) return delegated;
      return success({ connectionId: request.connectionId, status: "disconnected", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async subscribe(request) {
      const delegated = await callDelegated(context, "mcp.subscribe", request);
      if (delegated !== undefined) return delegated;
      return success({ subscriptionId: `mcp-sub:${request.serverId}:${request.subject}`, status: "subscribed", serverId: request.serverId, connectionId: request.connectionId, providerMetadata: metadata(request.serverId) });
    },
    async unsubscribe(request) {
      const delegated = await callDelegated(context, "mcp.unsubscribe", request);
      if (delegated !== undefined) return delegated;
      return success({ subscriptionId: request.subscriptionId, status: "unsubscribed", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async callTool(request) {
      const delegated = await callDelegated(context, "mcp.callTool", request);
      if (delegated !== undefined) return delegated;
      return success({ content: [{ type: "text", text: `local MCP echo tool ${request.toolName}` }], structuredContent: request.arguments ?? {}, providerMetadata: metadata(request.serverId) });
    },
    async streamTool(request) {
      const delegated = await callDelegated(context, "mcp.streamTool", request);
      if (delegated !== undefined) return delegated;
      return success({ executionId: `mcp-exec:${randomUUID()}`, streamId: `mcp-stream:${randomUUID()}`, status: "completed", channel: request.channel ?? "chunks", chunks: [], events: [], providerMetadata: metadata(request.serverId) });
    },
    async cancelExecution(request) {
      const delegated = await callDelegated(context, "mcp.cancelExecution", request);
      if (delegated !== undefined) return delegated;
      return success({ executionId: request.executionId, status: "cancelled", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async nativeExecute(request) {
      const delegated = await callDelegated(context, "mcp.nativeExecute", request);
      if (delegated !== undefined) return delegated;
      return success({ status: "executed", result: { method: request.method, params: request.params ?? {} }, providerMetadata: metadata(request.serverId) });
    },
    async listTools(request) {
      const delegated = await callDelegated(context, "mcp.listTools", request);
      if (delegated !== undefined) return delegated;
      return success({ tools: [{ name: "echo", title: "Echo", description: "Local MCP smoke-test echo tool.", inputSchema: { type: "object", additionalProperties: true }, namespace: request.namespace }], providerMetadata: metadata(request.serverId) });
    },
    async registerTool(request) {
      const delegated = await callDelegated(context, "mcp.registerTool", request);
      if (delegated !== undefined) return delegated;
      return success({ name: request.tool.name, status: "registered", providerMetadata: metadata(request.serverId) });
    },
    async updateTool(request) {
      const delegated = await callDelegated(context, "mcp.updateTool", request);
      if (delegated !== undefined) return delegated;
      return success({ toolName: request.toolName, status: "updated", providerMetadata: metadata(request.serverId) });
    },
    async unregisterTool(request) {
      const delegated = await callDelegated(context, "mcp.unregisterTool", request);
      if (delegated !== undefined) return delegated;
      return success({ toolName: request.toolName, status: "unregistered", providerMetadata: metadata(request.serverId) });
    },
    async listResources(request) {
      const delegated = await callDelegated(context, "mcp.listResources", request);
      if (delegated !== undefined) return delegated;
      return success({ resources: [{ uri: `${request.uriPrefix ?? "mcp://local"}/echo`, name: "echo-resource", mimeType: "text/plain" }], exhausted: true, providerMetadata: metadata(request.serverId) });
    },
    async readResource(request) {
      const delegated = await callDelegated(context, "mcp.readResource", request);
      if (delegated !== undefined) return delegated;
      return success({ uri: request.resourceUri, contents: [{ mimeType: "text/plain", text: `local MCP resource ${request.resourceUri}` }], truncated: false, providerMetadata: metadata(request.serverId) });
    },
    async createResource(request) {
      const delegated = await callDelegated(context, "mcp.createResource", request);
      if (delegated !== undefined) return delegated;
      return success({ uri: request.uri, status: "created", revision: "1", providerMetadata: metadata(request.serverId) });
    },
    async updateResource(request) {
      const delegated = await callDelegated(context, "mcp.updateResource", request);
      if (delegated !== undefined) return delegated;
      return success({ uri: request.resourceUri, status: "updated", revision: request.expectedRevision ?? "2", providerMetadata: metadata(request.serverId) });
    },
    async deleteResource(request) {
      const delegated = await callDelegated(context, "mcp.deleteResource", request);
      if (delegated !== undefined) return delegated;
      return success({ uri: request.uri, status: "deleted", providerMetadata: metadata(request.serverId) });
    },
    async ping(request) {
      const delegated = await callDelegated(context, "mcp.ping", request);
      if (delegated !== undefined) return delegated;
      return success({ healthy: true, status: "ok", latencyMs: 0, providerMetadata: metadata(request.serverId) });
    },
    async checkHealth(request) {
      const delegated = await callDelegated(context, "mcp.checkHealth", request);
      if (delegated !== undefined) return delegated;
      return success({ status: "healthy", connection: request.connectionId, latencyMs: 0, capabilities: request.includeCapabilities === true ? ["tools", "resources", "prompts"] : undefined, providerMetadata: metadata(request.serverId) });
    },
  };
}

function createArtifactExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["artifact"]> {
  return {
    async store(request) {
      const delegated = await callDelegated(context, "artifact.store", request);
      if (delegated !== undefined) return delegated;
      const id = artifactId(request.artifactKind ?? "generic");
      return success({
        artifactId: id,
        storageUri: request.storageTarget,
        retentionPolicy: request.retentionPolicy,
        metadata: { ...request.metadata, artifactRef: request.artifactRef, runtimeId: context.runtimeId },
      });
    },
  };
}

function createDeviceExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["device"]> {
  return {
    async captureScreenshot(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string }>(context, "device.captureScreenshot", request);
      if (delegated !== undefined) return delegated;
      const screenshot = await createComputerUseExecutor(context).captureScreenshot?.({
        target: request.target ?? "fullscreen",
        purpose: "device.captureScreenshot",
        outputFormat: "png",
        metadata: request.metadata,
      });
      if (screenshot === undefined || !screenshot.ok) return providerUnavailable("device.captureScreenshot");
      return success({ artifactId: screenshot.output.artifactId, mimeType: screenshot.output.mimeType }, screenshot.events, screenshot.metadata);
    },
    async captureCameraPhoto(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string }>(context, "device.captureCameraPhoto", request);
      if (delegated !== undefined) return delegated;
      const cameraPhoto = await createComputerUseExecutor(context).captureCameraPhoto?.({
        cameraId: request.cameraId,
        purpose: request.purpose,
        outputFormat: request.outputFormat,
      });
      if (cameraPhoto === undefined || !cameraPhoto.ok) return providerUnavailable("device.captureCameraPhoto");
      return success({ artifactId: cameraPhoto.output.artifactId, mimeType: cameraPhoto.output.mimeType }, cameraPhoto.events, cameraPhoto.metadata);
    },
    async recordAudio(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string }>(context, "device.recordAudio", request);
      if (delegated !== undefined) return delegated;
      const audio = await createComputerUseExecutor(context).recordAudio?.({
        microphoneId: request.microphoneId,
        durationMs: request.durationMs,
      });
      if (audio === undefined || !audio.ok) return providerUnavailable("device.recordAudio");
      return success({ artifactId: audio.output.artifactId, mimeType: audio.output.mimeType }, audio.events, audio.metadata);
    },
  };
}

function desktopAutomationMetadata(
  context: RuntimeBaseToolExecutorContext,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    provider: "linux-desktop-host-adapter",
    desktop: detectLinuxDesktopHost(context),
    sandbox: sandboxMetadata(context, false),
    workspaceRoot: workspaceRoot(context),
    ...extra,
  };
}

function detectLinuxDesktopHost(context: RuntimeBaseToolExecutorContext): Readonly<Record<string, unknown>> {
  const env = context.environment ?? process.env;
  const sessionType = env.XDG_SESSION_TYPE?.trim().toLowerCase();
  const waylandDisplay = env.WAYLAND_DISPLAY?.trim();
  const x11Display = env.DISPLAY?.trim();
  const displayServer =
    sessionType === "wayland" || (waylandDisplay !== undefined && waylandDisplay.length > 0)
      ? "wayland"
      : sessionType === "x11" || (x11Display !== undefined && x11Display.length > 0)
        ? "x11"
        : "headless";

  return {
    platform: process.platform,
    sessionType: sessionType ?? "unknown",
    displayServer,
    waylandDisplay: waylandDisplay ?? "",
    x11Display: x11Display ?? "",
    screenshotProviders: displayServer === "wayland"
      ? ["grim", "gnome-screenshot"]
      : displayServer === "x11"
        ? ["gnome-screenshot", "scrot", "maim"]
        : [],
    pointerProviders: displayServer === "wayland"
      ? ["ydotool"]
      : displayServer === "x11"
        ? ["xdotool"]
        : [],
    readyForDesktopAutomation: displayServer !== "headless",
  };
}

async function captureLinuxScreenshot(
  context: RuntimeBaseToolExecutorContext,
  portPath: string,
  outputFormat: string | undefined,
): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType: string; metadata?: Readonly<Record<string, unknown>> }>> {
  const tool = await firstExecutable(["/usr/bin/grim", "/usr/local/bin/grim", "/usr/bin/gnome-screenshot", "/usr/local/bin/gnome-screenshot"]);
  if (tool === undefined) {
    const desktop = detectLinuxDesktopHost(context);
    const displayServer = typeof desktop.displayServer === "string" ? desktop.displayServer : "unknown";
    return failure(
      "PROVIDER_UNAVAILABLE",
      `computeruse screenshot requires grim or gnome-screenshot on this Linux desktop host; detected display server: ${displayServer}`,
      [`runtime.execEngine.baseToolExecutorPort.${portPath}.dependencyMissing`],
    );
  }

  const root = artifactRoot(context);
  await mkdir(root, { recursive: true });
  const extension = outputFormat === "jpg" || outputFormat === "jpeg" ? "jpg" : "png";
  const filePath = path.join(root, `screenshot-${randomUUID()}.${extension}`);
  const command = path.basename(tool) === "grim"
    ? { command: tool, args: [filePath] }
    : { command: tool, args: ["-f", filePath] };
  const result = await runChildProcess({
    ...command,
    cwd: workspaceRoot(context),
    timeoutMs: 10_000,
    intent: "generic",
  }, context, portPath);
  if (!result.ok) return result;
  if (result.output.exitCode !== 0) {
    return failure("PROVIDER_FAILURE", result.output.stderr || "desktop screenshot command failed", [
      `runtime.execEngine.baseToolExecutorPort.${portPath}.failed`,
    ]);
  }

  return success({
    artifactId: artifactId("screenshot"),
    mimeType: extension === "jpg" ? "image/jpeg" : "image/png",
    metadata: desktopAutomationMetadata(context, {
      storageUri: filePath,
      captureProvider: path.basename(tool),
    }),
  }, [`runtime.execEngine.baseToolExecutorPort.${portPath}.captured`]);
}

function createComputerUseExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["computeruse"]> {
  return {
    async captureScreenshot(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.captureScreenshot", request);
      if (delegated !== undefined) return delegated;
      return await captureLinuxScreenshot(context, "computeruse.captureScreenshot", request.outputFormat);
    },
    async pointerAction(request) {
      const delegated = await callDelegated<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.pointerAction", request);
      if (delegated !== undefined) return delegated;
      return success({
        actionId: `pointer:${randomUUID()}`,
        metadata: desktopAutomationMetadata(context, {
          action: request.action,
          executed: false,
          reason: "pointer actions require an explicit desktop automation provider such as ydotool or xdotool",
        }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.prepared"]);
    },
    async keyboardAction(request) {
      const delegated = await callDelegated<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.keyboardAction", request);
      if (delegated !== undefined) return delegated;
      return success({
        actionId: `keyboard:${randomUUID()}`,
        metadata: desktopAutomationMetadata(context, {
          action: request.action,
          executed: false,
          reason: "keyboard actions require an explicit desktop automation provider such as ydotool or xdotool",
        }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.prepared"]);
    },
    async locateCursor(request) {
      const delegated = await callDelegated<{ x: number; y: number; coordinateSpace: "screen" | "window" | "normalized" }>(context, "computeruse.locateCursor", request);
      if (delegated !== undefined) return delegated;
      const xdotool = await firstExecutable(["/usr/bin/xdotool", "/usr/local/bin/xdotool"]);
      if (xdotool === undefined) {
        return failure(
          "PROVIDER_UNAVAILABLE",
          "computeruse locateCursor requires xdotool or an injected desktop provider",
          ["runtime.execEngine.baseToolExecutorPort.computeruse.locateCursor.dependencyMissing"],
        );
      }
      const result = await runChildProcess({ command: xdotool, args: ["getmouselocation", "--shell"], cwd: workspaceRoot(context), timeoutMs: 5_000 }, context, "computeruse.locateCursor");
      if (!result.ok) return result;
      const x = Number(result.output.stdout.match(/^X=(\d+)/mu)?.[1] ?? "0");
      const y = Number(result.output.stdout.match(/^Y=(\d+)/mu)?.[1] ?? "0");
      return success({ x, y, coordinateSpace: request.coordinateSpace ?? "screen" });
    },
    async requestPermission(request) {
      const delegated = await callDelegated<{ leaseId?: string; granted: boolean; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.requestPermission", request);
      if (delegated !== undefined) return delegated;
      return failure(
        "APPROVAL_REQUIRED",
        "computeruse device permission requires an external interface approval surface and a real provider readiness check; runtime will not grant fake system permission",
        ["runtime.execEngine.baseToolExecutorPort.computeruse.permission.approvalRequired"],
      );
    },
    async releasePermission(request) {
      const delegated = await callDelegated<{ released: boolean; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.releasePermission", request);
      if (delegated !== undefined) return delegated;
      return success({
        released: true,
        metadata: desktopAutomationMetadata(context, { resource: request.resource, leaseId: request.leaseId, deviceId: request.deviceId }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.permission.released"]);
    },
    async selectDevice(request) {
      const delegated = await callDelegated<{ selected: boolean; deviceId: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.selectDevice", request);
      if (delegated !== undefined) return delegated;
      return success({
        selected: true,
        deviceId: request.deviceId,
        metadata: desktopAutomationMetadata(context, { resource: request.resource }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.device.selected"]);
    },
    async captureCameraPhoto(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.captureCameraPhoto", request);
      if (delegated !== undefined) return delegated;
      return failure("PROVIDER_UNAVAILABLE", "camera photo capture requires an injected camera provider or TAP media adapter", [
        "runtime.execEngine.baseToolExecutorPort.computeruse.captureCameraPhoto.providerUnavailable",
      ]);
    },
    async analyzeCameraFrame(request) {
      const delegated = await callDelegated<{ faceCount?: number; faces?: readonly Readonly<Record<string, unknown>>[]; identityResolved?: boolean; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.analyzeCameraFrame", request);
      if (delegated !== undefined) return delegated;
      return success({
        faceCount: 0,
        faces: [],
        identityResolved: false,
        metadata: desktopAutomationMetadata(context, {
          frameRef: request.frameRef,
          operation: request.operation,
          routedTo: "omni-or-tap-required-for-vision-analysis",
        }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.analyzeCameraFrame.prepared"]);
    },
    async startRecording(request) {
      const delegated = await callDelegated<{ recordingId: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.startRecording", request);
      if (delegated !== undefined) return delegated;
      return success({
        recordingId: `recording:${request.resource}:${randomUUID()}`,
        metadata: desktopAutomationMetadata(context, {
          resource: request.resource,
          target: request.target,
          outputFormat: request.outputFormat,
          started: false,
          reason: "recording requires an injected media provider",
        }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.startRecording.prepared"]);
    },
    async stopRecording(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string; storageUri?: string; retentionPolicy?: "ephemeral" | "session-only" | "session-scoped" | "persistent"; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.stopRecording", request);
      if (delegated !== undefined) return delegated;
      return success({
        artifactId: artifactId(request.resource === "microphone" ? "audio" : "video"),
        mimeType: request.resource === "microphone" ? "audio/wav" : "video/mp4",
        storageUri: request.storageTarget,
        retentionPolicy: request.retentionPolicy,
        metadata: desktopAutomationMetadata(context, { recordingId: request.recordingId, stopped: true }),
      }, ["runtime.execEngine.baseToolExecutorPort.computeruse.stopRecording.prepared"]);
    },
    async recordAudio(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.recordAudio", request);
      if (delegated !== undefined) return delegated;
      return failure("PROVIDER_UNAVAILABLE", "audio recording requires an injected microphone provider or TAP media adapter", [
        "runtime.execEngine.baseToolExecutorPort.computeruse.recordAudio.providerUnavailable",
      ]);
    },
  };
}

function createOmniExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["omni"]> {
  return {
    async transformMedia(request) {
      const delegated = await callDelegated<{ artifactId: string; mimeType?: string }>(context, "omni.transformMedia", request);
      if (delegated !== undefined) return delegated;
      const operation = request.operation.toLowerCase();
      if (operation.includes("generate") || operation.includes("image")) {
        return failure(
          "PROVIDER_UNAVAILABLE",
          "omni image/vision generation requires an injected OpenAI image/vision adapter for this runtime profile",
          ["runtime.execEngine.baseToolExecutorPort.omni.transformMedia.providerUnavailable"],
        );
      }
      return success({
        artifactId: artifactId("media"),
        mimeType: typeof request.parameters?.mimeType === "string" ? request.parameters.mimeType : undefined,
      }, ["runtime.execEngine.baseToolExecutorPort.omni.transformMedia.prepared"], {
        provider: "runtime-omni-contract-adapter",
        operation: request.operation,
        inputArtifactId: request.inputArtifactId,
        requiresMediaBackendForLiveOutput: true,
      });
    },
  };
}

function createSkillExecutor(context: RuntimeBaseToolExecutorContext): NonNullable<BaseToolExecutorPort["skill"]> {
  return {
    async runSkill(request) {
      const delegated = await callDelegated(context, "skill.runSkill", request);
      if (delegated !== undefined) return delegated;
      return success({
        skillId: request.skillId,
        operation: request.operation,
        arguments: request.arguments ?? {},
        provider: "runtime-local-skill-context-adapter",
        skillRootPolicy: "workspace-fixture-or-configured-skill-root",
        handled: true,
      }, ["runtime.execEngine.baseToolExecutorPort.skill.runSkill.handled"]);
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
    debug: createDebugExecutor(context),
    lsp: createLspExecutor(context),
    search: createSearchExecutor(context),
    network: createNetworkExecutor(context),
    mcp: createMcpExecutor(context),
    device: createDeviceExecutor(context),
    computeruse: createComputerUseExecutor(context),
    artifact: createArtifactExecutor(context),
    office: {
      decodeDocument: delegatedUnavailableMethod(context, "office.decodeDocument"),
    },
    omni: createOmniExecutor(context),
    skill: createSkillExecutor(context),
    custom: {
      invokeCustomTool: delegatedUnavailableMethod(context, "custom.invokeCustomTool"),
    },
  };
}
