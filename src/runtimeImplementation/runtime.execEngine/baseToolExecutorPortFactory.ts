/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / baseTool executor port 工厂。
 * 核心目的：从 runtime context 构造完整 BaseToolExecutorPort，让 176 个 storage-owned baseTool handler 通过注入端口接触宿主能力。
 * 能力要求1：需要提供 filesystem、shell/process/git/ripgrep/network.fetch 以及 shell guard/observation 的第一批真实 runtime adapter。
 * 能力要求2：尚未实现的长连接、设备、媒体、模型原生搜索等能力必须返回稳定 PROVIDER_UNAVAILABLE。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants, createWriteStream, mkdirSync, readFileSync, statSync } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

import type {
  BaseToolExecutorPort,
  BaseToolExecutorResult,
  BaseToolShellServiceHealth,
  BaseToolShellServiceProbe,
  BaseToolShellServiceStatus,
  BaseToolShellServiceStatusSnapshot,
  BaseToolShellServiceVerification,
} from "../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  createMcpRuntimeAdapter,
  type McpRuntimeServerProfile,
} from "./mcpRuntimeAdapter.js";
import {
  isInsideAllowedRoots,
  normalizeAllowedRoots,
  normalizeToolCwd,
  normalizeWorkspacePath,
  workspacePathMetadata,
} from "./workspacePathPolicy.js";

type ComputerUseKeyboardActionRequest = Parameters<NonNullable<NonNullable<BaseToolExecutorPort["computeruse"]>["keyboardAction"]>>[0];
type ComputerUsePointerActionRequest = Parameters<NonNullable<NonNullable<BaseToolExecutorPort["computeruse"]>["pointerAction"]>>[0];
type ComputerUseDesktopActionRequest = {
  metadata?: Readonly<Record<string, unknown>>;
};

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
  mcpServers?: readonly McpRuntimeServerProfile[];
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
    "shell.startServiceAndVerify",
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
  metadata?: Readonly<Record<string, unknown>>,
): BaseToolExecutorResult<Output> {
  return {
    ok: false,
    error: {
      code,
      message,
      publicSafe: true,
      ...(metadata === undefined ? {} : { metadata }),
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim());
}

function decodeDuckDuckGoResultUrl(value: string): string {
  try {
    const parsed = new URL(decodeHtmlEntities(value), "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return decodeHtmlEntities(value);
  }
}

function parseDuckDuckGoHtmlResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet?: string }> {
  const results: Array<{ title: string; url: string; snippet?: string }> = [];
  const blockPattern = /<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/giu;
  for (const blockMatch of html.matchAll(blockPattern)) {
    const block = blockMatch[0];
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/iu);
    if (!linkMatch?.[1] || !linkMatch[2]) continue;
    const url = decodeDuckDuckGoResultUrl(linkMatch[1]);
    const title = stripHtml(linkMatch[2]);
    if (!title || !/^https?:\/\//iu.test(url)) continue;
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/iu)
      ?? block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/iu);
    const snippet = snippetMatch?.[1] ? stripHtml(snippetMatch[1]) : undefined;
    results.push({ title, url, ...(snippet ? { snippet } : {}) });
    if (results.length >= maxResults) break;
  }
  return results;
}

function workspaceRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.resolve(context.policy?.workspaceRoot ?? process.cwd());
}

function allowedRoots(context: RuntimeBaseToolExecutorContext): readonly string[] {
  return normalizeAllowedRoots({
    workspaceRoot: workspaceRoot(context),
    allowedRoots: context.policy?.allowedRoots,
  });
}

function resolveWithinAllowedRoots(context: RuntimeBaseToolExecutorContext, targetPath: string): BaseToolExecutorResult<string> {
  const resolved = normalizeWorkspacePath(targetPath, {
    workspaceRoot: workspaceRoot(context),
    allowedRoots: allowedRoots(context),
    kind: "path",
  });
  if (!resolved.ok) {
    const metadata = workspacePathMetadata(resolved, "path");
    return failure(resolved.reason, resolved.message, [
      "runtime.execEngine.baseToolExecutorPort.scope.rejected",
    ], metadata);
  }
  return success(resolved.normalizedPath, [], workspacePathMetadata(resolved, "path"));
}

function resolveShellWorkingDirectory(context: RuntimeBaseToolExecutorContext, targetPath: string | undefined): BaseToolExecutorResult<string> {
  const resolved = normalizeToolCwd(targetPath, {
    workspaceRoot: workspaceRoot(context),
    allowedRoots: allowedRoots(context),
    kind: "cwd",
  });
  if (!resolved.ok) {
    return failure(resolved.reason, resolved.message, [
      "runtime.execEngine.baseToolExecutorPort.cwd.rejected",
    ], workspacePathMetadata(resolved, "cwd"));
  }
  return success(resolved.normalizedPath, [], workspacePathMetadata(resolved, "cwd"));
}

function resolveDetachedWorkingDirectory(
  context: RuntimeBaseToolExecutorContext,
  targetPath: string | undefined,
  options: { allowOsTmpdir?: boolean } = {},
): BaseToolExecutorResult<string> {
  const resolved = normalizeToolCwd(targetPath, {
    workspaceRoot: workspaceRoot(context),
    allowedRoots: allowedRoots(context),
    kind: "cwd",
  });
  if (!resolved.ok) {
    const requestedCwd = targetPath === undefined ? undefined : path.resolve(targetPath);
    const tmpRoot = path.resolve(tmpdir());
    if (
      options.allowOsTmpdir === true
      && requestedCwd !== undefined
      && (requestedCwd === tmpRoot || requestedCwd.startsWith(`${tmpRoot}${path.sep}`))
    ) {
      return success(requestedCwd, [], {
        requestedCwd: targetPath,
        normalizedCwd: requestedCwd,
        cwdWasMapped: false,
        mappingSource: "os-tmpdir",
      });
    }
    return failure(resolved.reason, resolved.message, [
      "runtime.execEngine.baseToolExecutorPort.cwd.rejected",
    ], workspacePathMetadata(resolved, "cwd"));
  }
  return success(resolved.normalizedPath, [], workspacePathMetadata(resolved, "cwd"));
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
  return plainRuntimeJsonRecord({
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    portPath,
    provider: "runtime.execEngine.baseToolExecutorPortFactory",
    handled: true,
    source: "runtime-adapter",
    ...request,
    ...extra,
  });
}

function plainRuntimeJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    for (const item of value) {
      const clean = plainRuntimeJsonValue(item, seen);
      if (clean !== undefined) output.push(clean);
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const clean = plainRuntimeJsonValue(item, seen);
    if (clean !== undefined) output[key] = clean;
  }
  return output;
}

function plainRuntimeJsonRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return plainRuntimeJsonValue(value) as Readonly<Record<string, unknown>>;
}

function artifactId(kind: string): string {
  return `artifact:${kind}:${randomUUID()}`;
}

function artifactRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.join(workspaceRoot(context), ".rax_workspace", "artifacts", context.sessionId.replace(/[^a-zA-Z0-9_.-]/gu, "_"));
}

function servicesRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.join(workspaceRoot(context), ".rax_workspace", "services");
}

function servicesRegistryPath(context: RuntimeBaseToolExecutorContext): string {
  return path.join(servicesRoot(context), "registry.jsonl");
}

function safeArtifactStem(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 80);
  return safe.length > 0 ? safe : "service";
}

function tailText(value: string, maxChars = 4096): string {
  if (value.length <= maxChars) return value;
  return value.slice(value.length - maxChars);
}

