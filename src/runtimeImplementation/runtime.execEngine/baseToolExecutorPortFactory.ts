import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BaseToolExecutorNamespace,
  BaseToolExecutorPort,
  BaseToolExecutorResult,
} from "../../basetool/types.js";
import { getSemanticBaseToolDefinition, listSemanticBaseToolDefinitions } from "../../basetool/catalog.js";

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
  mcpServers?: readonly unknown[];
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
    "network.search",
    "network.ground",
    "network.nativeWebSearch",
    "mcp.ping",
    "mcp.call",
    "mcp.listTools",
    "mcp.listResources",
    "mcp.readResource",
    "plan.update",
    "tool.discover",
    "tool.describe",
    "userInteraction.ask",
  ],
} as const;

function ok(output: unknown, metadata?: Readonly<Record<string, unknown>>): BaseToolExecutorResult {
  return { ok: true, output, value: output, metadata };
}

function fail(code: string, message: string, metadata?: Readonly<Record<string, unknown>>): BaseToolExecutorResult {
  return { ok: false, error: { code, message, publicSafe: true }, metadata };
}

function unavailable(portPath: string): BaseToolExecutorResult {
  return fail("PROVIDER_UNAVAILABLE", `${portPath} is not implemented by the semantic basetool runtime port factory.`);
}

function workspaceRoot(context: RuntimeBaseToolExecutorContext): string {
  return path.resolve(context.policy?.workspaceRoot ?? process.cwd());
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolvePath(context: RuntimeBaseToolExecutorContext, inputPath: unknown): BaseToolExecutorResult<string> {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    return fail("INVALID_PATH", "A non-empty path is required.");
  }
  const root = workspaceRoot(context);
  const absolute = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(root, inputPath);
  const allowedRoots = (context.policy?.allowedRoots ?? [root]).map((item) => path.resolve(item));
  if (!allowedRoots.some((allowedRoot) => isInside(allowedRoot, absolute))) {
    return fail("PATH_OUTSIDE_ALLOWED_ROOTS", `Path ${inputPath} is outside allowed runtime roots.`);
  }
  return ok(absolute);
}

function truncate(context: RuntimeBaseToolExecutorContext, value: string): string {
  const max = context.resourceLimits?.maxOutputBytes ?? 256_000;
  return value.length <= max ? value : value.slice(0, max);
}

function emit(context: RuntimeBaseToolExecutorContext, portPath: string, type: string, metadata?: Readonly<Record<string, unknown>>): void {
  context.emitEvent?.({ type, runtimeId: context.runtimeId, sessionId: context.sessionId, portPath, metadata });
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
      const content = await readFile(String(resolved.output), "utf8");
      return { content: truncate(context, content), path: resolved.output };
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
      const entries = await readdir(String(resolved.output));
      return { path: resolved.output, entries: entries.slice(0, context.resourceLimits?.maxListEntries ?? 1000) };
    }),
  };
}

function runCommand(context: RuntimeBaseToolExecutorContext, command: string, args: readonly string[] = [], cwd?: string): Promise<BaseToolExecutorResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: cwd ?? workspaceRoot(context),
      env: { ...process.env, ...(context.environment ?? {}) },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolve(fail("PROCESS_SPAWN_FAILED", error.message)));
    child.on("close", (exitCode) => resolve(ok({
      exitCode: exitCode ?? 0,
      stdout: truncate(context, stdout),
      stderr: truncate(context, stderr),
    })));
  });
}

function createShellExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    run: withAdapter(context, "shell", "run", async (request) => {
      if (context.policy?.allowShellExecution === false) return fail("SHELL_EXECUTION_DISABLED", "Shell execution is disabled by runtime policy.");
      const command = String(request?.command ?? "");
      if (command.trim().length === 0) return fail("INVALID_COMMAND", "A non-empty command is required.");
      emit(context, "shell.run", "runtime.execEngine.shell.run");
      return runCommand(context, command, [], typeof request?.cwd === "string" ? request.cwd : undefined);
    }),
  };
}

function createProcessExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    run: withAdapter(context, "process", "run", async (request) => {
      if (context.policy?.allowProcessExecution === false) return fail("PROCESS_EXECUTION_DISABLED", "Process execution is disabled by runtime policy.");
      return runCommand(context, String(request?.command ?? ""), Array.isArray(request?.args) ? request.args.map(String) : [], typeof request?.cwd === "string" ? request.cwd : undefined);
    }),
    wait: withAdapter(context, "process", "wait", async () => unavailable("process.wait")),
    kill: withAdapter(context, "process", "kill", async () => unavailable("process.kill")),
  };
}

function createGitExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    runGit: withAdapter(context, "git", "runGit", async (request) => {
      if (context.policy?.allowGitExecution === false) return fail("GIT_EXECUTION_DISABLED", "Git execution is disabled by runtime policy.");
      return runCommand(context, "git", Array.isArray(request?.args) ? request.args.map(String) : ["status", "--short"], typeof request?.cwd === "string" ? request.cwd : undefined);
    }),
  };
}

function createSearchExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    ripgrep: withAdapter(context, "search", "ripgrep", async (request) => {
      if (context.policy?.allowRipgrep === false) return fail("RIPGREP_DISABLED", "Ripgrep is disabled by runtime policy.");
      const query = String(request?.query ?? request?.pattern ?? "");
      if (query.trim().length === 0) return fail("INVALID_QUERY", "A non-empty query is required.");
      return runCommand(context, "rg", ["--line-number", "--no-heading", query, String(request?.cwd ?? ".")], workspaceRoot(context));
    }),
  };
}

function createNetworkExecutor(context: RuntimeBaseToolExecutorContext): BaseToolExecutorNamespace {
  return {
    fetch: withAdapter(context, "network", "fetch", async (request) => {
      if (context.policy?.allowNetworkFetch === false) return fail("NETWORK_FETCH_DISABLED", "Network fetch is disabled by runtime policy.");
      const response = await fetch(String(request?.url));
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: truncate(context, await response.text()) };
    }),
    search: withAdapter(context, "network", "search", async () => unavailable("network.search")),
    ground: withAdapter(context, "network", "ground", async () => unavailable("network.ground")),
    nativeWebSearch: withAdapter(context, "network", "nativeWebSearch", async () => unavailable("network.nativeWebSearch")),
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
      };
    }),
  };
}

function createUnavailableNamespace(namespace: string, methods: readonly string[]): BaseToolExecutorNamespace {
  return Object.fromEntries(methods.map((method) => [method, async () => unavailable(`${namespace}.${method}`)]));
}

export function listRuntimeBaseToolImplementedPortPaths(
  context: Pick<RuntimeBaseToolExecutorContext, "adapters"> = {},
): readonly string[] {
  const ports = new Set<string>(baseToolExecutorPortFactoryDescriptor.implementedAdapters);
  for (const [namespace, methods] of Object.entries(context.adapters ?? {})) {
    if (methods === undefined) continue;
    for (const method of Object.keys(methods)) ports.add(`${namespace}.${method}`);
  }
  return [...ports].sort();
}

export function createRuntimeBaseToolExecutorPort(
  context: RuntimeBaseToolExecutorContext,
): BaseToolExecutorPort {
  return {
    filesystem: createFilesystemExecutor(context),
    shell: createShellExecutor(context),
    process: createProcessExecutor(context),
    git: createGitExecutor(context),
    search: createSearchExecutor(context),
    network: createNetworkExecutor(context),
    web: createNetworkExecutor(context),
    mcp: {
      ...createUnavailableNamespace("mcp", ["connect", "ping", "listTools", "call", "stream", "listResources", "readResource"]),
      ...(context.adapters?.mcp ?? {}),
    },
    artifact: {
      store: withAdapter(context, "artifact", "store", async (request) => ({ artifactId: request?.artifactId ?? `artifact:${Date.now()}`, stored: true })),
    },
    plan: {
      update: withAdapter(context, "plan", "update", async (request) => ({ accepted: true, plan: request })),
    },
    userInteraction: {
      ask: withAdapter(context, "userInteraction", "ask", async () => unavailable("userInteraction.ask")),
    },
    context: createUnavailableNamespace("context", ["load"]),
    skill: createUnavailableNamespace("skill", ["load", "management", "summarize", "ripgrep"]),
    lsp: createUnavailableNamespace("lsp", ["inspectDiagnostics", "completeCode", "locateDefinition"]),
    debug: createUnavailableNamespace("debug", ["captureState", "collectLogs", "launch"]),
    computeruse: createUnavailableNamespace("computeruse", ["captureScreenshot", "keyboardAction", "pointerAction"]),
    omni: createUnavailableNamespace("omni", ["viewImage", "generateImage", "listenAudio", "generateVideo", "transformMedia"]),
    device: createUnavailableNamespace("device", ["requestPermission", "releasePermission"]),
    office: createUnavailableNamespace("office", ["read", "write"]),
    approval: createUnavailableNamespace("approval", ["request", "check"]),
    sandbox: createUnavailableNamespace("sandbox", ["run"]),
    output: {
      truncate: withAdapter(context, "output", "truncate", async (request) => ({ text: truncate(context, String(request?.text ?? "")) })),
    },
    tool: createToolExecutor(context),
    ...(context.adapters ?? {}),
  };
}