function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function artifactFileBytes(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function artifactTail(filePath: string, maxChars = 4096): string {
  try {
    return tailText(readFileSync(filePath, "utf8"), maxChars);
  } catch {
    return "";
  }
}

type ManagedShellProcess = {
  child: ReturnType<typeof spawn>;
  pid?: number;
  cwd: string;
  command: string;
  args: readonly string[];
  launchMode: "background" | "detached" | "service";
  stdoutArtifactRef: string;
  stderrArtifactRef: string;
  stdoutBytes: () => number;
  stderrBytes: () => number;
  lastStdout: () => string;
  lastStderr: () => string;
  exitCode: () => number | null;
  alive: () => boolean;
};

function serviceHealth(input: {
  probe?: BaseToolShellServiceProbe;
  verified: boolean;
  healthy: boolean;
  status: BaseToolShellServiceStatus;
  details?: Readonly<Record<string, unknown>>;
}): BaseToolShellServiceHealth {
  return {
    probe: input.probe,
    verified: input.verified,
    healthy: input.healthy,
    status: input.status,
    checkedAt: new Date().toISOString(),
    details: input.details,
  };
}

function serviceVerificationProbe(verification: BaseToolShellServiceVerification | undefined): BaseToolShellServiceProbe | undefined {
  if (verification === undefined) return undefined;
  if (verification.kind === "process") return { type: "process" };
  if (verification.kind === "tcp") return { type: "tcp", host: verification.host, port: verification.port };
  if (verification.kind === "http") {
    return {
      type: "http",
      url: verification.url,
      expectedStatus: verification.expectedStatus,
      method: verification.method,
    };
  }
  if (verification.kind === "log") {
    return {
      type: "log",
      pattern: verification.pattern,
      stream: verification.stream,
      regex: verification.regex,
    };
  }
  return {
    type: "command",
    command: verification.command,
    args: verification.args,
    cwd: verification.cwd,
    timeoutMs: verification.timeoutMs,
  };
}

function serviceLifecycleSnapshot(
  managed: ManagedShellProcess,
  health: BaseToolShellServiceHealth,
  listeningPorts: readonly number[] = [],
): BaseToolShellServiceStatusSnapshot {
  const alive = managed.alive();
  const exitCode = managed.exitCode();
  const status: BaseToolShellServiceStatus = health.status === "healthy"
    ? "healthy"
    : exitCode !== null
      ? "exited"
      : health.verified
        ? "failed"
        : alive
          ? "alive"
          : "spawned";
  const stdoutBytes = managed.stdoutBytes();
  const stderrBytes = managed.stderrBytes();
  return {
    pid: managed.pid,
    cwd: managed.cwd,
    command: managed.command,
    args: managed.args,
    launchMode: managed.launchMode,
    alive,
    exitCode,
    listeningPorts,
    lastStdout: managed.lastStdout(),
    lastStderr: managed.lastStderr(),
    stdoutBytes,
    stderrBytes,
    stdoutArtifactRef: managed.stdoutArtifactRef,
    stderrArtifactRef: managed.stderrArtifactRef,
    truncatedForDisplay: stdoutBytes > managed.lastStdout().length || stderrBytes > managed.lastStderr().length,
    status,
    health,
  };
}

function legacyProcessLifecycleFromSnapshot(
  snapshot: BaseToolShellServiceStatusSnapshot,
  handle: string,
): Readonly<Record<string, unknown>> {
  return plainRuntimeJsonRecord({
    kind: "runtime.processLifecycle.snapshot",
    handle,
    pid: snapshot.pid,
    phase: snapshot.alive ? "started" : "released",
    processState: snapshot.alive ? "running" : "released",
    command: snapshot.command,
    cwd: snapshot.cwd,
    started: true,
    verificationStatus: snapshot.health.verified ? snapshot.health.status : "not-run",
    verificationReason: snapshot.health.verified
      ? "runtime service lifecycle probe recorded a concrete health state"
      : "generic process startup does not prove service reachability",
    userReachability: snapshot.health.healthy ? "verified" : "not-verified",
    nextRequiredAction: snapshot.health.healthy ? undefined : "verify",
  });
}

function managedOutputFields(
  snapshot: BaseToolShellServiceStatusSnapshot,
): Readonly<Record<string, unknown>> {
  return plainRuntimeJsonRecord({
    pid: snapshot.pid,
    cwd: snapshot.cwd,
    command: snapshot.command,
    args: snapshot.args,
    launchMode: snapshot.launchMode,
    alive: snapshot.alive,
    exitCode: snapshot.exitCode,
    listeningPorts: snapshot.listeningPorts,
    lastStdout: snapshot.lastStdout,
    lastStderr: snapshot.lastStderr,
    stdoutBytes: snapshot.stdoutBytes,
    stderrBytes: snapshot.stderrBytes,
    stdoutArtifactRef: snapshot.stdoutArtifactRef,
    stderrArtifactRef: snapshot.stderrArtifactRef,
    truncatedForDisplay: snapshot.truncatedForDisplay,
    serviceStatus: snapshot.status,
    verificationStatus: snapshot.health.verified ? snapshot.health.status : "unverified",
    healthy: snapshot.health.healthy,
    health: snapshot.health,
    statusSnapshot: snapshot,
  });
}

async function appendServiceRegistry(
  context: RuntimeBaseToolExecutorContext,
  record: Readonly<Record<string, unknown>>,
): Promise<string> {
  const registryPath = servicesRegistryPath(context);
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(plainRuntimeJsonRecord(record))}\n`, { flag: "a" });
  return registryPath;
}

async function startManagedShellProcess(input: {
  context: RuntimeBaseToolExecutorContext;
  command: string;
  args?: readonly string[];
  cwd: string;
  shell?: boolean | string;
  env?: Readonly<Record<string, string>>;
  handle: string;
  launchMode: "background" | "detached" | "service";
}): Promise<BaseToolExecutorResult<ManagedShellProcess>> {
  const root = artifactRoot(input.context);
  await mkdir(root, { recursive: true });
  const artifactStem = `${safeArtifactStem(input.handle)}-${randomUUID()}`;
  const stdoutArtifactRef = path.join(root, `${artifactStem}-stdout.log`);
  const stderrArtifactRef = path.join(root, `${artifactStem}-stderr.log`);
  await writeFile(stdoutArtifactRef, "");
  await writeFile(stderrArtifactRef, "");

  const stdoutStream = createWriteStream(stdoutArtifactRef, { flags: "a" });
  const stderrStream = createWriteStream(stderrArtifactRef, { flags: "a" });
  let stdoutTail = "";
  let stderrTail = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let exitCode: number | null = null;

  const child = spawn(input.command, [...(input.args ?? [])], {
    cwd: input.cwd,
    env: input.env === undefined ? undefined : { ...process.env, ...input.env },
    shell: input.shell,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const appendChunk = (stream: "stdout" | "stderr", chunk: Buffer): void => {
    if (stream === "stdout") {
      stdoutBytes += chunk.byteLength;
      stdoutTail = tailText(stdoutTail + chunk.toString("utf8"));
      stdoutStream.write(chunk);
      return;
    }
    stderrBytes += chunk.byteLength;
    stderrTail = tailText(stderrTail + chunk.toString("utf8"));
    stderrStream.write(chunk);
  };

  child.stdout?.on("data", (chunk: Buffer) => appendChunk("stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer) => appendChunk("stderr", chunk));
  (child.stdout as unknown as { unref?: () => void } | undefined)?.unref?.();
  (child.stderr as unknown as { unref?: () => void } | undefined)?.unref?.();
  child.once("close", (code) => {
    exitCode = code ?? 0;
    stdoutStream.end();
    stderrStream.end();
  });
  child.once("error", (error) => {
    exitCode = 1;
    stdoutStream.end();
    stderrStream.end();
    void error;
  });

  return success({
    child,
    pid: child.pid,
    cwd: input.cwd,
    command: input.command,
    args: input.args ?? [],
    launchMode: input.launchMode,
    stdoutArtifactRef,
    stderrArtifactRef,
    stdoutBytes: () => Math.max(stdoutBytes, artifactFileBytes(stdoutArtifactRef)),
    stderrBytes: () => Math.max(stderrBytes, artifactFileBytes(stderrArtifactRef)),
    lastStdout: () => tailText(stdoutTail || artifactTail(stdoutArtifactRef)),
    lastStderr: () => tailText(stderrTail || artifactTail(stderrArtifactRef)),
    exitCode: () => exitCode,
    alive: () => exitCode === null && pidAlive(child.pid),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeTcp(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

type LocalPortListenerProcess = {
  pid: number;
  command?: string;
  cwd?: string;
  port: number;
  cwdInsideWorkspaceRoot?: boolean;
};

type LocalPortListenerSnapshot = {
  port: number;
  listening: boolean;
  workspaceRoot: string;
  processes: readonly LocalPortListenerProcess[];
  serviceOwnership: "not-listening" | "current-workspace" | "foreign-workspace" | "unknown";
  staleServiceRisk: boolean;
  warning?: string;
};

async function hostCommandStdout(command: string, args: readonly string[], timeoutMs = 750): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(stdout);
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.once("close", () => {
      clearTimeout(timer);
      resolve(stdout);
    });
  });
}

async function inspectLocalListeningPort(port: number, context: RuntimeBaseToolExecutorContext): Promise<LocalPortListenerSnapshot> {
  const root = workspaceRoot(context);
  const pidText = await hostCommandStdout("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  const pids = [...new Set(pidText.split(/\s+/u)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0))];
  const processes = await Promise.all(pids.map(async (pid): Promise<LocalPortListenerProcess> => {
    const command = await readFile(`/proc/${pid}/comm`, "utf8")
      .then((value) => value.trim() || undefined)
      .catch(() => undefined);
    const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => undefined);
    const cwdInsideWorkspaceRoot = cwd === undefined ? undefined : isInsideAllowedRoots(cwd, [root]);
    return {
      pid,
      command,
      cwd,
      port,
      cwdInsideWorkspaceRoot,
    };
  }));
  const serviceOwnership: LocalPortListenerSnapshot["serviceOwnership"] = processes.length === 0
    ? "not-listening"
    : processes.some((item) => item.cwdInsideWorkspaceRoot === true)
      ? "current-workspace"
      : processes.some((item) => item.cwdInsideWorkspaceRoot === false)
        ? "foreign-workspace"
        : "unknown";
  const staleServiceRisk = serviceOwnership === "foreign-workspace";
  return plainRuntimeJsonRecord({
    port,
    listening: processes.length > 0,
    workspaceRoot: root,
    processes,
    serviceOwnership,
    staleServiceRisk,
    warning: staleServiceRisk
      ? "A listener exists on this port, but its cwd is outside the current workspaceRoot; this may be a stale service."
      : undefined,
  }) as LocalPortListenerSnapshot;
}

function localPortFromUrl(value: string): number | undefined {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    if (!["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) return undefined;
    if (parsed.port.length > 0) {
      const port = Number(parsed.port);
      return Number.isInteger(port) && port > 0 ? port : undefined;
    }
    if (parsed.protocol === "http:") return 80;
    if (parsed.protocol === "https:") return 443;
    return undefined;
  } catch {
    return undefined;
  }
}

async function evaluateServiceProbe(
  verification: BaseToolShellServiceVerification | undefined,
  managed: ManagedShellProcess,
  context: RuntimeBaseToolExecutorContext,
): Promise<{
  passed: boolean;
  status: BaseToolShellServiceStatus;
  failureReason?: string;
  details?: Readonly<Record<string, unknown>>;
  listeningPorts?: readonly number[];
}> {
  const probe = serviceVerificationProbe(verification);
  if (probe === undefined) {
    return {
      passed: false,
      status: "unverified",
      details: { reason: "no probe configured" },
    };
  }

  if (probe.type === "process") {
    const alive = managed.alive();
    return {
      passed: alive,
      status: alive ? "healthy" : "exited",
      failureReason: alive ? undefined : "process exited before health probe passed; read stderrArtifactRef",
      details: { alive },
    };
  }

  if (probe.type === "tcp") {
    const host = probe.host ?? "127.0.0.1";
    const passed = await probeTcp(host, probe.port);
    const listener = await inspectLocalListeningPort(probe.port, context);
    return {
      passed,
      status: passed ? "healthy" : managed.alive() ? "failed" : "exited",
      failureReason: passed ? undefined : `tcp port ${probe.port} not listening after timeout`,
      details: {
        host,
        port: probe.port,
        listener,
        serviceOwnership: listener.serviceOwnership,
        staleServiceRisk: listener.staleServiceRisk,
      },
      listeningPorts: passed ? [probe.port] : [],
    };
  }

  if (probe.type === "http") {
    const expectedStatus = probe.expectedStatus ?? 200;
    const localPort = localPortFromUrl(probe.url);
    const listener = localPort === undefined ? undefined : await inspectLocalListeningPort(localPort, context);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1_000);
      const response = await fetch(probe.url, {
        method: probe.method ?? "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      const expectedText = verification?.kind === "http" ? verification.expectedText : undefined;
      const responseText = expectedText === undefined ? undefined : await response.text();
      const statusPassed = response.status === expectedStatus;
      const textPassed = expectedText === undefined || responseText?.includes(expectedText) === true;
      const passed = statusPassed && textPassed;
      return {
        passed,
        status: passed ? "healthy" : "failed",
        failureReason: passed
          ? undefined
          : statusPassed
            ? "http probe response did not contain expected text"
            : `http probe returned ${response.status}`,
        details: {
          url: probe.url,
          expectedStatus,
          actualStatus: response.status,
          expectedText,
          listener,
          serviceOwnership: listener?.serviceOwnership,
          staleServiceRisk: listener?.staleServiceRisk,
        },
        listeningPorts: localPort === undefined || !passed ? [] : [localPort],
      };
    } catch (error) {
      return {
        passed: false,
        status: managed.alive() ? "failed" : "exited",
        failureReason: `http probe failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          url: probe.url,
          expectedStatus,
          listener,
          serviceOwnership: listener?.serviceOwnership,
          staleServiceRisk: listener?.staleServiceRisk,
        },
      };
    }
  }

  if (probe.type === "log") {
    const source = probe.stream === "stderr"
      ? managed.lastStderr()
      : probe.stream === "stdout"
        ? managed.lastStdout()
        : `${managed.lastStdout()}\n${managed.lastStderr()}`;
    const passed = probe.regex === true
      ? new RegExp(probe.pattern, "u").test(source)
      : source.includes(probe.pattern);
    return {
      passed,
      status: passed ? "healthy" : managed.alive() ? "failed" : "exited",
      failureReason: passed ? undefined : "log pattern not observed before timeout",
      details: { pattern: probe.pattern, stream: probe.stream ?? "both", regex: probe.regex === true },
    };
  }

  const commandResult = await runChildProcess({
    command: probe.command,
    args: probe.args,
    cwd: probe.cwd,
    timeoutMs: probe.timeoutMs ?? 2_000,
    shell: probe.args === undefined || probe.args.length === 0,
    intent: "service-probe",
  }, context, "shell.startServiceAndVerify.probe");
  if (!commandResult.ok) {
    return {
      passed: false,
      status: managed.alive() ? "failed" : "exited",
      failureReason: commandResult.error.message,
    };
  }
  const expectedText = verification?.kind === "command" ? verification.expectedText : undefined;
  const textSource = `${commandResult.output.stdout}\n${commandResult.output.stderr}`;
  const passed = commandResult.output.exitCode === 0 && (expectedText === undefined || textSource.includes(expectedText));
  return {
    passed,
    status: passed ? "healthy" : managed.alive() ? "failed" : "exited",
    failureReason: passed
      ? undefined
      : commandResult.output.exitCode === 0
        ? "command probe output did not contain expected text"
        : `command probe exited ${commandResult.output.exitCode}`,
    details: {
      exitCode: commandResult.output.exitCode,
      stdout: tailText(commandResult.output.stdout, 1024),
      stderr: tailText(commandResult.output.stderr, 1024),
      expectedText,
    },
  };
}

function probeFromServiceVerification(verification: BaseToolShellServiceVerification): BaseToolShellServiceProbe {
  if (verification.kind === "process") return { type: "process" };
  if (verification.kind === "tcp") {
    return {
      type: "tcp",
      host: verification.host,
      port: verification.port,
    };
  }
  if (verification.kind === "http") {
    return {
      type: "http",
      url: verification.url,
      expectedStatus: verification.expectedStatus,
      method: verification.method,
    };
  }
  if (verification.kind === "log") {
    return {
      type: "log",
      pattern: verification.pattern,
      stream: verification.stream,
      regex: verification.regex,
    };
  }
  return {
    type: "command",
    command: verification.command,
    args: verification.args,
    cwd: verification.cwd,
    timeoutMs: verification.timeoutMs,
  };
}

function serviceVerificationTimeoutMs(verification: BaseToolShellServiceVerification): number {
  return verification.timeoutMs ?? 30_000;
}

function serviceVerificationIntervalMs(verification: BaseToolShellServiceVerification): number {
  return verification.intervalMs ?? 500;
}

function serviceVerificationMaxAttempts(verification: BaseToolShellServiceVerification): number {
  const intervalMs = serviceVerificationIntervalMs(verification);
  return verification.maxAttempts ?? Math.max(1, Math.ceil(serviceVerificationTimeoutMs(verification) / intervalMs));
}

function recommendedNextActionsFor(input: {
  status: BaseToolShellServiceStatus;
  failureReason?: string;
  stdoutArtifactRef: string;
  stderrArtifactRef: string;
  probe?: BaseToolShellServiceProbe;
}): readonly string[] {
  if (input.status === "healthy") return [];
  const actions = [
    `read stderrArtifactRef: ${input.stderrArtifactRef}`,
    `read stdoutArtifactRef: ${input.stdoutArtifactRef}`,
  ];
  if (input.failureReason?.includes("tcp port")) {
    actions.push("check the configured port, process cwd, and whether the service binds 127.0.0.1 or 0.0.0.0");
  } else if (input.failureReason?.includes("http probe returned")) {
    actions.push("inspect the service error response and application logs before reporting availability");
  } else if (input.failureReason?.includes("log pattern")) {
    actions.push("inspect startup logs or choose a stronger process/tcp/http/command probe");
  } else if (input.status === "exited") {
    actions.push("restart after fixing the startup error shown in stderr");
  } else if (input.probe === undefined) {
    actions.push("run shell.serviceStartAndVerify with a process, tcp, http, log, or command probe");
  }
  return actions;
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

const linuxDesktopLauncherCommands = new Set([
  "microsoft-edge",
  "microsoft-edge-stable",
  "msedge",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "firefox",
  "xdg-open",
]);

const foregroundBrowserArgs = new Set(["--help", "-h", "--version", "-v", "--product-version"]);

function commandName(command: string): string {
  const firstToken = command.trim().split(/\s+/u)[0] ?? command;
  return path.basename(firstToken).toLowerCase();
}

function isDesktopLauncherRequest(request: { command: string; args?: readonly string[] }): boolean {
  if (process.platform !== "linux") return false;
  const name = commandName(request.command);
  if (!linuxDesktopLauncherCommands.has(name)) return false;
  const inlineArgs = request.args === undefined || request.args.length === 0 ? request.command.trim().split(/\s+/u).slice(1) : [];
  const args = [...inlineArgs, ...(request.args ?? [])];
  return !args.some((arg) => foregroundBrowserArgs.has(arg.trim().toLowerCase()));
}

function plainStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== "string") return undefined;
    output[key] = item;
  }
  return output;
}

function cleanStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !item.includes("\0"));
}

function runtimeProcessLifecycle(input: {
  handle: string;
  pid?: number;
  phase: "started" | "released";
  processState: "running" | "released";
  command: string;
  cwd: string;
  verificationReason: string;
}): Readonly<Record<string, unknown>> {
  return plainRuntimeJsonRecord({
    kind: "runtime.processLifecycle.snapshot",
    handle: input.handle,
    pid: input.pid,
    phase: input.phase,
    processState: input.processState,
    command: input.command,
    cwd: input.cwd,
    started: true,
    verificationStatus: "not-run",
    verificationReason: input.verificationReason,
    userReachability: "not-verified",
  });
}

function spawnTargetSpec(target: unknown): BaseToolExecutorResult<{
  command: string;
  args: readonly string[];
  cwd?: string;
  shell: boolean | string | undefined;
  env?: Readonly<Record<string, string>>;
  targetKind: "command" | "executable";
}> {
  const record = typeof target === "object" && target !== null && !Array.isArray(target)
    ? target as Readonly<Record<string, unknown>>
    : {};
  const executable = typeof record.executable === "string" && record.executable.trim().length > 0
    ? record.executable.trim()
    : undefined;
  const command = typeof record.command === "string" && record.command.trim().length > 0
    ? record.command.trim()
    : undefined;
  if (executable === undefined && command === undefined) {
    return failure("INVALID_REQUEST", "shell.spawnProcess target.executable or target.command is required");
  }
  if (executable !== undefined && command !== undefined) {
    return failure("INVALID_REQUEST", "shell.spawnProcess accepts either target.executable or target.command, not both");
  }

  const shellValue = typeof record.shell === "string" && record.shell.trim().length > 0 ? record.shell.trim() : undefined;
  const cwd = typeof record.workingDirectory === "string"
    ? record.workingDirectory
    : typeof record.cwd === "string"
      ? record.cwd
      : undefined;

  return success({
    command: command ?? executable ?? "",
    args: executable === undefined ? [] : cleanStringArray(record.args),
    cwd,
    shell: command === undefined ? false : shellValue ?? "sh",
    env: plainStringRecord(record.env),
    targetKind: command === undefined ? "executable" : "command",
  });
}

async function launchDetachedProcess(
  request: {
    command: string;
    args?: readonly string[];
    cwd: string;
    shell?: boolean | string;
    env?: Readonly<Record<string, string>>;
    allowQuickExit?: boolean;
    handle?: string;
    lifecycleKind?: "detached" | "background";
  },
  portPath: string,
): Promise<BaseToolExecutorResult<{
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  pid?: number;
  serviceLifecycle?: Readonly<Record<string, unknown>>;
}>> {
  const startedAt = Date.now();
  const launchGraceMs = request.allowQuickExit === true ? 80 : 750;
  const handle = request.handle ?? `${request.lifecycleKind ?? "detached"}:${randomUUID()}`;
  const lifecycleKind = request.lifecycleKind ?? "detached";

  return await new Promise((resolve) => {
    let settled = false;
    let launchConfirmed = false;
    const child = spawn(request.command, [...(request.args ?? [])], {
      cwd: request.cwd,
      env: request.env === undefined ? undefined : { ...process.env, ...request.env },
      shell: request.shell,
      detached: true,
      stdio: "ignore",
    });

    const settle = (result: BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string; durationMs?: number }>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.once("error", (error) => {
      settle(failure("PROVIDER_FAILURE", error.message, [`runtime.execEngine.baseToolExecutorPort.${portPath}.failed`]));
    });

    child.once("close", (code) => {
      if (settled) return;
      if (request.allowQuickExit === true && (code ?? 0) === 0) {
        settle(
          success(
            {
              exitCode: 0,
              stdout: `launched detached desktop process${child.pid === undefined ? "" : ` pid ${child.pid}`}\n`,
              stderr: "",
              durationMs: Date.now() - startedAt,
              pid: child.pid,
              serviceLifecycle: runtimeProcessLifecycle({
                handle,
                pid: child.pid,
                phase: "released",
                processState: "released",
                command: request.command,
                cwd: request.cwd,
                verificationReason: "desktop launcher exited after handing the request to the desktop session",
              }),
            },
            [`runtime.execEngine.baseToolExecutorPort.${portPath}.detached`],
            { detached: true, desktopLauncher: true, pid: child.pid },
          ),
        );
        return;
      }
      const quickExitPrefix = launchConfirmed
        ? "detached process exited after launch"
        : "detached process exited during startup";
      settle(failure("PROVIDER_FAILURE", `${quickExitPrefix} with code ${code ?? 1}`, [`runtime.execEngine.baseToolExecutorPort.${portPath}.failed`]));
    });

    setTimeout(() => {
      if (settled) return;
      launchConfirmed = true;
      child.unref();
      settle(
        success(
          {
            exitCode: 0,
            stdout: `launched detached${request.allowQuickExit === true ? " desktop" : ""} process${child.pid === undefined ? "" : ` pid ${child.pid}`}\n`,
            stderr: "",
            durationMs: Date.now() - startedAt,
            pid: child.pid,
            serviceLifecycle: runtimeProcessLifecycle({
              handle,
              pid: child.pid,
              phase: "started",
              processState: "running",
              command: request.command,
              cwd: request.cwd,
              verificationReason: lifecycleKind === "background"
                ? "generic background process startup does not prove the service URL is reachable"
                : "generic detached process startup does not prove user-facing service reachability",
            }),
          },
          [`runtime.execEngine.baseToolExecutorPort.${portPath}.detached`],
          { detached: true, desktopLauncher: request.allowQuickExit === true, pid: child.pid },
        ),
      );
    }, launchGraceMs).unref();
  });
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
  const cwdResult = resolveShellWorkingDirectory(context, request.cwd);
  if (!cwdResult.ok) return cwdResult;
  const cwdMetadata = cwdResult.metadata ?? {};

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

  if (isDesktopLauncherRequest(request)) {
    const detached = await launchDetachedProcess(
      {
        command: spawnSpec.output.command,
        args: spawnSpec.output.args,
        cwd: spawnSpec.output.cwd,
        shell: spawnSpec.output.shell,
        env: request.env,
        allowQuickExit: true,
      },
      portPath,
    );
    if (!detached.ok) return detached;
    emit(context, portPath, "runtime.execEngine.baseToolExecutorPort.process.detached", {
      command: request.command,
      pid: detached.metadata?.pid,
      sandbox,
    });
    return success(detached.output, detached.events, { ...cwdMetadata, ...(detached.metadata ?? {}), sandbox });
  }

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
            ...cwdMetadata,
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
      const pathMetadata = resolved.metadata ?? {};
      try {
        const bytes = await readFile(resolved.output);
        const maxBytes = request.maxBytes ?? context.resourceLimits?.maxReadBytes;
        const contentBytes = maxBytes === undefined ? bytes : bytes.subarray(0, maxBytes);
        emit(context, "filesystem.readText", "runtime.execEngine.baseToolExecutorPort.filesystem.readText");
        return success({
          content: contentBytes.toString(request.encoding === "utf16le" ? "utf16le" : "utf8"),
          truncated: maxBytes !== undefined && bytes.byteLength > maxBytes,
        }, [], pathMetadata);
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
      const pathMetadata = resolved.metadata ?? {};
      try {
        await mkdir(path.dirname(resolved.output), { recursive: true });
        const encoding = request.encoding === "utf16le" ? "utf16le" : "utf8";
        await writeFile(resolved.output, request.content, { encoding });
        emit(context, "filesystem.writeText", "runtime.execEngine.baseToolExecutorPort.filesystem.writeText");
        return success({ bytesWritten: Buffer.byteLength(request.content, encoding) }, [], pathMetadata);
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
      const pathMetadata = resolved.metadata ?? {};
      try {
        await rm(resolved.output, { recursive: request.recursive === true, force: true });
        emit(context, "filesystem.deletePath", "runtime.execEngine.baseToolExecutorPort.filesystem.deletePath");
        return success({ deleted: true }, [], pathMetadata);
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "filesystem delete failed");
      }
    },
    async list(request) {
      const resolved = resolveWithinAllowedRoots(context, request.path);
      if (!resolved.ok) return resolved;
      const pathMetadata = resolved.metadata ?? {};
      try {
        const maxEntries = request.maxEntries ?? context.resourceLimits?.maxListEntries ?? 200;
        const entries = await listDirectory(resolved.output, {
          depth: request.depth ?? 1,
          maxEntries,
          includeGlobs: request.includeGlobs,
          excludeGlobs: request.excludeGlobs,
        });
        emit(context, "filesystem.list", "runtime.execEngine.baseToolExecutorPort.filesystem.list");
        return success({ entries }, [], pathMetadata);
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
      const deniedPath = request.requestedPaths.find((requestedPath: string) => {
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
      if (context.policy?.allowShellExecution !== true && context.policy?.allowProcessExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime shell process spawning requires allowShellExecution=true or allowProcessExecution=true");
      }
      const targetSpec = spawnTargetSpec(request.target);
      if (!targetSpec.ok) return targetSpec;
      const launchMode = request.launchMode ?? "foreground";

      if (launchMode === "foreground") {
        const result = await runChildProcess({
          command: targetSpec.output.command,
          args: targetSpec.output.args,
          cwd: targetSpec.output.cwd,
          env: targetSpec.output.env,
          shell: targetSpec.output.shell,
          intent: "shell-process",
        }, context, "shell.spawnProcess");
        if (!result.ok) return result;
        return success(genericRuntimeOutput(context, "shell.spawnProcess", { target: request.target }, {
          launchMode,
          exitCode: result.output.exitCode,
          stdout: result.output.stdout,
          stderr: result.output.stderr,
          serviceLifecycle: result.metadata?.sandbox === undefined ? undefined : { sandbox: result.metadata.sandbox },
        }), result.events, result.metadata);
      }

      const cwdResult = resolveDetachedWorkingDirectory(context, targetSpec.output.cwd);
      if (!cwdResult.ok) return cwdResult;
      const spawnSpec = processCommand({
        command: targetSpec.output.command,
        args: targetSpec.output.args,
        shell: targetSpec.output.shell,
      }, context, cwdResult.output);
      if (!spawnSpec.ok) return spawnSpec;
      const handle = `process:${randomUUID()}`;
      const detached = await launchDetachedProcess(
        {
          command: spawnSpec.output.command,
          args: spawnSpec.output.args,
          cwd: spawnSpec.output.cwd,
          shell: spawnSpec.output.shell,
          env: targetSpec.output.env,
          allowQuickExit: isDesktopLauncherRequest({ command: targetSpec.output.command, args: targetSpec.output.args }),
          handle,
          lifecycleKind: launchMode === "background" ? "background" : "detached",
        },
        "shell.spawnProcess",
      );
      if (!detached.ok) return detached;
      const sandbox = sandboxMetadata(context, spawnSpec.output.sandboxApplied);
      const lifecycle = detached.output.serviceLifecycle;
      return success(genericRuntimeOutput(context, "shell.spawnProcess", { target: request.target }, {
        launchMode,
        processHandle: handle,
        spawnHandle: handle,
        status: "started",
        pid: detached.output.pid,
        exitCode: detached.output.exitCode,
        stdout: detached.output.stdout,
        stderr: "",
        serviceLifecycle: lifecycle,
      }), detached.events, { ...(detached.metadata ?? {}), sandbox });
    },
    async startBackground(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.startBackground", request);
      if (delegated !== undefined) return delegated;
      if (context.policy?.allowShellExecution !== true && context.policy?.allowProcessExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime background shell execution requires allowShellExecution=true or allowProcessExecution=true");
      }
      const cwdResult = resolveDetachedWorkingDirectory(context, request.cwd);
      if (!cwdResult.ok) return cwdResult;
      const spawnSpec = processCommand({ command: request.command, shell: request.shell }, context, cwdResult.output);
      if (!spawnSpec.ok) return spawnSpec;

      emit(context, "shell.startBackground", "runtime.execEngine.baseToolExecutorPort.process.background.starting", {
        command: request.command,
        cwd: cwdResult.output,
        jobId: request.jobId,
      });

      const background = await startManagedShellProcess({
        context,
        command: spawnSpec.output.command,
        args: spawnSpec.output.args,
        cwd: spawnSpec.output.cwd,
        shell: spawnSpec.output.shell,
        handle: request.jobId,
        launchMode: "background",
      });
      if (!background.ok) return background;
      await sleep(Math.min(250, Math.max(50, request.monitorIntervalMs)));
      background.output.child.unref();
      const health = serviceHealth({
        verified: false,
        healthy: false,
        status: "unverified",
        details: { verificationStatus: "not-run" },
      });
      const snapshot = serviceLifecycleSnapshot(background.output, health);
      const sandbox = sandboxMetadata(context, spawnSpec.output.sandboxApplied);
      emit(context, "shell.startBackground", "runtime.execEngine.baseToolExecutorPort.process.background", {
        command: request.command,
        pid: snapshot.pid,
        jobId: request.jobId,
        sandbox,
      });
      return success(genericRuntimeOutput(context, "shell.startBackground", { command: request.command, cwd: request.cwd }, {
        jobId: request.jobId,
        backgroundHandle: request.jobId,
        status: "started",
        captureOutput: request.captureOutput,
        outputCaptureStatus: request.captureOutput ? "artifact-backed" : "disabled",
        serviceLifecycle: legacyProcessLifecycleFromSnapshot(snapshot, request.jobId),
        ...managedOutputFields(snapshot),
      }), ["runtime.execEngine.baseToolExecutorPort.shell.startBackground.background"], {
        pid: snapshot.pid,
        sandbox,
        stdoutArtifactRef: snapshot.stdoutArtifactRef,
        stderrArtifactRef: snapshot.stderrArtifactRef,
      });
    },
    async startDetached(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.startDetached", request);
      if (delegated !== undefined) return delegated;

      if (context.policy?.allowShellExecution !== true && context.policy?.allowProcessExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime detached shell execution requires allowShellExecution=true or allowProcessExecution=true");
      }

      const cwdResult = resolveDetachedWorkingDirectory(context, request.cwd, { allowOsTmpdir: true });
      if (!cwdResult.ok) return cwdResult;

      const spawnSpec = processCommand({ command: request.command, shell: request.shell }, context, cwdResult.output);
      if (!spawnSpec.ok) return spawnSpec;

      emit(context, "shell.startDetached", "runtime.execEngine.baseToolExecutorPort.process.detached.starting", {
        command: request.command,
        cwd: cwdResult.output,
      });

      const detached = await startManagedShellProcess({
        context,
        command: spawnSpec.output.command,
        args: spawnSpec.output.args,
        cwd: spawnSpec.output.cwd,
        shell: spawnSpec.output.shell,
        handle: request.launchId,
        launchMode: "detached",
      });
      if (!detached.ok) return detached;
      await sleep(750);
      const health = serviceHealth({
        verified: false,
        healthy: false,
        status: "unverified",
        details: { verificationStatus: "not-run" },
      });
      const snapshot = serviceLifecycleSnapshot(detached.output, health);
      if (snapshot.exitCode !== null) {
        return failure("PROVIDER_FAILURE", `detached process exited during startup with code ${snapshot.exitCode}`, [
          "runtime.execEngine.baseToolExecutorPort.shell.startDetached.failed",
        ]);
      }
      detached.output.child.unref();

      const sandbox = sandboxMetadata(context, spawnSpec.output.sandboxApplied);
      emit(context, "shell.startDetached", "runtime.execEngine.baseToolExecutorPort.process.detached", {
        command: request.command,
        pid: snapshot.pid,
        sandbox,
      });

      return success(genericRuntimeOutput(context, "shell.startDetached", { command: request.command, cwd: cwdResult.output }, {
        launchId: request.launchId,
        status: "started",
        restartPolicy: request.restartPolicy,
        detachedHandle: request.launchId,
        stdout: `launched detached process${snapshot.pid === undefined ? "" : ` pid ${snapshot.pid}`}\n`,
        stderr: snapshot.lastStderr,
        serviceLifecycle: legacyProcessLifecycleFromSnapshot(snapshot, request.launchId),
        ...managedOutputFields(snapshot),
      }), ["runtime.execEngine.baseToolExecutorPort.shell.startDetached.detached"], {
        detached: true,
        pid: snapshot.pid,
        sandbox,
        stdoutArtifactRef: snapshot.stdoutArtifactRef,
        stderrArtifactRef: snapshot.stderrArtifactRef,
      });
    },
    async startServiceAndVerify(request) {
      const delegated = await callDelegated<Readonly<Record<string, unknown>>>(context, "shell.startServiceAndVerify", request);
      if (delegated !== undefined) return delegated;

      if (context.policy?.allowShellExecution !== true && context.policy?.allowProcessExecution !== true) {
        return failure("GOVERNANCE_REJECTED", "runtime service lifecycle execution requires allowShellExecution=true or allowProcessExecution=true");
      }

      const { start, verification } = request;
      const probe = serviceVerificationProbe(verification);
      const cwdResult = resolveDetachedWorkingDirectory(context, start.cwd);
      if (!cwdResult.ok) return cwdResult;
      const spawnSpec = processCommand({
        command: start.command,
        shell: start.shell,
      }, context, cwdResult.output);
      if (!spawnSpec.ok) return spawnSpec;

      const serviceId = start.serviceId ?? `service:${randomUUID()}`;
      const startedAt = new Date().toISOString();
      const service = await startManagedShellProcess({
        context,
        command: spawnSpec.output.command,
        args: spawnSpec.output.args,
        cwd: spawnSpec.output.cwd,
        shell: spawnSpec.output.shell,
        handle: serviceId,
        launchMode: "service",
      });
      if (!service.ok) return service;

      emit(context, "shell.startServiceAndVerify", "runtime.execEngine.baseToolExecutorPort.process.service.starting", {
        command: start.command,
        pid: service.output.pid,
        serviceId,
      });

      const timeout = Math.max(0, verification.timeoutMs ?? 30_000);
      const interval = Math.max(50, verification.intervalMs ?? 500);
      const maxAttempts = Math.max(1, verification.maxAttempts ?? Math.ceil(Math.max(timeout, interval) / interval));
      const deadline = Date.now() + timeout;
      let attempts = 0;
      let probeResult: Awaited<ReturnType<typeof evaluateServiceProbe>> = {
        passed: false,
        status: probe === undefined ? "unverified" : "spawned",
      };

      do {
        if (probe === undefined) {
          await sleep(Math.min(100, interval));
          probeResult = { passed: false, status: service.output.alive() ? "unverified" : "exited" };
          break;
        }
        attempts += 1;
        probeResult = await evaluateServiceProbe(verification, service.output, context);
        if (probeResult.passed || probeResult.status === "exited") break;
        await sleep(interval);
      } while (attempts < maxAttempts && Date.now() < deadline);

      if (probe !== undefined && !probeResult.passed && probeResult.failureReason === undefined) {
        probeResult = await evaluateServiceProbe(verification, service.output, context);
      }

      const status: BaseToolShellServiceStatus = probeResult.passed
        ? "healthy"
        : service.output.exitCode() !== null
          ? "exited"
          : probe === undefined
            ? "unverified"
            : "failed";
      const failureReason = status === "healthy"
        ? undefined
        : probeResult.failureReason ?? (status === "exited"
          ? "process exited before health probe passed; read stderrArtifactRef"
          : probe === undefined
            ? "no probe configured; service availability is unverified"
            : "health probe did not pass before timeout");
      const health = serviceHealth({
        probe,
        verified: probe !== undefined,
        healthy: status === "healthy",
        status,
        details: probeResult.details,
      });
      const snapshot = serviceLifecycleSnapshot(service.output, health, probeResult.listeningPorts ?? []);
      if (status !== "exited") {
        service.output.child.unref();
      }
      const recommendedNextActions = recommendedNextActionsFor({
        status,
        failureReason,
        stdoutArtifactRef: snapshot.stdoutArtifactRef,
        stderrArtifactRef: snapshot.stderrArtifactRef,
        probe,
      });
      const toolCallId = typeof request.context?.invocationId === "string" && request.context.invocationId.trim().length > 0
        ? request.context.invocationId
        : serviceId;
      const registryArtifactRef = await appendServiceRegistry(context, {
        sessionId: context.sessionId,
        toolCallId,
        pid: snapshot.pid,
        cwd: snapshot.cwd,
        command: start.command,
        args: [],
        launchMode: start.launchMode,
        probe,
        verification,
        status,
        health,
        startedAt,
        lastCheckedAt: health.checkedAt,
        stdoutArtifactRef: snapshot.stdoutArtifactRef,
        stderrArtifactRef: snapshot.stderrArtifactRef,
      });

      emit(context, "shell.startServiceAndVerify", `runtime.execEngine.baseToolExecutorPort.process.service.${status}`, {
        command: start.command,
        pid: snapshot.pid,
        serviceId,
        failureReason,
      });

      return success(genericRuntimeOutput(context, "shell.startServiceAndVerify", { command: start.command, cwd: cwdResult.output }, {
        serviceId,
        serviceHandle: serviceId,
        status,
        serviceStatus: status,
        health,
        failureReason,
        recommendedNextActions,
        registryArtifactRef,
        serviceLifecycle: legacyProcessLifecycleFromSnapshot(snapshot, serviceId),
        ...managedOutputFields(snapshot),
      }), [`runtime.execEngine.baseToolExecutorPort.shell.startServiceAndVerify.${status}`], {
        pid: snapshot.pid,
        stdoutArtifactRef: snapshot.stdoutArtifactRef,
        stderrArtifactRef: snapshot.stderrArtifactRef,
        registryArtifactRef,
      });
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
        const localPort = localPortFromUrl(request.url);
        const listener = localPort === undefined ? undefined : await inspectLocalListeningPort(localPort, context);
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
          ...(listener === undefined ? {} : {
            localPortProcess: listener,
            serviceOwnership: listener.serviceOwnership,
            staleServiceRisk: listener.staleServiceRisk,
          }),
        }, ["runtime.execEngine.baseToolExecutorPort.network.fetch.finished"], {
          truncated: bytes.byteLength > maxBytes,
          ...(listener === undefined ? {} : {
            localPortProcess: listener,
            serviceOwnership: listener.serviceOwnership,
            staleServiceRisk: listener.staleServiceRisk,
          }),
        });
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
      try {
        const maxResults = Math.max(1, Math.min(request.maxResults ?? 10, 20));
        const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(request.query)}`;
        const response = await fetch(url, {
          headers: {
            "accept": "text/html,application/xhtml+xml",
            "user-agent": "Mozilla/5.0 PraxisRuntime/0.1 search adapter",
          },
          signal: AbortSignal.timeout(timeoutMs(context, 15_000)),
        });
        const html = await response.text();
        const results = parseDuckDuckGoHtmlResults(html, maxResults);
        emit(context, "network.search", "runtime.execEngine.baseToolExecutorPort.network.search", {
          query: request.query,
          status: response.status,
          resultCount: results.length,
        });
        return success({
          results,
          providerMetadata: {
            provider: request.provider ?? "generic",
            backend: "duckduckgo-html",
            status: response.status,
            liveRankedResults: results.length > 0,
          },
        }, ["runtime.execEngine.baseToolExecutorPort.network.search.finished"]);
      } catch (error) {
        return failure("PROVIDER_FAILURE", error instanceof Error ? error.message : "runtime network.search failed");
      }
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
        .filter((item: { url?: unknown }) => typeof item.url === "string" && item.url.length > 0)
        .map((item: { url: string; title?: string; excerpt?: string }) => ({ url: item.url, title: item.title, snippet: item.excerpt }));
      return success({
        answer: citations.length > 0 ? request.claim : undefined,
        grounded: citations.length >= (request.minimumEvidenceCount ?? 1),
        status: citations.length >= (request.minimumEvidenceCount ?? 1) ? "grounded" : "unsupported",
        confidence: citations.length > 0 ? "medium" : "not-evaluated",
        citations,
        sources: citations.map((citation: { url: string; title?: string; snippet?: string }) => ({ ...citation, kind: "citation" as const })),
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
        entries: request.sources.map((source: { source?: unknown }) => ({
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
  const configuredMcp = context.mcpServers !== undefined && context.mcpServers.length > 0
    ? createMcpRuntimeAdapter({ servers: context.mcpServers })
    : undefined;
  const callConfigured = async <Output>(method: keyof NonNullable<BaseToolExecutorPort["mcp"]>, request: unknown): Promise<BaseToolExecutorResult<Output> | undefined> => {
    const handler = configuredMcp?.[method];
    if (typeof handler !== "function") return undefined;
    return await (handler as (value: unknown) => Promise<BaseToolExecutorResult<Output>> | BaseToolExecutorResult<Output>)(request);
  };
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
      const configured = await callConfigured<any>("authenticate", request);
      if (configured !== undefined) return configured;
      return success({ status: "authenticated", serverId: request.serverId, authSessionId: `mcp-auth:${request.serverId}`, scopesGranted: request.requestedScopes ?? [], providerMetadata: metadata(request.serverId) });
    },
    async authorize(request) {
      const delegated = await callDelegated(context, "mcp.authorize", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("authorize", request);
      if (configured !== undefined) return configured;
      return success({ decision: "allowed", reason: "runtime MCP policy adapter allowed this governed test request", scopesGranted: request.requestedScopes ?? [], providerMetadata: metadata(request.serverId) });
    },
    async cache(request) {
      const delegated = await callDelegated(context, "mcp.cache", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("cache", request);
      if (configured !== undefined) return configured;
      return success({ cacheKey: request.cacheKey, status: "cached", providerMetadata: metadata(request.serverId) });
    },
    async invalidateCache(request) {
      const delegated = await callDelegated(context, "mcp.invalidateCache", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("invalidateCache", request);
      if (configured !== undefined) return configured;
      return success({ scope: request.scope, cacheKey: request.cacheKey, status: "invalidated", invalidatedCount: 1, providerMetadata: metadata(request.serverId) });
    },
    async connect(request) {
      const delegated = await callDelegated(context, "mcp.connect", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("connect", request);
      if (configured !== undefined) return configured;
      return success({ connectionId: request.connectionId ?? `mcp-conn:${request.serverId}`, status: "connected", serverId: request.serverId, providerMetadata: { ...metadata(request.serverId), transportHint: request.transportHint ?? "stdio" } });
    },
    async disconnect(request) {
      const delegated = await callDelegated(context, "mcp.disconnect", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("disconnect", request);
      if (configured !== undefined) return configured;
      return success({ connectionId: request.connectionId, status: "disconnected", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async subscribe(request) {
      const delegated = await callDelegated(context, "mcp.subscribe", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("subscribe", request);
      if (configured !== undefined) return configured;
      return success({ subscriptionId: `mcp-sub:${request.serverId}:${request.subject}`, status: "subscribed", serverId: request.serverId, connectionId: request.connectionId, providerMetadata: metadata(request.serverId) });
    },
    async unsubscribe(request) {
      const delegated = await callDelegated(context, "mcp.unsubscribe", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("unsubscribe", request);
      if (configured !== undefined) return configured;
      return success({ subscriptionId: request.subscriptionId, status: "unsubscribed", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async callTool(request) {
      const delegated = await callDelegated(context, "mcp.callTool", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("callTool", request);
      if (configured !== undefined) return configured;
      return success({ content: [{ type: "text", text: `local MCP echo tool ${request.toolName}` }], structuredContent: request.arguments ?? {}, providerMetadata: metadata(request.serverId) });
    },
    async streamTool(request) {
      const delegated = await callDelegated(context, "mcp.streamTool", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("streamTool", request);
      if (configured !== undefined) return configured;
      return success({ executionId: `mcp-exec:${randomUUID()}`, streamId: `mcp-stream:${randomUUID()}`, status: "completed", channel: request.channel ?? "chunks", chunks: [], events: [], providerMetadata: metadata(request.serverId) });
    },
    async cancelExecution(request) {
      const delegated = await callDelegated(context, "mcp.cancelExecution", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("cancelExecution", request);
      if (configured !== undefined) return configured;
      return success({ executionId: request.executionId, status: "cancelled", serverId: request.serverId, providerMetadata: metadata(request.serverId) });
    },
    async nativeExecute(request) {
      const delegated = await callDelegated(context, "mcp.nativeExecute", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("nativeExecute", request);
      if (configured !== undefined) return configured;
      return success({ status: "executed", result: { method: request.method, params: request.params ?? {} }, providerMetadata: metadata(request.serverId) });
    },
    async listTools(request) {
      const delegated = await callDelegated(context, "mcp.listTools", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("listTools", request);
      if (configured !== undefined) return configured;
      return success({ tools: [{ name: "echo", title: "Echo", description: "Local MCP smoke-test echo tool.", inputSchema: { type: "object", additionalProperties: true }, namespace: request.namespace }], providerMetadata: metadata(request.serverId) });
    },
    async registerTool(request) {
      const delegated = await callDelegated(context, "mcp.registerTool", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("registerTool", request);
      if (configured !== undefined) return configured;
      return success({ name: request.tool.name, status: "registered", providerMetadata: metadata(request.serverId) });
    },
    async updateTool(request) {
      const delegated = await callDelegated(context, "mcp.updateTool", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("updateTool", request);
      if (configured !== undefined) return configured;
      return success({ toolName: request.toolName, status: "updated", providerMetadata: metadata(request.serverId) });
    },
    async unregisterTool(request) {
      const delegated = await callDelegated(context, "mcp.unregisterTool", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("unregisterTool", request);
      if (configured !== undefined) return configured;
      return success({ toolName: request.toolName, status: "unregistered", providerMetadata: metadata(request.serverId) });
    },
    async listResources(request) {
      const delegated = await callDelegated(context, "mcp.listResources", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("listResources", request);
      if (configured !== undefined) return configured;
      return success({ resources: [{ uri: `${request.uriPrefix ?? "mcp://local"}/echo`, name: "echo-resource", mimeType: "text/plain" }], exhausted: true, providerMetadata: metadata(request.serverId) });
    },
    async readResource(request) {
      const delegated = await callDelegated(context, "mcp.readResource", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("readResource", request);
      if (configured !== undefined) return configured;
      return success({ uri: request.resourceUri, contents: [{ mimeType: "text/plain", text: `local MCP resource ${request.resourceUri}` }], truncated: false, providerMetadata: metadata(request.serverId) });
    },
    async createResource(request) {
      const delegated = await callDelegated(context, "mcp.createResource", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("createResource", request);
      if (configured !== undefined) return configured;
      return success({ uri: request.uri, status: "created", revision: "1", providerMetadata: metadata(request.serverId) });
    },
    async updateResource(request) {
      const delegated = await callDelegated(context, "mcp.updateResource", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("updateResource", request);
      if (configured !== undefined) return configured;
      return success({ uri: request.resourceUri, status: "updated", revision: request.expectedRevision ?? "2", providerMetadata: metadata(request.serverId) });
    },
    async deleteResource(request) {
      const delegated = await callDelegated(context, "mcp.deleteResource", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("deleteResource", request);
      if (configured !== undefined) return configured;
      return success({ uri: request.uri, status: "deleted", providerMetadata: metadata(request.serverId) });
    },
    async ping(request) {
      const delegated = await callDelegated(context, "mcp.ping", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("ping", request);
      if (configured !== undefined) return configured;
      return success({ healthy: true, status: "ok", latencyMs: 0, providerMetadata: metadata(request.serverId) });
    },
    async checkHealth(request) {
      const delegated = await callDelegated(context, "mcp.checkHealth", request);
      if (delegated !== undefined) return delegated;
      const configured = await callConfigured<any>("checkHealth", request);
      if (configured !== undefined) return configured;
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

function desktopAutomationEnabled(context: RuntimeBaseToolExecutorContext, request?: ComputerUseDesktopActionRequest): boolean {
  if (request?.metadata?.runtimeGuardAccepted === true) return true;
  const env = context.environment ?? process.env;
  if (env.PRAXIS_ENABLE_DESKTOP_AUTOMATION === "1" || env.PRAXIS_ENABLE_DESKTOP_AUTOMATION === "true") return true;
  const profile = context.sandbox?.policyProfile;
  return profile === "bapr" || profile === "yolo";
}

async function captureLinuxScreenshot(
  context: RuntimeBaseToolExecutorContext,
  portPath: string,
  outputFormat: string | undefined,
): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType: string; metadata?: Readonly<Record<string, unknown>> }>> {
  const desktop = detectLinuxDesktopHost(context);
  const displayServer = typeof desktop.displayServer === "string" ? desktop.displayServer : "unknown";
  const root = artifactRoot(context);
  await mkdir(root, { recursive: true });
  const extension = outputFormat === "jpg" || outputFormat === "jpeg" ? "jpg" : "png";
  const providers = await screenshotProviderCommands();
  if (providers.length === 0) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      `computeruse screenshot requires xdg-desktop-portal, grim, gdbus, or gnome-screenshot on this Linux desktop host; detected display server: ${displayServer}`,
      [`runtime.execEngine.baseToolExecutorPort.${portPath}.dependencyMissing`],
    );
  }

  const failures: string[] = [];
  for (const provider of providers) {
    const filePath = path.join(root, `screenshot-${randomUUID()}.${extension}`);
    const result = await runChildProcess({
      command: provider.command,
      args: provider.args(filePath),
      cwd: workspaceRoot(context),
      timeoutMs: provider.timeoutMs,
      intent: "generic",
    }, context, portPath);
    if (!result.ok) {
      failures.push(`${provider.name}: ${result.error.message}`);
      continue;
    }
    if (result.output.exitCode !== 0) {
      failures.push(`${provider.name}: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`);
      continue;
    }
    const hasFile = await access(filePath, fsConstants.R_OK).then(() => true).catch(() => false);
    if (!hasFile) {
      failures.push(`${provider.name}: provider exited successfully but produced no screenshot artifact`);
      continue;
    }

    return success({
      artifactId: artifactId("screenshot"),
      mimeType: extension === "jpg" ? "image/jpeg" : "image/png",
      metadata: desktopAutomationMetadata(context, {
        storageUri: filePath,
        captureProvider: provider.name,
        attemptedProviders: providers.map((candidate) => candidate.name),
      }),
    }, [`runtime.execEngine.baseToolExecutorPort.${portPath}.captured`]);
  }

  return failure("PROVIDER_FAILURE", failures.join("; ") || "desktop screenshot command failed", [
    `runtime.execEngine.baseToolExecutorPort.${portPath}.failed`,
  ]);
}

type ScreenshotProviderCommand = {
  name: string;
  command: string;
  timeoutMs: number;
  args: (filePath: string) => readonly string[];
};

async function screenshotProviderCommands(): Promise<readonly ScreenshotProviderCommand[]> {
  const providers: ScreenshotProviderCommand[] = [];
  const gtkLaunchProvider = await gtkPortalScreenshotProviderCommand();
  if (gtkLaunchProvider !== undefined) providers.push(gtkLaunchProvider);

  const python = await firstExecutable(["/usr/bin/python3", "/usr/local/bin/python3"]);
  if (python !== undefined) {
    providers.push({
      name: "xdg-desktop-portal-screenshot",
      command: python,
      timeoutMs: 20_000,
      args: (filePath) => ["-c", xdgPortalScreenshotPythonScript, filePath],
    });
  }

  const grim = await firstExecutable(["/usr/bin/grim", "/usr/local/bin/grim"]);
  if (grim !== undefined) {
    providers.push({
      name: "grim",
      command: grim,
      timeoutMs: 10_000,
      args: (filePath) => [filePath],
    });
  }

  const gdbus = await firstExecutable(["/usr/bin/gdbus", "/usr/local/bin/gdbus", "/home/linuxbrew/.linuxbrew/bin/gdbus"]);
  if (gdbus !== undefined) {
    providers.push({
      name: "gnome-shell-screenshot-dbus",
      command: gdbus,
      timeoutMs: 10_000,
      args: (filePath) => [
        "call",
        "--session",
        "--dest",
        "org.gnome.Shell.Screenshot",
        "--object-path",
        "/org/gnome/Shell/Screenshot",
        "--method",
        "org.gnome.Shell.Screenshot.Screenshot",
        "false",
        "false",
        filePath,
      ],
    });
  }

  const gnomeScreenshot = await firstExecutable(["/usr/bin/gnome-screenshot", "/usr/local/bin/gnome-screenshot"]);
  if (gnomeScreenshot !== undefined) {
    providers.push({
      name: "gnome-screenshot",
      command: gnomeScreenshot,
      timeoutMs: 10_000,
      args: (filePath) => ["-f", filePath],
    });
  }

  return providers;
}

async function gtkPortalScreenshotProviderCommand(): Promise<ScreenshotProviderCommand | undefined> {
  const gtkLaunch = await firstExecutable(["/usr/bin/gtk-launch", "/usr/local/bin/gtk-launch"]);
  const python = await firstExecutable(["/usr/bin/python3", "/usr/local/bin/python3"]);
  const env = await firstExecutable(["/usr/bin/env", "/usr/local/bin/env"]);
  if (gtkLaunch === undefined || python === undefined || env === undefined) return undefined;
  const home = process.env.HOME?.trim();
  if (home === undefined || home.length === 0) return undefined;

  const appId = "org.praxis.AgentScreenshotProvider";
  const binDir = path.join(home, ".local", "bin");
  const applicationsDir = path.join(home, ".local", "share", "applications");
  const helperPath = path.join(binDir, "praxis-portal-screenshot-helper");
  const desktopPath = path.join(applicationsDir, `${appId}.desktop`);
  await mkdir(binDir, { recursive: true });
  await mkdir(applicationsDir, { recursive: true });
  await writeFile(helperPath, gtkPortalScreenshotHelperPythonScript, "utf8");
  await chmod(helperPath, 0o755);
  await writeFile(desktopPath, [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Praxis Screenshot Provider",
    `Exec=${helperPath}`,
    "Icon=applications-system",
    "Terminal=false",
    "Categories=Utility;",
    "StartupNotify=true",
    "DBusActivatable=false",
    "",
  ].join("\n"), "utf8");

  return {
    name: "gtk-launch-xdg-desktop-portal-screenshot",
    command: env,
    timeoutMs: 35_000,
    args: (filePath) => [`PRAXIS_SCREENSHOT_OUTPUT=${filePath}`, gtkLaunch, appId],
  };
}

const gtkPortalScreenshotHelperPythonScript = String.raw`#!/usr/bin/python3
import gi
import os
import shutil
import sys
import urllib.parse

gi.require_version("Gtk", "4.0")
gi.require_version("Xdp", "1.0")
gi.require_version("XdpGtk4", "1.0")
from gi.repository import GLib, Gtk, Xdp, XdpGtk4

output_path = os.environ.get("PRAXIS_SCREENSHOT_OUTPUT") or (sys.argv[1] if len(sys.argv) > 1 else "")
if not output_path:
    print("PRAXIS_SCREENSHOT_OUTPUT is required", file=sys.stderr, flush=True)
    raise SystemExit(2)

app = Gtk.Application(application_id="org.praxis.AgentScreenshotProvider")
app.exit_status = 1

def on_activate(application):
    window = Gtk.ApplicationWindow(application=application, title="Praxis Screenshot Provider")
    window.set_default_size(360, 120)
    window.set_modal(True)
    window.set_child(Gtk.Label(label="Praxis screenshot provider"))
    window.present()

    def start_request():
        parent = XdpGtk4.parent_new_gtk(window)
        portal = Xdp.Portal.new()

        def done(portal, result, _data):
            try:
                uri = portal.take_screenshot_finish(result)
                if not uri or not uri.startswith("file://"):
                    print(f"portal returned no file URI: {uri!r}", file=sys.stderr, flush=True)
                    application.exit_status = 3
                else:
                    source = urllib.parse.unquote(urllib.parse.urlparse(uri).path)
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    shutil.copyfile(source, output_path)
                    print(f"OUTPUT {output_path}", flush=True)
                    application.exit_status = 0
            except Exception as exc:
                print(f"portal screenshot failed: {exc!r}", file=sys.stderr, flush=True)
                application.exit_status = 4
            finally:
                application.quit()

        portal.take_screenshot(parent, Xdp.ScreenshotFlags.NONE, None, done, None)
        return False

    GLib.timeout_add(700, start_request)
    GLib.timeout_add_seconds(30, lambda: (print("portal screenshot timed out", file=sys.stderr, flush=True), setattr(application, "exit_status", 124), application.quit(), False)[-1])

app.connect("activate", on_activate)
app.run([])
raise SystemExit(app.exit_status)
`;

const xdgPortalScreenshotPythonScript = String.raw`
import asyncio
import json
import os
import shutil
import sys
import urllib.parse

from dbus_next import Message, MessageType, Variant
from dbus_next.aio import MessageBus

async def main():
    output_path = sys.argv[1]
    bus = await MessageBus().connect()
    loop = asyncio.get_event_loop()
    response_future = loop.create_future()

    def on_message(message):
        if (
            message.message_type == MessageType.SIGNAL
            and message.interface == "org.freedesktop.portal.Request"
            and message.member == "Response"
            and not response_future.done()
        ):
            response_future.set_result(message)

    bus.add_message_handler(on_message)
    reply = await bus.call(Message(
        destination="org.freedesktop.portal.Desktop",
        path="/org/freedesktop/portal/desktop",
        interface="org.freedesktop.portal.Screenshot",
        member="Screenshot",
        signature="sa{sv}",
        body=["", {"interactive": Variant("b", False), "modal": Variant("b", False)}],
    ))
    if reply.message_type != MessageType.METHOD_RETURN:
        print(json.dumps({"error": reply.error_name, "body": reply.body}), file=sys.stderr)
        return 2

    handle = reply.body[0]
    await bus.call(Message(
        destination="org.freedesktop.DBus",
        path="/org/freedesktop/DBus",
        interface="org.freedesktop.DBus",
        member="AddMatch",
        signature="s",
        body=[f"type='signal',sender='org.freedesktop.portal.Desktop',path='{handle}',interface='org.freedesktop.portal.Request',member='Response'"],
    ))
    try:
        response_message = await asyncio.wait_for(response_future, timeout=15)
    finally:
        bus.disconnect()

    response, results = response_message.body
    if response != 0:
        print(json.dumps({"error": "portal response was not success", "response": response}), file=sys.stderr)
        return 3
    uri = results.get("uri")
    if uri is None:
        print(json.dumps({"error": "portal response did not include uri"}), file=sys.stderr)
        return 4
    parsed = urllib.parse.urlparse(uri.value)
    if parsed.scheme != "file":
        print(json.dumps({"error": "portal returned non-file uri", "uri": uri.value}), file=sys.stderr)
        return 5
    source_path = urllib.parse.unquote(parsed.path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    shutil.copyfile(source_path, output_path)
    print(json.dumps({"uri": uri.value, "output": output_path}))
    return 0

raise SystemExit(asyncio.run(main()))
`;

function ydotoolKeyEventSequences(keys: readonly string[] | undefined): readonly string[] | undefined {
  if (keys === undefined || keys.length === 0) return undefined;
  const sequences: string[] = [];
  for (const key of keys) {
    const normalized = key.trim().toLowerCase();
    const code = normalized === "enter" || normalized === "return" || normalized === "numpadenter"
      ? "28"
      : normalized === "escape" || normalized === "esc"
        ? "1"
        : normalized === "tab"
          ? "15"
          : normalized === "space"
            ? "57"
            : undefined;
    if (code === undefined) return undefined;
    sequences.push(`${code}:1`, `${code}:0`);
  }
  return sequences;
}

function ydotoolShortcutArgument(keys: readonly string[] | undefined): string | undefined {
  if (keys === undefined || keys.length < 2) return undefined;
  const mapped = keys.map((key) => {
    const normalized = key.trim().toLowerCase();
    if (normalized === "control" || normalized === "ctrl") return "ctrl";
    if (normalized === "command" || normalized === "cmd" || normalized === "meta" || normalized === "super") return "super";
    if (normalized === "option" || normalized === "alt") return "alt";
    if (normalized === "shift") return "shift";
    if (normalized === "escape") return "esc";
    if (normalized === "return") return "enter";
    return normalized.length === 1 ? normalized : normalized.replace(/\s+/gu, "-");
  });
  return mapped.every((key) => key.length > 0) ? mapped.join("+") : undefined;
}

function ydotoolCtrlShiftVEvents(): readonly string[] {
  return [
    "29:1",
    "42:1",
    "47:1",
    "47:0",
    "42:0",
    "29:0",
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWaylandClipboardPasteKeyboardAction(
  context: RuntimeBaseToolExecutorContext,
  request: ComputerUseKeyboardActionRequest,
  input: {
    ydotool: string;
    cwd: string;
    metadata: Readonly<Record<string, unknown>>;
    failedProviders: readonly string[];
  },
): Promise<BaseToolExecutorResult<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }> | undefined> {
  if (request.action !== "type" || request.text === undefined) return undefined;
  const wlCopy = await firstExecutable(["/usr/bin/wl-copy", "/usr/local/bin/wl-copy"]);
  if (wlCopy === undefined) return undefined;
  const wlPaste = await firstExecutable(["/usr/bin/wl-paste", "/usr/local/bin/wl-paste"]);

  const previousClipboard = wlPaste === undefined
    ? undefined
    : await runChildProcess({
      command: wlPaste,
      args: ["--no-newline"],
      cwd: input.cwd,
      timeoutMs: 2_000,
      intent: "generic",
    }, context, "computeruse.keyboardAction");
  const previousText = previousClipboard?.ok === true && previousClipboard.output.exitCode === 0
    ? previousClipboard.output.stdout
    : undefined;

  const copyResult = await runChildProcess({
    command: wlCopy,
    args: ["--type", "text/plain;charset=utf-8"],
    stdin: request.text,
    cwd: input.cwd,
    timeoutMs: 3_000,
    intent: "generic",
  }, context, "computeruse.keyboardAction");
  if (!copyResult.ok) return copyResult;
  if (copyResult.output.exitCode !== 0) {
    return failure("PROVIDER_FAILURE", copyResult.output.stderr || copyResult.output.stdout || "wl-copy clipboard injection failed", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.clipboardCopyFailed",
    ]);
  }

  const pasteResult = await runChildProcess({
    command: input.ydotool,
    args: ["key", "--delay", "0", "--key-delay", "12", ...ydotoolCtrlShiftVEvents()],
    cwd: input.cwd,
    timeoutMs: 5_000,
    intent: "generic",
  }, context, "computeruse.keyboardAction");
  await delay(180);

  if (previousText !== undefined) {
    await runChildProcess({
      command: wlCopy,
      args: ["--type", "text/plain;charset=utf-8"],
      stdin: previousText,
      cwd: input.cwd,
      timeoutMs: 2_000,
      intent: "generic",
    }, context, "computeruse.keyboardAction");
  }

  if (!pasteResult.ok) return pasteResult;
  if (pasteResult.output.exitCode !== 0) {
    return failure("PROVIDER_FAILURE", [
      ...input.failedProviders,
      `ydotool paste shortcut: ${pasteResult.output.stderr || pasteResult.output.stdout || `exit ${pasteResult.output.exitCode}`}`,
    ].join("; ") || "ydotool clipboard paste shortcut failed", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.clipboardPasteFailed",
    ]);
  }

  return success({
    actionId: `keyboard:${randomUUID()}`,
    metadata: {
      ...input.metadata,
      provider: "wl-clipboard+ydotool",
      executed: true,
      clipboardInjection: true,
      imeBypassed: true,
      clipboardRestored: previousText !== undefined,
      unicodeTextSupported: true,
      fallbackFromProviders: input.failedProviders.map((entry) => entry.split(":")[0] ?? entry),
    },
  }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.executed"]);
}

function readManagedTerminalTarget(
  context: RuntimeBaseToolExecutorContext,
  request: ComputerUseKeyboardActionRequest,
): { requested: boolean; session?: string } {
  const metadata = request.metadata ?? {};
  const targetHint = typeof metadata.targetHint === "string" ? metadata.targetHint : undefined;
  const metadataSession = typeof metadata.tmuxSession === "string" ? metadata.tmuxSession.trim() : undefined;
  if (metadataSession !== undefined && metadataSession.length > 0) return { requested: true, session: metadataSession };
  const explicit = targetHint?.match(/\b(?:tmux|pty|terminal):([A-Za-z0-9_.:-]+)/u)?.[1];
  if (explicit !== undefined && explicit.length > 0) return { requested: true, session: explicit };
  const env = context.environment ?? process.env;
  const fromEnv = env.PRAXIS_DESKTOP_TMUX_SESSION?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return { requested: true, session: fromEnv };
  const genericManagedTerminal = targetHint !== undefined && (
    /\b(?:managed|controlled|work)[-_ ]?terminal\b/iu.test(targetHint) ||
    /\bpty\b/iu.test(targetHint)
  );
  if (genericManagedTerminal) return { requested: true };
  return { requested: false };
}

function readBoundDesktopInputTarget(
  request: ComputerUseKeyboardActionRequest,
): { requested: boolean; targetRef?: string; autoResolved?: boolean } {
  const metadata = request.metadata ?? {};
  const targetRef =
    typeof metadata.windowRef === "string" ? metadata.windowRef.trim()
      : typeof metadata.desktopTarget === "string" ? metadata.desktopTarget.trim()
        : typeof metadata.sessionTarget === "string" ? metadata.sessionTarget.trim()
          : undefined;
  if (targetRef !== undefined && targetRef.length > 0) return { requested: true, targetRef };
  const targetHint = typeof metadata.targetHint === "string" ? metadata.targetHint.trim() : undefined;
  const explicit = targetHint?.match(/\b(?:window|desktop|gui):([A-Za-z0-9_.:-]+)/u)?.[0];
  if (explicit !== undefined && explicit.length > 0) return { requested: true, targetRef: explicit };
  const guardedCurrentDesktopTarget = metadata.runtimeGuardAccepted === true
    && targetHint !== undefined
    && (/\b(?:current|focused|active)\b/iu.test(targetHint) || /当前|焦点|活动/u.test(targetHint))
    && /\b(?:window|ghostty|terminal|browser|edge|chrome|address|input)\b|窗口|终端|浏览器|地址栏|输入框/iu.test(targetHint);
  if (guardedCurrentDesktopTarget) return { requested: true, targetRef: "window:active", autoResolved: true };
  return { requested: false };
}

function containsNonAsciiText(value: string | undefined): boolean {
  return value !== undefined && /[^\x00-\x7F]/u.test(value);
}

async function runManagedTmuxKeyboardAction(
  context: RuntimeBaseToolExecutorContext,
  request: ComputerUseKeyboardActionRequest,
): Promise<BaseToolExecutorResult<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }> | undefined> {
  const managedTarget = readManagedTerminalTarget(context, request);
  if (!managedTarget.requested) return undefined;
  if (managedTarget.session === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "managed terminal input requires an explicit tmux/pty/terminal session target or PRAXIS_DESKTOP_TMUX_SESSION", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxSessionMissing",
    ]);
  }
  const session = managedTarget.session;
  const tmux = await firstExecutable(["/usr/bin/tmux", "/usr/local/bin/tmux"]);
  if (tmux === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "managed terminal input requires tmux", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxMissing",
    ]);
  }
  const cwd = workspaceRoot(context);
  const hasSession = await runChildProcess({ command: tmux, args: ["has-session", "-t", session], cwd, timeoutMs: 3_000, intent: "generic" }, context, "computeruse.keyboardAction");
  if (!hasSession.ok) return hasSession;
  if (hasSession.output.exitCode !== 0) {
    return failure("PROVIDER_UNAVAILABLE", `managed tmux session ${session} is not available`, [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxSessionMissing",
    ]);
  }

  const target = session;
  const args = request.action === "type"
    ? ["send-keys", "-t", target, "-l", request.text ?? ""]
    : ["send-keys", "-t", target, ...((request.keys ?? (request.action === "submit" ? ["Enter"] : [])).map((key: string) => key === "Enter" ? "C-m" : key))];
  if (args.length <= 3) {
    return failure("INVALID_REQUEST", "managed terminal input requires text or keys", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxInvalidRequest",
    ]);
  }
  const result = await runChildProcess({ command: tmux, args, cwd, timeoutMs: 5_000, intent: "generic" }, context, "computeruse.keyboardAction");
  if (!result.ok) return result;
  if (result.output.exitCode !== 0) {
    return failure("PROVIDER_FAILURE", result.output.stderr || "tmux managed terminal input failed", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxFailed",
    ]);
  }
  return success({
    actionId: `keyboard:${randomUUID()}`,
    metadata: {
      provider: "tmux",
      session,
      target,
      executed: true,
      focusIndependent: true,
      imeBypassed: true,
      action: request.action,
      workspaceRoot: cwd,
    },
  }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.tmuxExecuted"]);
}

async function runLinuxDesktopKeyboardAction(
  context: RuntimeBaseToolExecutorContext,
  request: ComputerUseKeyboardActionRequest,
): Promise<BaseToolExecutorResult<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }> | undefined> {
  const managedTerminalResult = await runManagedTmuxKeyboardAction(context, request);
  if (managedTerminalResult !== undefined) return managedTerminalResult;

  if (!desktopAutomationEnabled(context, request)) return undefined;

  const desktop = detectLinuxDesktopHost(context);
  const displayServer = typeof desktop.displayServer === "string" ? desktop.displayServer : "unknown";
  const boundTarget = readBoundDesktopInputTarget(request);
  const metadata = desktopAutomationMetadata(context, {
    action: request.action,
    targetRef: boundTarget.targetRef,
    targetBinding: boundTarget.autoResolved === true ? "runtime:auto-active-window" : "runtime:explicit",
    targetBindingRequired: true,
  });
  const cwd = workspaceRoot(context);

  if (!boundTarget.requested || boundTarget.targetRef === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "desktop keyboard input requires an explicit bound target such as window:active, gui:<id>, or a managed terminal target such as tmux:<session>; no focus-dependent input was executed", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.boundTargetRequired",
    ]);
  }

  if (displayServer === "wayland") {
    const failedProviders: string[] = [];
    const ydotool = await firstExecutable(["/usr/bin/ydotool", "/usr/local/bin/ydotool"]);
    const requiresExactDesktopText = request.action === "type"
      && (boundTarget.autoResolved === true || request.metadata?.inputMode === "paste");
    if (request.action === "type" && ydotool !== undefined) {
      const clipboardPasteResult = await runWaylandClipboardPasteKeyboardAction(context, request, {
        ydotool,
        cwd,
        metadata,
        failedProviders,
      });
      if (clipboardPasteResult?.ok === true) return clipboardPasteResult;
      if (clipboardPasteResult !== undefined && !clipboardPasteResult.ok) {
        failedProviders.push(`wl-clipboard+ydotool: ${clipboardPasteResult.error.message}`);
      }
    }
    if (request.action === "type") {
      const wtype = await firstExecutable(["/usr/bin/wtype", "/usr/local/bin/wtype"]);
      if (wtype !== undefined) {
        if (request.text === undefined || request.text.length === 0) {
          return failure("INVALID_REQUEST", "computeruse keyboard type requires text", ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.invalidRequest"]);
        }
        const result = await runChildProcess({ command: wtype, args: [request.text], cwd, timeoutMs: 5_000, intent: "generic" }, context, "computeruse.keyboardAction");
        if (!result.ok) return result;
        if (result.output.exitCode === 0) {
          return success({
            actionId: `keyboard:${randomUUID()}`,
            metadata: { ...metadata, provider: "wtype", executed: true, unicodeTextSupported: true },
          }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.executed"]);
        }
        failedProviders.push(`wtype: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`);
      }
    }

    if (requiresExactDesktopText) {
      return failure(
        failedProviders.length > 0 ? "PROVIDER_FAILURE" : "PROVIDER_UNAVAILABLE",
        [
          "exact desktop text injection requires wl-clipboard+ydotool paste or wtype; ydotool key-by-key text mode was skipped to avoid IME-corrupted text",
          ...failedProviders,
        ].join("; "),
        ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.exactTextProviderRequired"],
      );
    }

    if (ydotool === undefined) return undefined;
    if (request.action === "type" && containsNonAsciiText(request.text)) {
      return failure("PROVIDER_UNAVAILABLE", [
        "desktop Unicode text injection requires wtype, wl-clipboard paste injection, or a managed terminal target; ydotool text mode is not used for non-ASCII text",
        ...failedProviders,
      ].join("; "), [
        "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.unicodeTextProviderRequired",
      ]);
    }
    const spec = request.action === "type"
      ? request.text === undefined
        ? failure<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }>("INVALID_REQUEST", "computeruse keyboard type requires text", ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.invalidRequest"])
        : undefined
      : undefined;
    if (spec !== undefined) return spec;
    const shortcut = request.action === "shortcut" ? ydotoolShortcutArgument(request.keys) : undefined;
    const args = request.action === "type"
      ? ["type", "--file", "-"]
      : shortcut !== undefined
        ? ["key", "--delay", "0", "--key-delay", "12", shortcut]
        : ["key", "--delay", "0", "--key-delay", "12", ...(ydotoolKeyEventSequences(request.keys ?? (request.action === "submit" ? ["Enter"] : undefined)) ?? [])];
    if (args.length <= 1) return undefined;
    const result = await runChildProcess({
      command: ydotool,
      args,
      cwd,
      stdin: request.action === "type" ? request.text ?? "" : undefined,
      timeoutMs: 5_000,
      intent: "generic",
    }, context, "computeruse.keyboardAction");
    if (!result.ok) return result;
    if (result.output.exitCode !== 0) {
      return failure("PROVIDER_FAILURE", [
        ...failedProviders,
        `ydotool: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`,
      ].join("; ") || "ydotool keyboard action failed", [
        "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.ydotoolFailed",
      ]);
    }
    await delay(request.action === "submit" ? 120 : 180);
    return success({
      actionId: `keyboard:${randomUUID()}`,
      metadata: {
        ...metadata,
        provider: "ydotool",
        executed: true,
        imeBypassed: false,
        fallbackFromProviders: failedProviders.length > 0 ? failedProviders.map((entry) => entry.split(":")[0] ?? entry) : [],
      },
    }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.executed"]);
  }

  if (displayServer === "x11") {
    const xdotool = await firstExecutable(["/usr/bin/xdotool", "/usr/local/bin/xdotool"]);
    if (xdotool === undefined) return undefined;
    const args = request.action === "type"
      ? ["type", "--delay", "1", request.text ?? ""]
    : ["key", "--clearmodifiers", ...((request.keys ?? (request.action === "submit" ? ["Return"] : [])).map((key: string) => key === "Enter" ? "Return" : key))];
    if (args.length <= 2) return undefined;
    const result = await runChildProcess({ command: xdotool, args, cwd, timeoutMs: 5_000, intent: "generic" }, context, "computeruse.keyboardAction");
    if (!result.ok) return result;
    if (result.output.exitCode !== 0) {
      return failure("PROVIDER_FAILURE", result.output.stderr || "xdotool keyboard action failed", [
        "runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.xdotoolFailed",
      ]);
    }
    return success({
      actionId: `keyboard:${randomUUID()}`,
      metadata: { ...metadata, provider: "xdotool", executed: true },
    }, ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.executed"]);
  }

  return undefined;
}

function numericProperty(record: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  if (record === undefined) return undefined;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordProperty(record: Readonly<Record<string, unknown>> | undefined, key: string): Readonly<Record<string, unknown>> | undefined {
  const value = record?.[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function pointFromTarget(target: Readonly<Record<string, unknown>> | undefined): { x: number; y: number } | undefined {
  const directX = numericProperty(target, "x");
  const directY = numericProperty(target, "y");
  if (directX !== undefined && directY !== undefined) {
    return { x: Math.round(directX), y: Math.round(directY) };
  }
  const at = recordProperty(target, "at") ?? recordProperty(target, "point");
  const atX = numericProperty(at, "x");
  const atY = numericProperty(at, "y");
  if (atX !== undefined && atY !== undefined) {
    return { x: Math.round(atX), y: Math.round(atY) };
  }
  return undefined;
}

function pointerCoordinateSpace(target: Readonly<Record<string, unknown>> | undefined): string {
  const value = target?.coordinateSpace;
  return typeof value === "string" && value.length > 0 ? value : "screen";
}

function pointerButton(target: Readonly<Record<string, unknown>> | undefined): number {
  const button = target?.button;
  if (button === "right") return 2;
  if (button === "middle") return 3;
  return 1;
}

function pointerClickCount(target: Readonly<Record<string, unknown>> | undefined): number {
  const clickCount = numericProperty(target, "clickCount");
  if (clickCount === undefined) return 1;
  return Math.max(1, Math.min(3, Math.round(clickCount)));
}

function pointerScrollButtonAndCount(target: Readonly<Record<string, unknown>> | undefined): { button: number; count: number } | undefined {
  const deltaY = numericProperty(target, "deltaY") ?? 0;
  const deltaX = numericProperty(target, "deltaX") ?? 0;
  const dominant = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  if (dominant === 0) return undefined;
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
  const button = vertical
    ? dominant < 0 ? 4 : 5
    : dominant < 0 ? 6 : 7;
  const unit = target?.unit;
  const divisor = unit === "line" ? 1 : 120;
  const count = Math.max(1, Math.min(12, Math.ceil(Math.abs(dominant) / divisor)));
  return { button, count };
}

async function runPointerCommand(
  provider: string,
  args: readonly string[],
  context: RuntimeBaseToolExecutorContext,
  cwd: string,
): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string; durationMs?: number }>> {
  return await runChildProcess({ command: provider, args, cwd, timeoutMs: 5_000, intent: "generic" }, context, "computeruse.pointerAction");
}

async function movePointerIfNeeded(
  provider: string,
  providerName: "ydotool" | "xdotool",
  point: { x: number; y: number } | undefined,
  context: RuntimeBaseToolExecutorContext,
  cwd: string,
): Promise<BaseToolExecutorResult<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }> | undefined> {
  if (point === undefined) return undefined;
  const args = providerName === "ydotool"
    ? ["mousemove", "--delay", "0", String(point.x), String(point.y)]
    : ["mousemove", String(point.x), String(point.y)];
  const result = await runPointerCommand(provider, args, context, cwd);
  if (!result.ok) return result;
  if (result.output.exitCode !== 0) {
    return failure("PROVIDER_FAILURE", `${providerName} pointer move failed: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`, [
      `runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.${providerName}Failed`,
    ]);
  }
  return undefined;
}

async function runLinuxDesktopPointerAction(
  context: RuntimeBaseToolExecutorContext,
  request: ComputerUsePointerActionRequest,
): Promise<BaseToolExecutorResult<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }> | undefined> {
  if (!desktopAutomationEnabled(context, request)) return undefined;

  const desktop = detectLinuxDesktopHost(context);
  const displayServer = typeof desktop.displayServer === "string" ? desktop.displayServer : "unknown";
  const target = request.target;
  const coordinateSpace = pointerCoordinateSpace(target);
  if (coordinateSpace !== "screen") {
    return failure("PROVIDER_UNAVAILABLE", `desktop pointer action currently requires screen coordinates; received coordinateSpace=${coordinateSpace}`, [
      "runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.coordinateTranslationMissing",
    ]);
  }

  const providerName = displayServer === "wayland" ? "ydotool" : displayServer === "x11" ? "xdotool" : undefined;
  const provider = providerName === "ydotool"
    ? await firstExecutable(["/usr/bin/ydotool", "/usr/local/bin/ydotool"])
    : providerName === "xdotool"
      ? await firstExecutable(["/usr/bin/xdotool", "/usr/local/bin/xdotool"])
      : undefined;
  if (providerName === undefined || provider === undefined) return undefined;

  const cwd = workspaceRoot(context);
  const point = pointFromTarget(target);
  if (request.action === "move" && point === undefined) {
    return failure("INVALID_REQUEST", "computeruse pointer move requires screen target x/y", [
      "runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.invalidTarget",
    ]);
  }
  if ((request.action === "move" || request.action === "click" || request.action === "scroll" || request.action === "confirm") && point !== undefined) {
    const moveResult = await movePointerIfNeeded(provider, providerName, point, context, cwd);
    if (moveResult !== undefined) return moveResult;
  }

  if (request.action === "move") {
    return success({
      actionId: `pointer:${randomUUID()}`,
      metadata: desktopAutomationMetadata(context, {
        provider: providerName,
        action: "move",
        coordinateSpace,
        targetPoint: point,
        executed: true,
      }),
    }, ["runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.executed"]);
  }

  const clickArgs = providerName === "ydotool"
    ? (button: number) => ["click", "--delay", "0", String(button)]
    : (button: number) => ["click", String(button)];

  if (request.action === "click" || request.action === "confirm") {
    const button = pointerButton(target);
    const count = pointerClickCount(target);
    for (let index = 0; index < count; index += 1) {
      const result = await runPointerCommand(provider, clickArgs(button), context, cwd);
      if (!result.ok) return result;
      if (result.output.exitCode !== 0) {
        return failure("PROVIDER_FAILURE", `${providerName} pointer click failed: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`, [
          `runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.${providerName}Failed`,
        ]);
      }
    }
    return success({
      actionId: `pointer:${randomUUID()}`,
      metadata: desktopAutomationMetadata(context, {
        provider: providerName,
        action: request.action,
        button,
        clickCount: count,
        coordinateSpace,
        targetPoint: point,
        executed: true,
      }),
    }, ["runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.executed"]);
  }

  if (request.action === "scroll") {
    const scroll = pointerScrollButtonAndCount(target);
    if (scroll === undefined) {
      return failure("INVALID_REQUEST", "computeruse pointer scroll requires non-zero deltaX or deltaY", [
        "runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.invalidScroll",
      ]);
    }
    for (let index = 0; index < scroll.count; index += 1) {
      const result = await runPointerCommand(provider, clickArgs(scroll.button), context, cwd);
      if (!result.ok) return result;
      if (result.output.exitCode !== 0) {
        return failure("PROVIDER_FAILURE", `${providerName} pointer scroll failed: ${result.output.stderr || result.output.stdout || `exit ${result.output.exitCode}`}`, [
          `runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.${providerName}Failed`,
        ]);
      }
    }
    return success({
      actionId: `pointer:${randomUUID()}`,
      metadata: desktopAutomationMetadata(context, {
        provider: providerName,
        action: "scroll",
        wheelButton: scroll.button,
        wheelCount: scroll.count,
        coordinateSpace,
        targetPoint: point,
        executed: true,
      }),
    }, ["runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.executed"]);
  }

  return undefined;
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
      const hostResult = await runLinuxDesktopPointerAction(context, request);
      if (hostResult !== undefined) return hostResult;
      const desktop = detectLinuxDesktopHost(context);
      const providers = Array.isArray(desktop.pointerProviders) ? desktop.pointerProviders.join(" or ") : "ydotool or xdotool";
      return failure(
        "PROVIDER_UNAVAILABLE",
        `computeruse pointer actions require an injected desktop automation provider (${providers}); no pointer action was executed`,
        ["runtime.execEngine.baseToolExecutorPort.computeruse.pointerAction.providerUnavailable"],
      );
    },
    async keyboardAction(request) {
      const delegated = await callDelegated<{ actionId: string; metadata?: Readonly<Record<string, unknown>> }>(context, "computeruse.keyboardAction", request);
      if (delegated !== undefined) return delegated;
      const hostResult = await runLinuxDesktopKeyboardAction(context, request);
      if (hostResult !== undefined) return hostResult;
      const desktop = detectLinuxDesktopHost(context);
      const providers = Array.isArray(desktop.pointerProviders) ? desktop.pointerProviders.join(" or ") : "ydotool or xdotool";
      return failure(
        "PROVIDER_UNAVAILABLE",
        `computeruse keyboard actions require BAPR/YOLO policy or PRAXIS_ENABLE_DESKTOP_AUTOMATION=1 plus a desktop automation provider (${providers}); no keyboard input was executed`,
        ["runtime.execEngine.baseToolExecutorPort.computeruse.keyboardAction.providerUnavailable"],
      );
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
