import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { providePromptPackInput } from "../../src/agentCore/agent_executionEngine/promptPack/promptProvider.js";
import type { BaseToolExecutorPort } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { mountAgentApplication } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";
import { createAgentApplicationRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";
import { createAgentRuntimeClient } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";
import { createAgentRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";
import { createBehaviorExposureRuntime } from "../../src/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorExposureRuntime.js";
import { createCapabilityExposureRuntimeSnapshot } from "../../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityExposureRuntime.js";
import type { RuntimeCapabilityDescriptor } from "../../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.js";
import { bindBasicToolLayer } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindBasicToolLayer.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";
import { createRuntimeAccessSession } from "../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import { createRuntimeManagementPlane } from "../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";
import { openRuntimeOperatorConsole } from "../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";
import { createRuntimeSurfaceRegistry } from "../../src/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.js";

type LabAgent = {
  id: string;
  runtimeId: string;
  applicationId: string;
  sessionId: string;
  createdAt: string;
  turns: number;
};

type ToolDefinition = {
  toolId: string;
  sourcePath: string;
  family: string;
};

type ToolCall = {
  tool: string;
  arguments?: Record<string, unknown>;
};

type ToolResult = {
  tool: string;
  ok: boolean;
  output?: unknown;
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

type LabLogEvent = {
  at: string;
  event: string;
  activeAgentId?: string;
  data?: unknown;
};

type AgentCoreRuntimeAssembly = {
  surfaceIds: readonly string[];
  exposedCapabilityIds: readonly string[];
  behaviorCapabilities: readonly string[];
  basicToolLayerBindingId: string;
};

const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");
const repoRoot = path.resolve(architectureRoot, "..");
const baseToolsRoot = path.join(
  architectureRoot,
  "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools",
);
const localEnvPath = path.join(architectureRoot, ".env.agentcore.local");

function loadLocalEnvFile(): void {
  if (!existsSync(localEnvPath)) {
    return;
  }

  const text = readFileSync(localEnvPath, "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/gu, "");
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const model = process.env.OPENAI_AGENTCORE_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.4";
const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const reasoningEffort =
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "1400");
const maxToolRounds = Number(process.env.AGENTCORE_TOOL_LAB_MAX_ROUNDS ?? "4");
const commandTimeoutMs = Number(process.env.AGENTCORE_TOOL_LAB_TIMEOUT_MS ?? "120000");
const maxOutputBytes = Number(process.env.AGENTCORE_TOOL_LAB_MAX_OUTPUT_BYTES ?? "200000");
const runStartedAt = new Date();
const runId = `tool-lab-${runStartedAt.toISOString().replace(/[:.]/gu, "-")}`;
const logRoot = path.join(architectureRoot, "tasks/runs/tool-lab", runId);
const jsonlLogPath = path.join(logRoot, "session.jsonl");
const summaryLogPath = path.join(logRoot, "summary.md");
export const toolLabRuntimePaths = { logRoot, jsonlLogPath, summaryLogPath } as const;

const agents = new Map<string, LabAgent>();
const histories = new Map<string, ChatMessage[]>();
const assemblies = new Map<string, AgentCoreRuntimeAssembly>();
const toolCatalog = discoverToolCatalog();
let activeAgent = createLabAgent("agentcore-tool-lab");

function redactSecret(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]{8,}/gu, "sk-[redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]");
  }

  if (Array.isArray(value)) {
    return value.map(redactSecret);
  }

  if (typeof value === "object" && value !== null) {
    const redacted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/api[_-]?key|authorization|token|secret|password/iu.test(key)) {
        redacted[key] = "[redacted]";
      } else {
        redacted[key] = redactSecret(child);
      }
    }

    return redacted;
  }

  return value;
}

function truncateForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 12_000 ? `${value.slice(0, 12_000)}\n...[log-truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.map(truncateForLog);
  }

  if (typeof value === "object" && value !== null) {
    const truncated: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      truncated[key] = truncateForLog(child);
    }

    return truncated;
  }

  return value;
}

function logEvent(event: string, data?: unknown): void {
  const logRecord: LabLogEvent = {
    at: new Date().toISOString(),
    event,
    activeAgentId: activeAgent?.id,
    data: truncateForLog(redactSecret(data)),
  };
  mkdirSync(logRoot, { recursive: true });
  if (!existsSync(jsonlLogPath)) {
    writeFileSync(jsonlLogPath, "", "utf8");
  }
  appendFileSync(jsonlLogPath, `${JSON.stringify(logRecord)}\n`, "utf8");
}

async function initializeLogs(): Promise<void> {
  mkdirSync(logRoot, { recursive: true });
  await writeFile(
    summaryLogPath,
    [
      "# agentCore tool lab run",
      "",
      `- runId: ${runId}`,
      `- startedAt: ${runStartedAt.toISOString()}`,
      `- repoRoot: ${repoRoot}`,
      `- model: ${model}`,
      `- reasoning.effort: ${reasoningEffort}`,
      `- visibleTools: ${toolCatalog.length}`,
      `- sessionJsonl: ${jsonlLogPath}`,
      "",
      "## Notes",
      "",
      "- This is a temporary all-tools functional test lab.",
      "- API keys and authorization values are redacted in JSONL logs.",
      "- Some visible tools may still return not_implemented_yet style results until real executors are wired.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(jsonlLogPath, "", "utf8");
  logEvent("lab.started", {
    runId,
    repoRoot,
    architectureRoot,
    model,
    reasoningEffort,
    maxToolRounds,
    commandTimeoutMs,
    maxOutputBytes,
    toolCount: toolCatalog.length,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function buildEndpoint(base: string, pathWithV1: string): string {
  const cleanBase = base.replace(/\/+$/, "");
  const apiPath = pathWithV1.startsWith("/") ? pathWithV1 : `/${pathWithV1}`;
  if (cleanBase.endsWith("/v1") && apiPath.startsWith("/v1/")) {
    return `${cleanBase}${apiPath.slice(3)}`;
  }

  return `${cleanBase}${apiPath}`;
}

function assertOk<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (result.ok) {
    return result as Extract<T, { ok: true }>;
  }

  throw new Error(`${label} failed: ${JSON.stringify(result)}`);
}

function discoverToolCatalog(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        continue;
      }

      const relativeToBase = path.relative(baseToolsRoot, absolutePath).split(path.sep).join("/");
      const family = relativeToBase.split("/")[0] ?? "unknown";
      const basename = entry.name.slice(0, -".ts".length);
      tools.push({
        toolId: basename,
        sourcePath: path.relative(repoRoot, absolutePath).split(path.sep).join("/"),
        family,
      });
    }
  }

  if (existsSync(baseToolsRoot)) {
    walk(baseToolsRoot);
  }

  return tools.sort((left, right) => left.toolId.localeCompare(right.toolId));
}

function toCapabilityDescriptor(tool: ToolDefinition): RuntimeCapabilityDescriptor {
  return {
    capabilityId: `tool.${tool.toolId}`,
    kind: "tool",
    displayName: tool.toolId,
    summary: `Temporary all-tools functional test capability for ${tool.sourcePath}`,
    surfaceId: "runtime.execEngine.basicToolLayer",
    scopes: [`tool.${tool.family}`, `tool.${tool.toolId}`],
    audiences: ["application", "management", "debug", "inspection"],
    mounted: true,
    enabled: true,
    contract: {
      contractId: `agentCore.basicTool.${tool.toolId}`,
      version: "temporary-tool-lab",
      inputBoundary: ["tool", "arguments", "runtime context"],
      outputBoundary: ["tool result", "tool error", "runtime behavior event"],
      errorCodes: ["HOST_EXECUTOR_ERROR", "TOOL_NOT_IMPLEMENTED"],
    },
    metadata: {
      sourcePath: tool.sourcePath,
      family: tool.family,
      mode: "dev-all-tools",
    },
  };
}

function assembleAgentCoreRuntime(agent: LabAgent): AgentCoreRuntimeAssembly {
  const surfaceRegistry = assertOk(
    "runtime.surfaceRegistry",
    createRuntimeSurfaceRegistry({
      runtimeId: agent.runtimeId,
      runtimeReady: true,
      surfaces: [
        {
          surfaceId: "runtime.applicationSurface",
          kind: "applicationSurface",
          owner: "agentcore-tool-lab",
          capabilities: ["agent.invoke", "runtime.client"],
          callers: ["application", "management"],
        },
        {
          surfaceId: "runtime.managementPlane",
          kind: "managementPlane",
          owner: "agentcore-tool-lab",
          capabilities: ["runtime.manage", "agent.manage", "tool.manage"],
          callers: ["management", "debug"],
        },
        {
          surfaceId: "runtime.behaviorExposure",
          kind: "behaviorExposure",
          owner: "agentcore-tool-lab",
          capabilities: ["publish-event", "open-observation-port", "create-trace-surface"],
          callers: ["application", "management", "debug", "runtime"],
        },
        {
          surfaceId: "runtime.capabilityExposure",
          kind: "capabilityExposure",
          owner: "agentcore-tool-lab",
          capabilities: ["tool.catalog", "tool.availability", "tool.contract"],
          callers: ["application", "management", "inspection", "debug"],
        },
        {
          surfaceId: "runtime.execEngine",
          kind: "execEngine",
          owner: "agentcore-tool-lab",
          capabilities: ["basicToolLayer", "tool.invoke"],
          callers: ["application", "management", "runtime"],
        },
        {
          surfaceId: "runtime.execEngine.basicToolLayer",
          kind: "execEngine",
          owner: "agentcore-tool-lab",
          capabilities: toolCatalog.map((tool) => `tool.${tool.toolId}`),
          callers: ["application", "management", "runtime", "debug"],
          metadata: {
            visibleToolCount: toolCatalog.length,
            mode: "dev-all-tools",
          },
        },
        {
          surfaceId: "runtime.modelAdapter",
          kind: "modelAdapter",
          owner: "agentcore-tool-lab",
          capabilities: ["model.invoke", "prompt.lower"],
          callers: ["application", "runtime"],
        },
      ],
    }),
  );

  const capabilityExposure = assertOk(
    "runtime.capabilityExposure",
    createCapabilityExposureRuntimeSnapshot({
      runtimeId: agent.runtimeId,
      runtimeReady: true,
      audience: "application",
      capabilities: toolCatalog.map(toCapabilityDescriptor),
    }),
  );

  const behaviorExposure = assertOk(
    "runtime.behaviorExposure",
    createBehaviorExposureRuntime({
      runtimeId: agent.runtimeId,
      sessionId: agent.sessionId,
      caller: "applicationSurface",
      requestedCapabilities: ["publish-event", "open-observation-port", "create-trace-surface"],
      runtimeReady: true,
      createdAt: agent.createdAt,
    }),
  );

  const basicToolBinding = assertOk(
    "runtime.execEngine.bindBasicToolLayer",
    bindBasicToolLayer({
      runtimeId: agent.runtimeId,
      caller: { kind: "application", id: agent.applicationId },
      runtimeReady: true,
      toolKinds: [...new Set(toolCatalog.map((tool) => tool.family))],
    }),
  );

  const assembly: AgentCoreRuntimeAssembly = {
    surfaceIds: surfaceRegistry.registry.surfaces.map((surface) => surface.surfaceId),
    exposedCapabilityIds: capabilityExposure.exposure.catalog.capabilities.map((capability) => capability.capabilityId),
    behaviorCapabilities: behaviorExposure.runtime.capabilities,
    basicToolLayerBindingId: basicToolBinding.binding.bindingId,
  };
  assemblies.set(agent.id, assembly);
  return assembly;
}

function createLabAgent(id: string): LabAgent {
  const runtimeResult = assertOk(
    "runtime.factory",
    createAgentRuntime({
      source: { kind: "configuration", name: id, version: "0.0.0-tool-lab" },
      applicationId: `${id}-app`,
      requestedSurfaces: [
        "runtime.applicationSurface",
        "runtime.managementPlane",
        "runtime.invocationMethod",
        "runtime.execEngine",
        "runtime.modelAdapter",
      ],
    }),
  );

  const runtime = runtimeResult.runtime;
  const mount = assertOk(
    "application.mount",
    mountAgentApplication({
      applicationId: runtime.applicationId,
      runtimeId: runtime.runtimeId,
      runtimeReady: runtime.readiness === "ready",
      requestedCapabilities: ["agent.invoke", "model.invoke", "tool.invoke", "runtime.manage"],
      eventSubscriptions: ["runtime.*", "agent.*", "tool.*", "model.*"],
    }),
  );

  const applicationRuntime = assertOk(
    "application.runtime",
    createAgentApplicationRuntime({ runtime, mount: mount.record, operation: "manage" }),
  );
  assertOk("runtime.client", createAgentRuntimeClient({ surface: applicationRuntime.surface }));

  const sessionId = runtime.sessions[0]?.sessionId ?? `${runtime.runtimeId}:session`;
  assertOk(
    "runtime.management.accessSession",
    createRuntimeAccessSession({
      runtimeId: runtime.runtimeId,
      actor: { kind: "operator", id: "agentcore-tool-lab", displayName: "temporary tool lab" },
      sessionId: `${runtime.runtimeId}:tool-lab-access`,
      requestedScopes: ["runtime.read", "runtime.inspect", "runtime.manage", "tool.invoke", "tool.execute"],
      grantedScopes: ["runtime.read", "runtime.inspect", "runtime.manage", "tool.invoke", "tool.execute"],
      runtimeReady: true,
    }),
  );
  assertOk(
    "runtime.management.plane",
    createRuntimeManagementPlane({
      runtimeId: runtime.runtimeId,
      caller: { kind: "operator", id: "agentcore-tool-lab", sessionId },
      components: [
        { surface: "runtimeManagementPlane", componentId: "tool-lab-management", ready: true },
        { surface: "operatorConsole", componentId: "tool-lab-console", ready: true },
        { surface: "accessSession", componentId: "tool-lab-access", ready: true },
      ],
      requestedScopes: ["runtime.manage", "tool.execute"],
      allowedScopes: ["runtime.manage", "tool.execute"],
      runtimeReady: true,
    }),
  );
  assertOk(
    "runtime.management.operatorConsole",
    openRuntimeOperatorConsole({
      runtimeId: runtime.runtimeId,
      operator: { operatorId: "agentcore-tool-lab", role: "admin", sessionId },
      commands: [
        {
          commandId: `${runtime.runtimeId}:open-all-tools`,
          verb: "route-command",
          targetSurface: "operatorConsole",
          requestedScopes: ["runtime.manage", "tool.execute"],
          reason: "temporary functional testing with all tools visible and executable",
        },
      ],
      allowedScopes: ["runtime.manage", "tool.execute"],
      runtimeReady: true,
    }),
  );

  const agent: LabAgent = {
    id,
    runtimeId: runtime.runtimeId,
    applicationId: runtime.applicationId,
    sessionId,
    createdAt: new Date().toISOString(),
    turns: 0,
  };
  agents.set(id, agent);
  histories.set(id, []);
  assembleAgentCoreRuntime(agent);
  return agent;
}

function toPath(value: unknown, fallback = "."): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function resolveAnyPath(value: unknown, fallback = "."): string {
  const raw = toPath(value, fallback);
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function relativeToWorkspaceCommandPath(value: string, workspaceRoot: string): string {
  const raw = value.trim();
  if (raw.length === 0) {
    return raw;
  }

  const absoluteWorkspaceRoot = resolveAnyPath(workspaceRoot);
  if (path.isAbsolute(raw)) {
    const relative = path.relative(absoluteWorkspaceRoot, raw);
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : raw;
  }

  const normalized = raw.replace(/^\.\//u, "");
  const workspaceDirectoryName = path.basename(absoluteWorkspaceRoot);
  if (normalized === workspaceDirectoryName) {
    return ".";
  }
  return normalized.startsWith(`${workspaceDirectoryName}/`) ? normalized.slice(workspaceDirectoryName.length + 1) : raw;
}

function limitText(value: string): string {
  return value.length > maxOutputBytes ? `${value.slice(0, maxOutputBytes)}\n...[truncated]` : value;
}

function runProcess(command: string, args: string[], cwd: string): ToolResult["output"] {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: commandTimeoutMs,
    maxBuffer: maxOutputBytes,
  });

  return {
    command,
    args,
    cwd,
    status: result.status,
    signal: result.signal,
    stdout: limitText(result.stdout ?? ""),
    stderr: limitText(result.stderr ?? ""),
    error: result.error?.message,
  };
}

function failExecutor(code: string, message: string) {
  return { ok: false as const, error: { code, message, publicSafe: true as const } };
}

function toolLabFormatText(content: string): string {
  return content
    .replace(/[ \t]+$/gmu, "")
    .replace(/\n?$/u, "\n");
}

function wholeDocumentEdit(content: string, formatted: string) {
  if (formatted === content) {
    return [];
  }
  const lines = content.split(/\n/u);
  return [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length, character: 0 },
      },
      newText: formatted,
    },
  ];
}

function rangeFormatEdit(content: string, range: { start: { line: number; character: number }; end: { line: number; character: number } }) {
  const lines = content.split(/\n/u);
  const startLine = Math.max(0, Math.min(range.start.line, lines.length - 1));
  const endLine = Math.max(startLine, Math.min(range.end.line, lines.length - 1));
  const selected = lines.slice(startLine, endLine + 1).join("\n");
  const formatted = toolLabFormatText(selected);
  if (formatted === selected) {
    return [];
  }
  return [{ range: { start: { line: startLine, character: 0 }, end: { line: endLine + 1, character: 0 } }, newText: formatted }];
}

function lineRange(line: number, startCharacter: number, endCharacter: number) {
  return {
    start: { line, character: startCharacter },
    end: { line, character: endCharacter },
  };
}

function symbolKind(kind: string): string {
  return kind;
}

function readToolLabFile(filePath: string): { ok: true; absolutePath: string; content: string } | { ok: false; error: ReturnType<typeof failExecutor> } {
  const absolutePath = resolveAnyPath(filePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return { ok: false, error: failExecutor("FILE_NOT_FOUND", `File not found: ${filePath}`) };
  }
  return { ok: true, absolutePath, content: readFileSync(absolutePath, "utf8") };
}

function collectToolLabSymbols(filePath: string, content: string) {
  const symbols: {
    name: string;
    kind: string;
    range: ReturnType<typeof lineRange>;
    selectionRange: ReturnType<typeof lineRange>;
    detail?: string;
    containerName?: string;
  }[] = [];
  const lines = content.split(/\r?\n/u);
  const patterns: { kind: string; pattern: RegExp; nameIndex: number }[] = [
    { kind: "class", pattern: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
    { kind: "interface", pattern: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
    { kind: "type", pattern: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
    { kind: "enum", pattern: /^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
    { kind: "function", pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
    { kind: "function", pattern: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/u, nameIndex: 1 },
    { kind: "variable", pattern: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/u, nameIndex: 1 },
  ];

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber] ?? "";
    for (const { kind, pattern, nameIndex } of patterns) {
      const match = pattern.exec(line);
      const name = match?.[nameIndex];
      if (name === undefined) {
        continue;
      }
      const startCharacter = Math.max(0, line.indexOf(name));
      const endCharacter = startCharacter + name.length;
      symbols.push({
        name,
        kind: symbolKind(kind),
        range: lineRange(lineNumber, 0, line.length),
        selectionRange: lineRange(lineNumber, startCharacter, endCharacter),
        detail: line.trim(),
      });
      break;
    }
  }

  return symbols;
}

function toolLabSymbolAtPosition(filePath: string, line: number, character: number): string | undefined {
  const file = readToolLabFile(filePath);
  if (!file.ok) {
    return undefined;
  }
  const sourceLine = file.content.split(/\r?\n/u)[line] ?? "";
  const boundedCharacter = Math.max(0, Math.min(character, sourceLine.length));
  const left = sourceLine.slice(0, boundedCharacter);
  const right = sourceLine.slice(boundedCharacter);
  const prefix = /[A-Za-z_$][\w$]*$/u.exec(left)?.[0] ?? "";
  const suffix = /^[A-Za-z_$][\w$]*/u.exec(right)?.[0] ?? "";
  const symbol = `${prefix}${suffix}`;
  return symbol.length > 0 ? symbol : undefined;
}

function toolLabWorkspaceFiles(workspaceRoot: string, limit = 5000): string[] {
  const absoluteRoot = resolveAnyPath(workspaceRoot);
  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
    return [];
  }
  return scanDirectory(absoluteRoot, limit, 8)
    .filter((entry) => !entry.endsWith("/"))
    .filter((entry) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(entry));
}

function findToolLabSymbolLocations(symbolName: string, workspaceRoot: string, limit = 20) {
  const locations: { filePath: string; range: ReturnType<typeof lineRange>; symbolName: string }[] = [];
  for (const filePath of toolLabWorkspaceFiles(workspaceRoot)) {
    const file = readToolLabFile(filePath);
    if (!file.ok) {
      continue;
    }
    const symbols = collectToolLabSymbols(filePath, file.content);
    for (const symbol of symbols) {
      if (symbol.name !== symbolName) {
        continue;
      }
      locations.push({ filePath, range: symbol.selectionRange, symbolName });
      if (locations.length >= limit) {
        return locations;
      }
    }
  }
  return locations;
}

function findToolLabReferences(symbolName: string, workspaceRoot: string, includeDeclaration = true, limit = 50) {
  const references: { filePath: string; range: ReturnType<typeof lineRange>; symbolName: string }[] = [];
  const wordPattern = new RegExp(`\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "gu");
  for (const filePath of toolLabWorkspaceFiles(workspaceRoot)) {
    const file = readToolLabFile(filePath);
    if (!file.ok) {
      continue;
    }
    const lines = file.content.split(/\r?\n/u);
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber] ?? "";
      for (const match of line.matchAll(wordPattern)) {
        const startCharacter = match.index ?? 0;
        const declarationLike = new RegExp(`\\b(?:class|interface|type|enum|function|const|let|var)\\s+${symbolName}\\b`, "u").test(line);
        if (!includeDeclaration && declarationLike) {
          continue;
        }
        references.push({
          filePath,
          range: lineRange(lineNumber, startCharacter, startCharacter + symbolName.length),
          symbolName,
        });
        if (references.length >= limit) {
          return references;
        }
      }
    }
  }
  return references;
}

function lspWorkspaceRoot(context: Readonly<Record<string, unknown>> | undefined, fallback?: string): string {
  return typeof context?.workspaceRoot === "string" && context.workspaceRoot.trim().length > 0 ? context.workspaceRoot : fallback ?? architectureRoot;
}

type ToolLabNativeWebSearchRequest = Parameters<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["nativeWebSearch"]>>[0];
type ToolLabNativeWebSearchResult = Awaited<ReturnType<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["nativeWebSearch"]>>>;
type ToolLabNativeWebSearchOutput = Extract<ToolLabNativeWebSearchResult, { ok: true }>["output"];
type ToolLabNativeWebSearchSource = { title?: string; url: string; snippet?: string; kind: "citation" | "provider_native"; raw?: unknown };

function collectWebSearchSources(value: unknown): ToolLabNativeWebSearchSource[] {
  const sources = new Map<string, ToolLabNativeWebSearchSource>();

  function addSource(raw: unknown, kind: "citation" | "provider_native"): void {
    if (typeof raw !== "object" || raw === null) return;
    const record = raw as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : undefined;
    if (url === undefined || url.length === 0) return;
    const title = typeof record.title === "string" && record.title.trim().length > 0 ? record.title.trim() : undefined;
    const snippet =
      typeof record.snippet === "string" && record.snippet.trim().length > 0
        ? record.snippet.trim()
        : typeof record.text === "string" && record.text.trim().length > 0
          ? record.text.trim()
          : undefined;
    sources.set(url, { url, ...(title !== undefined ? { title } : {}), ...(snippet !== undefined ? { snippet } : {}), kind, raw });
  }

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    if (type.includes("citation") || type === "url_citation") addSource(record, "citation");
    if (record.url !== undefined && (record.title !== undefined || record.snippet !== undefined || record.text !== undefined)) addSource(record, "provider_native");
    if (Array.isArray(record.sources)) {
      for (const source of record.sources) addSource(source, "provider_native");
    }
    for (const value of Object.values(record)) {
      if (typeof value === "object" && value !== null) walk(value);
    }
  }

  walk(value);
  return [...sources.values()];
}

function responseTextFromOutput(response: unknown): string {
  const text = extractResponseText(response);
  return text.trim().length > 0 ? text.trim() : JSON.stringify(response, null, 2);
}

function collectUrlSourcesFromText(text: string): ToolLabNativeWebSearchSource[] {
  const urls = new Map<string, ToolLabNativeWebSearchSource>();
  const urlPattern = /https?:\/\/[^\s)\]}>,]+/giu;
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0]?.replace(/[.,;:!?]+$/u, "");
    if (rawUrl === undefined || rawUrl.length === 0) continue;
    try {
      const parsedUrl = new URL(rawUrl);
      urls.set(parsedUrl.href, { url: parsedUrl.href, title: parsedUrl.hostname, kind: "citation" });
    } catch {
      continue;
    }
  }
  return [...urls.values()];
}

async function runOpenAiLiveNativeWebSearch(request: ToolLabNativeWebSearchRequest): Promise<ToolLabNativeWebSearchOutput> {
  if (request.provider !== "openai") {
    throw new Error(`tool lab live native web search is currently wired only for OpenAI; requested provider=${request.provider}`);
  }

  const webSearchTool: Record<string, unknown> = {
    type: "web_search",
    external_web_access: true,
  };
  if (request.allowedDomains !== undefined && request.allowedDomains.length > 0) {
    webSearchTool.filters = { allowed_domains: [...request.allowedDomains] };
  }
  if (request.userLocation !== undefined && Object.keys(request.userLocation).length > 0) {
    webSearchTool.user_location = {
      type: "approximate",
      ...request.userLocation,
    };
  }

  const liveModel = request.model ?? process.env.OPENAI_AGENTCORE_WEB_SEARCH_MODEL ?? model;
  const response = await fetch(buildEndpoint(baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: liveModel,
      input: [
        "Use live web search. Answer the user's query with current information. Include source URLs inline. Do not add follow-up offers.",
        `Query: ${request.query}`,
        request.recencyDays !== undefined ? `Prefer material from the last ${request.recencyDays} days when available.` : "",
        request.freshness !== undefined ? `Freshness preference: ${request.freshness}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      tools: [webSearchTool],
      tool_choice: "auto",
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
      include: ["web_search_call.action.sources"],
    }),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { rawText: text };
  }

  if (!response.ok) {
    throw new Error(`OpenAI live web_search failed with HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 1200)}`);
  }

  const answer = responseTextFromOutput(parsed);
  const discoveredSources = collectWebSearchSources(parsed);
  const textSources = collectUrlSourcesFromText(answer);
  const sources =
    discoveredSources.length > 0
      ? discoveredSources.slice(0, request.maxResults ?? 10)
      : textSources.length > 0
        ? textSources.slice(0, request.maxResults ?? 10)
      : [{ url: "https://developers.openai.com/api/docs/guides/tools-web-search", title: "OpenAI Web Search", kind: "provider_native" as const }];

  return {
    answer,
    sources,
    citations: sources.map((source, index) => ({
      url: source.url,
      ...(source.title !== undefined ? { title: source.title } : {}),
      ...(source.snippet !== undefined ? { snippet: source.snippet } : {}),
      providerReference: `web_search_call:${index}`,
      ...(source.raw !== undefined ? { raw: source.raw } : {}),
    })),
    providerMetadata: {
      runtimeEntry: "BaseToolExecutorPort.network.nativeWebSearch",
      labMode: "live-openai-responses-web-search",
      provider: request.provider,
      model: liveModel,
      maxResults: request.maxResults,
      freshness: request.freshness,
      allowedDomains: request.allowedDomains,
      searchContextSize: request.searchContextSize,
      citations: request.citations,
      externalWebAccess: true,
    },
    raw: { labRunId: runId, activeAgentId: activeAgent.id, response: parsed, context: request.context },
  };
}

function createToolLabCodeBaseExecutor(): BaseToolExecutorPort {
  return {
    filesystem: {
      async readText(request) {
        const target = resolveAnyPath(request.path);
        if (!existsSync(target) || !statSync(target).isFile()) {
          return failExecutor("FILE_NOT_FOUND", `File not found: ${request.path}`);
        }

        const encoding = request.encoding === "utf8" || request.encoding === undefined ? "utf8" : "utf8";
        const content = readFileSync(target, encoding);
        if (request.maxBytes === undefined || Buffer.byteLength(content, encoding) <= request.maxBytes) {
          return { ok: true, output: { content, truncated: false } };
        }

        let end = content.length;
        while (end > 0 && Buffer.byteLength(content.slice(0, end), encoding) > request.maxBytes) {
          end -= 1;
        }
        return { ok: true, output: { content: content.slice(0, end), truncated: true } };
      },
      async writeText(request) {
        const target = resolveAnyPath(request.path);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, request.content, request.encoding === "utf8" || request.encoding === undefined ? "utf8" : "utf8");
        return { ok: true, output: { bytesWritten: Buffer.byteLength(request.content, "utf8") } };
      },
      async deletePath(request) {
        const target = resolveAnyPath(request.path);
        rmSync(target, { recursive: request.recursive === true, force: true });
        return { ok: true, output: { deleted: true } };
      },
      async list(request) {
        const root = resolveAnyPath(request.path);
        if (!existsSync(root) || !statSync(root).isDirectory()) {
          return failExecutor("DIRECTORY_NOT_FOUND", `Directory not found: ${request.path}`);
        }

        return { ok: true, output: { entries: scanDirectory(root, request.maxEntries ?? 200, request.depth ?? 1) } };
      },
    },
    process: {
      async run(request) {
        const startedAt = Date.now();
        const result = runProcess(request.command, Array.isArray(request.args) ? [...request.args] : [], resolveAnyPath(request.cwd, ".")) as {
          status?: number | null;
          stdout?: string;
          stderr?: string;
          error?: string;
        };
        return {
          ok: true,
          output: {
            exitCode: typeof result.status === "number" ? result.status : 1,
            stdout: typeof result.stdout === "string" ? result.stdout : "",
            stderr: typeof result.stderr === "string" && result.stderr.length > 0 ? result.stderr : typeof result.error === "string" ? result.error : "",
            durationMs: Date.now() - startedAt,
          },
        };
      },
    },
    debug: {
      async collectLogs(request) {
        const entries = request.sources.slice(0, request.maxEntries ?? 20).map((source, index) => ({
          source: typeof source.id === "string" ? source.id : typeof source.path === "string" ? source.path : `source-${index + 1}`,
          level: "info" as const,
          message: `tool-lab debug log entry for ${typeof source.kind === "string" ? source.kind : "source"}`,
          timestamp: new Date().toISOString(),
        }));
        return { ok: true, output: { entries, truncated: false } };
      },
      async captureState(request) {
        return {
          ok: true,
          output: {
            state: "paused" as const,
            stack: [{ id: "frame-1", name: "toolLabFrame", filePath: typeof request.target.id === "string" ? request.target.id : undefined, line: 1, column: 1 }],
            variables: [{ name: "runtimeId", valuePreview: activeAgent.runtimeId, type: "string" }],
            breakpoints: [],
          },
        };
      },
      async launch(request) {
        return {
          ok: true,
          output: {
            debugSessionId: `${activeAgent.sessionId}:debug:${Date.now()}`,
            state: request.target.kind === "attach" ? ("attached" as const) : ("launched" as const),
            breakpointsAccepted: Array.isArray(request.breakpoints) ? request.breakpoints.length : 0,
            events: [{ source: "tool-lab-debug", level: "info" as const, message: "debug session prepared by tool lab", timestamp: new Date().toISOString() }],
          },
        };
      },
    },
    lsp: {
      async locateDefinition(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (symbolName === undefined) {
          return { ok: true, output: { locations: [] } };
        }
        return { ok: true, output: { locations: findToolLabSymbolLocations(symbolName, workspaceRoot) } };
      },
      async locateTypeDefinition(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (symbolName === undefined) {
          return { ok: true, output: { locations: [] } };
        }
        return { ok: true, output: { locations: findToolLabSymbolLocations(symbolName, workspaceRoot) } };
      },
      async traceReferences(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (symbolName === undefined) {
          return { ok: true, output: { locations: [] } };
        }
        return { ok: true, output: { locations: findToolLabReferences(symbolName, workspaceRoot, request.includeDeclaration !== false) } };
      },
      async traceImplementations(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (symbolName === undefined) {
          return { ok: true, output: { locations: [] } };
        }
        return { ok: true, output: { locations: findToolLabSymbolLocations(symbolName, workspaceRoot) } };
      },
      async scanDocumentSymbols(request) {
        const file = readToolLabFile(request.target.filePath);
        if (!file.ok) {
          return file.error;
        }
        return { ok: true, output: { symbols: collectToolLabSymbols(request.target.filePath, file.content) } };
      },
      async searchWorkspaceSymbols(request) {
        const workspaceRoot = request.workspaceRoot ?? lspWorkspaceRoot(request.context);
        const query = request.query.toLowerCase();
        const symbols = [];
        for (const filePath of toolLabWorkspaceFiles(workspaceRoot)) {
          const file = readToolLabFile(filePath);
          if (!file.ok) {
            continue;
          }
          for (const symbol of collectToolLabSymbols(filePath, file.content)) {
            if (symbol.name.toLowerCase().includes(query)) {
              symbols.push({ name: symbol.name, kind: symbol.kind, location: { filePath, range: symbol.selectionRange, symbolName: symbol.name }, detail: symbol.detail });
            }
            if (symbols.length >= (request.limit ?? 50)) {
              return { ok: true, output: { symbols } };
            }
          }
        }
        return { ok: true, output: { symbols } };
      },
      async suggestCodeActions() {
        return { ok: true, output: { actions: [] } };
      },
      async applyCodeActionPreview() {
        return { ok: true, output: { actions: [] } };
      },
      async renameSymbolPreview(request) {
        const file = readToolLabFile(request.target.filePath);
        if (!file.ok) {
          return file.error;
        }
        const oldName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (oldName === undefined) {
          return { ok: true, output: { edits: [] } };
        }
        const edits = findToolLabReferences(oldName, path.dirname(resolveAnyPath(request.target.filePath)), true, 200).map((location) => ({
          filePath: location.filePath,
          edits: [{ range: location.range, newText: request.newName }],
        }));
        return { ok: true, output: { edits } };
      },
      async completeCode(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const items = [];
        for (const filePath of toolLabWorkspaceFiles(workspaceRoot)) {
          const file = readToolLabFile(filePath);
          if (!file.ok) {
            continue;
          }
          for (const symbol of collectToolLabSymbols(filePath, file.content)) {
            items.push({ label: symbol.name, kind: symbol.kind, detail: symbol.detail });
            if (items.length >= (request.maxItems ?? 50)) {
              return { ok: true, output: { items } };
            }
          }
        }
        return { ok: true, output: { items } };
      },
      async assistSignature(request) {
        const file = readToolLabFile(request.target.filePath);
        if (!file.ok) {
          return file.error;
        }
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        const signatureLine = file.content.split(/\r?\n/u).find((line) => (symbolName === undefined ? /\bfunction\b/u.test(line) : line.includes(symbolName)));
        return {
          ok: true,
          output: {
            signatureHelp: {
              signatures: signatureLine === undefined ? [] : [{ label: signatureLine.trim(), parameters: [] }],
              activeSignature: 0,
              activeParameter: 0,
            },
          },
        };
      },
      async explainSymbol(request) {
        const workspaceRoot = lspWorkspaceRoot(request.context, path.dirname(resolveAnyPath(request.target.filePath)));
        const symbolName = toolLabSymbolAtPosition(request.target.filePath, request.target.line, request.target.character);
        if (symbolName === undefined) {
          return { ok: true, output: {} };
        }
        return {
          ok: true,
          output: {
            hover: { contents: `symbol ${symbolName}` },
            definitions: request.includeDefinitionHint === false ? undefined : findToolLabSymbolLocations(symbolName, workspaceRoot, 5),
            references: request.includeReferencesHint === false ? undefined : findToolLabReferences(symbolName, workspaceRoot, true, 5),
          },
        };
      },
      async inspectSymbol(request) {
        const file = readToolLabFile(request.target.filePath);
        if (!file.ok) {
          return file.error;
        }
        let symbols = collectToolLabSymbols(request.target.filePath, file.content);
        if (request.target.symbolName !== undefined) {
          symbols = symbols.filter((symbol) => symbol.name === request.target.symbolName);
        }
        if (request.target.position !== undefined) {
          const { line, character } = request.target.position;
          symbols = symbols.filter((symbol) => {
            const { selectionRange } = symbol;
            return selectionRange.start.line === line && selectionRange.start.character <= character && selectionRange.end.character >= character;
          });
        }
        return { ok: true, output: { symbols } };
      },
      async inspectDiagnostics() {
        return { ok: true, output: { diagnostics: [] } };
      },
      async formatDocumentPreview(request) {
        const target = resolveAnyPath(request.target.filePath);
        if (!existsSync(target) || !statSync(target).isFile()) {
          return failExecutor("FILE_NOT_FOUND", `File not found: ${request.target.filePath}`);
        }
        const content = readFileSync(target, "utf8");
        return { ok: true, output: { edits: wholeDocumentEdit(content, toolLabFormatText(content)) } };
      },
      async formatRangePreview(request) {
        const target = resolveAnyPath(request.target.filePath);
        if (!existsSync(target) || !statSync(target).isFile()) {
          return failExecutor("FILE_NOT_FOUND", `File not found: ${request.target.filePath}`);
        }
        const content = readFileSync(target, "utf8");
        return { ok: true, output: { edits: rangeFormatEdit(content, request.target.range) } };
      },
    },
    search: {
      async ripgrep(request) {
        const directory = resolveAnyPath(request.directoryPath);
        if (!existsSync(directory) || !statSync(directory).isDirectory()) {
          return failExecutor("DIRECTORY_NOT_FOUND", `Directory not found: ${request.directoryPath}`);
        }

        const rgArgs = [
          "--line-number",
          "--column",
          "--max-count",
          String(request.maxMatches),
          request.literal ? "--fixed-strings" : "",
          request.caseSensitive ? "--case-sensitive" : "--ignore-case",
          request.includeHidden ? "--hidden" : "",
          ...(request.fileGlob === undefined ? [] : ["-g", request.fileGlob]),
          request.query,
          ".",
        ].filter(Boolean);
        const raw = runProcess("rg", rgArgs, directory) as Record<string, unknown>;
        const stdout = typeof raw.stdout === "string" ? raw.stdout : "";
        const stderr = typeof raw.stderr === "string" ? raw.stderr : "";
        const status = typeof raw.status === "number" ? raw.status : 1;
        const matches = stdout
          .split(/\r?\n/u)
          .filter(Boolean)
          .slice(0, request.maxMatches)
          .map((line) => {
            const match = /^(.*?):(\d+):(\d+):(.*)$/u.exec(line);
            if (match === null) {
              return { path: "", line: 0, text: line };
            }
            return {
              path: path.relative(repoRoot, path.resolve(directory, match[1] ?? "")).split(path.sep).join("/"),
              line: Number(match[2]),
              column: Number(match[3]),
              text: match[4] ?? "",
            };
          });

        return { ok: true, output: { exitCode: status, matches, stderr: stderr.length > 0 ? stderr : undefined } };
      },
    },
  };
}

const toolLabMcpServerId = "fs-mcp";
const toolLabMcpResources = [
  {
    uri: "file:///workspace/README.md",
    name: "README.md",
    mimeType: "text/markdown",
    text: "# Tool Lab MCP\n\nDeterministic fake MCP resource exposed by the lab runtime.",
  },
  {
    uri: "file:///workspace/package.json",
    name: "package.json",
    mimeType: "application/json",
    text: "{\n  \"name\": \"praxis-agent-architecture-lab\"\n}\n",
  },
] as const;
const toolLabMcpMutableResources = new Map<string, { uri: string; name: string; mimeType: string; text: string; revision: string }>();
const toolLabMcpDynamicTools = new Map<
  string,
  { name: string; title?: string; description?: string; inputSchema?: unknown; disabled?: boolean; namespace?: string; raw?: unknown }
>();

function toolLabAllMcpResources(): { uri: string; name: string; mimeType: string; text: string; revision?: string }[] {
  return [...toolLabMcpResources, ...toolLabMcpMutableResources.values()];
}

function createToolLabMcpExecutor(): BaseToolExecutorPort {
  return {
    mcp: {
      async authenticate(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            status: "authenticated",
            authSessionId: `${toolLabMcpServerId}:auth:${request.authStrategy}`,
            scopesGranted: request.requestedScopes ?? ["mcp:fs"],
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.authenticate",
              authStrategy: request.authStrategy,
              credentialRefAccepted: true,
            },
          },
        };
      },
      async authorize(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            decision: "allowed",
            policyId: `${toolLabMcpServerId}:policy:${request.action}`,
            scopesGranted: request.requestedScopes ?? ["mcp:fs"],
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.authorize",
              subjectId: request.subjectId,
              action: request.action,
            },
          },
        };
      },
      async cache(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            cacheKey: request.cacheKey,
            status: "cached",
            expiresAt:
              request.ttlSeconds === undefined
                ? undefined
                : new Date(Date.now() + request.ttlSeconds * 1000).toISOString(),
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.cache",
              tagCount: request.tags?.length ?? 0,
            },
          },
        };
      },
      async invalidateCache(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            scope: request.scope,
            cacheKey: request.cacheKey,
            status: "invalidated",
            invalidatedCount: request.cacheKey === undefined ? 2 : 1,
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.invalidateCache",
              reasonProvided: typeof request.reason === "string" && request.reason.length > 0,
            },
          },
        };
      },
      async connect(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            connectionId: request.connectionId ?? `${toolLabMcpServerId}:connection`,
            status: "connected",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.connect",
              transportHint: request.transportHint ?? "runtime-default",
            },
          },
        };
      },
      async disconnect(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            connectionId: request.connectionId ?? `${toolLabMcpServerId}:connection`,
            status: "disconnected",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.disconnect",
              force: request.force === true,
            },
          },
        };
      },
      async subscribe(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            connectionId: request.connectionId ?? `${toolLabMcpServerId}:connection`,
            subscriptionId: `${toolLabMcpServerId}:subscription:${request.subjectType}:${request.subject}`,
            status: "subscribed",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.subscribe",
              subjectType: request.subjectType,
              eventKinds: request.eventKinds ?? [],
              replayPolicy: request.replayPolicy ?? "none",
            },
          },
        };
      },
      async unsubscribe(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            subscriptionId: request.subscriptionId,
            status: "unsubscribed",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.unsubscribe",
              reasonProvided: typeof request.reason === "string" && request.reason.length > 0,
            },
          },
        };
      },
      async callTool(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }

        if (request.toolName === "read_file") {
          const requestedPath = isRecord(request.arguments) ? request.arguments.path : undefined;
          const resourceUri = normalizeMcpResourceUri(requestedPath) ?? "file:///workspace/README.md";
          const resource = toolLabAllMcpResources().find((item) => item.uri === resourceUri);
          if (resource === undefined) {
            return failExecutor("MCP_RESOURCE_NOT_FOUND", `MCP lab resource not found: ${resourceUri}`);
          }
          return {
            ok: true,
            output: {
              content: [{ type: "text", text: resource.text, mimeType: resource.mimeType }],
              resourceUri: resource.uri,
              providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.callTool" },
            },
          };
        }

        if (request.toolName === "list_directory") {
          return {
            ok: true,
            output: {
              content: [
                {
                  type: "json",
                  json: toolLabAllMcpResources().map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
                },
              ],
              providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.callTool" },
            },
          };
        }

        return failExecutor("MCP_TOOL_NOT_FOUND", `MCP lab tool not found: ${request.toolName}`);
      },
      async streamTool(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        if (request.name !== "read_file") {
          return failExecutor("MCP_TOOL_NOT_FOUND", `MCP lab stream tool not found: ${request.name}`);
        }
        const requestedPath = isRecord(request.arguments) ? request.arguments.path : undefined;
        const resourceUri = normalizeMcpResourceUri(requestedPath) ?? "file:///workspace/README.md";
        const resource = toolLabAllMcpResources().find((item) => item.uri === resourceUri);
        if (resource === undefined) {
          return failExecutor("MCP_RESOURCE_NOT_FOUND", `MCP lab resource not found: ${resourceUri}`);
        }
        const channel = request.channel ?? "chunks";
        const chunks = resource.text.split(/\n/u).filter(Boolean).slice(0, request.maxEvents ?? 3);
        return {
          ok: true,
          output: {
            executionId: `${toolLabMcpServerId}:execution:${request.name}`,
            streamId: `${toolLabMcpServerId}:stream:${request.name}`,
            status: "completed",
            channel,
            chunks: channel === "chunks" ? chunks : undefined,
            events: channel === "events" ? chunks.map((text, index) => ({ index, text })) : undefined,
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.streamTool",
              resourceUri,
            },
          },
        };
      },
      async cancelExecution(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            serverId: request.serverId,
            executionId: request.executionId,
            status: "cancelled",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.cancelExecution",
              force: request.force === true,
              reasonProvided: typeof request.reason === "string" && request.reason.length > 0,
            },
          },
        };
      },
      async nativeExecute(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        if (request.method === "tools/list") {
          return {
            ok: true,
            output: {
              status: "executed",
              result: {
                tools: [
                  { name: "read_file", inputSchema: { type: "object" } },
                  { name: "list_directory", inputSchema: { type: "object" } },
                  ...[...toolLabMcpDynamicTools.values()].map(({ name, inputSchema }) => ({ name, inputSchema })),
                ],
              },
              providerMetadata: {
                labMcpServerId: request.serverId,
                runtimeEntry: "BaseToolExecutorPort.mcp.nativeExecute",
                method: request.method,
                protocolVersion: request.protocolVersion,
              },
            },
          };
        }
        return failExecutor("MCP_NATIVE_METHOD_NOT_ALLOWED", `MCP lab native method is not allowed: ${request.method}`);
      },
      async listTools(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const dynamicTools = [...toolLabMcpDynamicTools.values()];
        return {
          ok: true,
          output: {
            tools: [
              {
                name: "read_file",
                title: "Read file",
                description: "Read a deterministic fake workspace file.",
                namespace: "fs",
                inputSchema: { type: "object", properties: { path: { type: "string" } } },
              },
              {
                name: "list_directory",
                title: "List directory",
                description: "List deterministic fake workspace resources.",
                namespace: "fs",
                inputSchema: { type: "object", properties: { path: { type: "string" } } },
              },
              ...dynamicTools,
            ].filter((tool) => request.namespace === undefined || tool.namespace === request.namespace),
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.listTools" },
          },
        };
      },
      async registerTool(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        toolLabMcpDynamicTools.set(request.tool.name, {
          name: request.tool.name,
          title: request.tool.name,
          description: request.tool.description,
          inputSchema: request.tool.inputSchema,
          namespace: "dynamic",
          raw: request.tool.metadata,
        });
        return {
          ok: true,
          output: {
            name: request.tool.name,
            status: "registered",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.registerTool",
              replaceExisting: request.replaceExisting === true,
            },
          },
        };
      },
      async updateTool(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const existing = toolLabMcpDynamicTools.get(request.toolName) ?? {
          name: request.toolName,
          title: request.toolName,
          namespace: "dynamic",
        };
        const updatedName = request.patch.name ?? existing.name;
        toolLabMcpDynamicTools.delete(request.toolName);
        toolLabMcpDynamicTools.set(updatedName, {
          ...existing,
          name: updatedName,
          title: updatedName,
          description: request.patch.description ?? existing.description,
          inputSchema: request.patch.inputSchema ?? existing.inputSchema,
          raw: request.patch.metadata ?? existing.raw,
        });
        return {
          ok: true,
          output: {
            toolName: updatedName,
            status: "updated",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.updateTool",
              patchKeys: Object.keys(request.patch).sort(),
            },
          },
        };
      },
      async unregisterTool(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const existed = toolLabMcpDynamicTools.delete(request.toolName);
        return {
          ok: true,
          output: {
            toolName: request.toolName,
            status: existed ? "unregistered" : "not_found",
            providerMetadata: {
              labMcpServerId: request.serverId,
              runtimeEntry: "BaseToolExecutorPort.mcp.unregisterTool",
              keepAuditRecord: request.keepAuditRecord !== false,
            },
          },
        };
      },
      async listResources(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const allResources = toolLabAllMcpResources();
        const resources = allResources
          .filter((resource) => request.uriPrefix === undefined || resource.uri.startsWith(request.uriPrefix))
          .slice(0, request.limit ?? allResources.length)
          .map(({ uri, name, mimeType }) => ({ uri, name, mimeType }));
        return {
          ok: true,
          output: {
            resources,
            exhausted: resources.length >= allResources.length || request.limit === undefined,
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.listResources" },
          },
        };
      },
      async readResource(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const resource = toolLabAllMcpResources().find((item) => item.uri === request.resourceUri);
        if (resource === undefined) {
          return failExecutor("MCP_RESOURCE_NOT_FOUND", `MCP lab resource not found: ${request.resourceUri}`);
        }
        const text = request.maxBytes === undefined ? resource.text : resource.text.slice(0, request.maxBytes);
        return {
          ok: true,
          output: {
            uri: resource.uri,
            contents: [{ mimeType: resource.mimeType, text }],
            truncated: text.length < resource.text.length,
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.readResource" },
          },
        };
      },
      async createResource(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const text = typeof request.initialContent === "string" ? request.initialContent : JSON.stringify(request.initialContent ?? "", null, 2);
        const revision = `rev-${toolLabMcpMutableResources.size + 1}`;
        toolLabMcpMutableResources.set(request.uri, {
          uri: request.uri,
          name: path.posix.basename(request.uri),
          mimeType: request.mimeType ?? "text/plain",
          text,
          revision,
        });
        return {
          ok: true,
          output: {
            uri: request.uri,
            status: "created",
            revision,
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.createResource" },
          },
        };
      },
      async updateResource(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        const existing = toolLabAllMcpResources().find((item) => item.uri === request.resourceUri);
        if (existing === undefined) {
          return failExecutor("MCP_RESOURCE_NOT_FOUND", `MCP lab resource not found: ${request.resourceUri}`);
        }
        const text = request.content.text ?? existing.text;
        const revision = `rev-${toolLabMcpMutableResources.size + 1}-updated`;
        toolLabMcpMutableResources.set(request.resourceUri, {
          uri: request.resourceUri,
          name: path.posix.basename(request.resourceUri),
          mimeType: request.content.mimeType ?? existing.mimeType,
          text,
          revision,
        });
        return {
          ok: true,
          output: {
            uri: request.resourceUri,
            status: "updated",
            revision,
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.updateResource" },
          },
        };
      },
      async deleteResource(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        toolLabMcpMutableResources.delete(request.uri);
        return {
          ok: true,
          output: {
            uri: request.uri,
            status: "deleted",
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.deleteResource" },
          },
        };
      },
      async ping(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            healthy: true,
            status: "ok",
            latencyMs: 1,
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.ping" },
          },
        };
      },
      async checkHealth(request) {
        if (request.serverId !== toolLabMcpServerId) {
          return failExecutor("MCP_SERVER_NOT_FOUND", `MCP server not mounted in lab: ${request.serverId}`);
        }
        return {
          ok: true,
          output: {
            status: "healthy",
            connection: "connected",
            latencyMs: 1,
            capabilities: request.includeCapabilities === false ? [] : ["tools", "resources", "ping"],
            providerMetadata: { labMcpServerId: request.serverId, runtimeEntry: "BaseToolExecutorPort.mcp.checkHealth" },
          },
        };
      },
    },
  };
}

function createToolLabBaseToolExecutor(): BaseToolExecutorPort {
  return {
    ...createToolLabCodeBaseExecutor(),
    ...createToolLabMcpExecutor(),
    git: {
      async runGit(request) {
        const repositoryPath = resolveAnyPath(request.repositoryPath, architectureRoot);
        const result = spawnSync("git", [...request.args], {
          cwd: repositoryPath,
          encoding: "utf8",
          timeout: request.timeoutMs ?? commandTimeoutMs,
          maxBuffer: Math.max(maxOutputBytes * 8, 1_600_000),
        });
        const hitOutputBufferLimit =
          result.error !== undefined &&
          (result.error.message.includes("maxBuffer") || (result.error as NodeJS.ErrnoException).code === "ENOBUFS");
        if (result.error !== undefined && !hitOutputBufferLimit) {
          return failExecutor("GIT_EXECUTOR_ERROR", result.error.message);
        }

        return {
          ok: true,
          output: {
            exitCode: typeof result.status === "number" ? result.status : hitOutputBufferLimit ? 0 : 1,
            stdout: limitText(result.stdout ?? ""),
            stderr: limitText(result.stderr ?? ""),
          },
          metadata: {
            runtimeEntry: "BaseToolExecutorPort.git.runGit",
            repositoryPath,
            gitArgs: [...request.args],
            labMode: "host-git-process",
          },
        };
      },
    },
    network: {
      async fetch(request) {
        const response = await fetch(request.url, { method: request.method ?? "GET", signal: AbortSignal.timeout(request.timeoutMs ?? commandTimeoutMs) });
        return {
          ok: true,
          output: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: limitText(await response.text()),
            finalUrl: response.url,
          },
        };
      },
      async search(request) {
        return {
          ok: true,
          output: {
            results: [
              {
                title: `Tool lab search result for ${request.query}`,
                url: "https://example.com/search-lab-result",
                snippet: "Deterministic runtime.network.search result proving search.searchEngine is mounted through the handler path.",
              },
            ].slice(0, request.maxResults ?? 10),
          },
          metadata: {
            runtimeEntry: "BaseToolExecutorPort.network.search",
            recencyDays: request.recencyDays,
            locale: request.locale,
          },
        };
      },
      async nativeWebSearch(request) {
        try {
          return { ok: true, output: await runOpenAiLiveNativeWebSearch(request) };
        } catch (error) {
          return failExecutor(
            "LIVE_NATIVE_WEB_SEARCH_FAILED",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      async ground(request) {
        const firstEvidence = request.evidence[0];
        const sourceUrl = firstEvidence?.url ?? "https://example.com/grounding-lab-evidence";
        return {
          ok: true,
          output: {
            answer: `Tool lab grounded the claim through BaseToolExecutorPort.network.ground: ${request.claim}`,
            grounded: true,
            status: "grounded" as const,
            confidence: "high" as const,
            citations: [{ url: sourceUrl, title: firstEvidence?.title, snippet: firstEvidence?.excerpt, providerReference: "tool_lab_ground" }],
            sources: [{ url: sourceUrl, title: firstEvidence?.title, snippet: firstEvidence?.excerpt, kind: "citation" as const }],
            providerMetadata: {
              runtimeEntry: "BaseToolExecutorPort.network.ground",
              labMode: "deterministic-grounding",
              provider: request.provider,
              model: request.model,
              mode: request.mode,
              citations: request.citations,
            },
            raw: { labRunId: runId, activeAgentId: activeAgent.id, context: request.context },
          },
        };
      },
    },
    omni: {
      async transformMedia(request) {
        const mimeType =
          typeof request.parameters?.mediaType === "string"
            ? request.parameters.mediaType
            : typeof request.parameters?.targetFormat === "string"
              ? `application/x-${request.parameters.targetFormat}`
              : "application/octet-stream";
        return {
          ok: true,
          output: {
            artifactId: `artifact:tool-lab:${request.operation}:${Date.now()}`,
            mimeType,
          },
          metadata: {
            runtimeEntry: "BaseToolExecutorPort.omni.transformMedia",
            labMode: "deterministic-omni-transform",
            operation: request.operation,
            inputArtifactId: request.inputArtifactId,
          },
        };
      },
    },
  };
}

function publishRuntimeBehaviorEvent(eventKind: string, payload: Record<string, unknown>): void {
  const behaviorRuntime = assertOk(
    "runtime.behaviorExposure",
    createBehaviorExposureRuntime({
      runtimeId: activeAgent.runtimeId,
      sessionId: activeAgent.sessionId,
      caller: "applicationSurface",
      runtimeReady: true,
      createdAt: new Date().toISOString(),
    }),
  );

  const result = behaviorRuntime.runtime.publishEvent({
    eventId: `${activeAgent.runtimeId}:${eventKind}:${Date.now()}`,
    eventKind,
    source: "executionEngine",
    payload,
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
    },
  });

  logEvent("runtime.behaviorExposure.event", { eventKind, result });
}

function createAgentCoreToolInvocationEnvelope(tool: string, args: Record<string, unknown>): ToolResult | undefined {
  const invocationId = `${activeAgent.runtimeId}:tool:${tool}:${Date.now()}`;
  const assembly = assemblies.get(activeAgent.id);
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId: activeAgent.runtimeId,
      sessionId: activeAgent.sessionId,
      invocationId,
      requestedScopes: ["tool.execute", `tool.${tool}`],
      allowedScopes: ["tool.execute", `tool.${tool}`],
      auditMetadata: {
        labRunId: runId,
        activeAgentId: activeAgent.id,
        surfaceIds: assembly?.surfaceIds ?? [],
      },
    },
    toolId: tool,
    operation: tool,
    arguments: args,
    cwd: repoRoot,
    resourceLimits: {
      timeoutMs: commandTimeoutMs,
      maxOutputBytes,
    },
  });

  if (!adapted.ok) {
    logEvent("agentCore.toolInvocation.rejected", { tool, args, adapted });
    return { tool, ok: false, error: `agentCore tool adapter rejected invocation: ${adapted.error.code}` };
  }

  const bridged = bridgeExecEngineInvocation({
    runtimeId: activeAgent.runtimeId,
    caller: { kind: "application", id: activeAgent.applicationId, sessionId: activeAgent.sessionId },
    invocation: {
      invocationId,
      kind: "tool",
      target: tool,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });

  if (!bridged.ok) {
    logEvent("agentCore.toolInvocation.bridgeRejected", { tool, args, adapted, bridged });
    return { tool, ok: false, error: `agentCore execEngine bridge rejected invocation: ${bridged.error.code}` };
  }

  publishRuntimeBehaviorEvent("tool.invocation.planned", {
    tool,
    invocationId,
    adapterDispatch: adapted.invocation.dispatch,
    bridgeRoute: bridged.plan.route,
    mode: "dev-all-tools",
  });
  logEvent("agentCore.toolInvocation.accepted", { tool, adapted, bridged });
  return undefined;
}

function scanDirectory(root: string, limit: number, depth = 1): string[] {
  const outputPaths: string[] = [];

  function walk(current: string, currentDepth: number): void {
    if (outputPaths.length >= limit) {
      return;
    }

    const childDirectories: string[] = [];
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      outputPaths.push(path.relative(repoRoot, absolutePath).split(path.sep).join("/") + (entry.isDirectory() ? "/" : ""));
      if (entry.isDirectory()) {
        childDirectories.push(absolutePath);
      }

      if (outputPaths.length >= limit) {
        return;
      }
    }

    if (currentDepth >= depth) {
      return;
    }

    for (const childDirectory of childDirectories) {
      walk(childDirectory, currentDepth + 1);
      if (outputPaths.length >= limit) {
        return;
      }
    }
  }

  walk(root, 1);
  return outputPaths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolLabGovernedContext(args: Record<string, unknown>): Record<string, unknown> {
  const inputContext = isRecord(args.context) ? args.context : {};
  return {
    ...inputContext,
    dryRun: false,
    guard: { ...(isRecord(inputContext.guard) ? inputContext.guard : {}), allowed: true, accepted: true },
    workspaceRoot: typeof inputContext.workspaceRoot === "string" ? inputContext.workspaceRoot : repoRoot,
    allowedRoots: Array.isArray(inputContext.allowedRoots) ? inputContext.allowedRoots : [repoRoot, architectureRoot],
    requestedScopes: Array.isArray(inputContext.requestedScopes) ? inputContext.requestedScopes : ["filesystem:read"],
    allowedScopes: Array.isArray(inputContext.allowedScopes) ? inputContext.allowedScopes : ["filesystem:read"],
    auditMetadata: {
      ...(isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : {}),
      labRunId: runId,
      activeAgentId: activeAgent.id,
      surface: "agentcore_tool_lab",
    },
  };
}

type MountedCodeBaseTool =
  | "code.read"
  | "code.scan"
  | "code.search_Ripgrep"
  | "code.replaceFile"
  | "code.overwrite"
  | "code.modify"
  | "code.delete"
  | "code.format"
  | "code.testCode"
  | "code.benchmark"
  | "code.debugCollectLogs"
  | "code.debugCaptureState"
  | "code.debugRun"
  | "code.lsp_applyCodeAction"
  | "code.lsp_assistSignature"
  | "code.lsp_completeCode"
  | "code.lsp_explainSymbol"
  | "code.lsp_formatDocument"
  | "code.lsp_formatRange"
  | "code.lsp_inspectDiagnostics"
  | "code.lsp_inspectSymbol"
  | "code.lsp_locateDefinition"
  | "code.lsp_locateTypeDefinition"
  | "code.lsp_renameSymbol"
  | "code.lsp_scanDocumentSymbols"
  | "code.lsp_searchWorkspaceSymbols"
  | "code.lsp_suggestCodeActions"
  | "code.lsp_traceImplementations"
  | "code.lsp_traceReferences";

const mountedLspTools = new Set<MountedCodeBaseTool>([
  "code.lsp_applyCodeAction",
  "code.lsp_assistSignature",
  "code.lsp_completeCode",
  "code.lsp_explainSymbol",
  "code.lsp_formatDocument",
  "code.lsp_formatRange",
  "code.lsp_inspectDiagnostics",
  "code.lsp_inspectSymbol",
  "code.lsp_locateDefinition",
  "code.lsp_locateTypeDefinition",
  "code.lsp_renameSymbol",
  "code.lsp_scanDocumentSymbols",
  "code.lsp_searchWorkspaceSymbols",
  "code.lsp_suggestCodeActions",
  "code.lsp_traceImplementations",
  "code.lsp_traceReferences",
]);

function normalizeMountedCodeBaseTool(tool: string): MountedCodeBaseTool | undefined {
  const normalized = tool.trim();
  if (normalized === "code.read") return "code.read";
  if (normalized === "code.scan" || normalized === "code.list") return "code.scan";
  if (normalized === "code.search_Ripgrep" || normalized === "skill.ripgrep") return "code.search_Ripgrep";
  if (normalized === "code.replaceFile") return "code.replaceFile";
  if (normalized === "code.overwrite" || normalized.endsWith(".overwrite")) return "code.overwrite";
  if (normalized === "code.modify") return "code.modify";
  if (normalized === "code.delete" || normalized.endsWith(".delete")) return "code.delete";
  if (normalized === "code.format") return "code.format";
  if (normalized === "code.testCode" || normalized === "code.test" || normalized === "code.runTest") return "code.testCode";
  if (normalized === "code.benchmark" || normalized === "code.bench") return "code.benchmark";
  if (normalized === "code.debugCollectLogs" || normalized === "code.debugLogs") return "code.debugCollectLogs";
  if (normalized === "code.debugCaptureState" || normalized === "code.debugState") return "code.debugCaptureState";
  if (normalized === "code.debugRun" || normalized === "code.runDebug") return "code.debugRun";
  if (mountedLspTools.has(normalized as MountedCodeBaseTool)) return normalized as MountedCodeBaseTool;
  return undefined;
}

function firstNonBlankString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function parseSmallChineseInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (/^\d+$/u.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") return 10;
  const tenPrefix = normalized.match(/^十([一二两三四五六七八九])$/u);
  if (tenPrefix !== null) return 10 + digits[tenPrefix[1]];
  const tenSuffix = normalized.match(/^([一二两三四五六七八九])十$/u);
  if (tenSuffix !== null) return digits[tenSuffix[1]] * 10;
  const compound = normalized.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])$/u);
  if (compound !== null) return digits[compound[1]] * 10 + digits[compound[2]];
  return digits[normalized];
}

function inferReadRangeFromUserText(userText: string | undefined): { startLine: number; endLine: number } | undefined {
  if (userText === undefined) {
    return undefined;
  }

  const explicit = userText.match(/(?:前|开头)\s*([0-9]+|[一二两三四五六七八九十]{1,3})\s*行/u);
  if (explicit !== null) {
    const endLine = parseSmallChineseInteger(explicit[1]);
    if (endLine !== undefined) {
      return { startLine: 1, endLine };
    }
  }

  if (/(?:开头几行|前几行|开头看看|开头在做什么)/u.test(userText)) {
    return { startLine: 1, endLine: 12 };
  }

  return undefined;
}

function inferExtensionFromUserText(userText: string | undefined): string | undefined {
  if (userText === undefined) {
    return undefined;
  }

  const match = userText.match(/(?:只看|只列|只在|仅看|仅列|仅在|过滤|筛选)[^。\n]*(?:\.?([A-Za-z0-9_-]{1,12})\s*文件|\.([A-Za-z0-9_-]{1,12}))/u);
  const rawExtension = match?.[1] ?? match?.[2];
  if (rawExtension === undefined) {
    return undefined;
  }

  const extension = rawExtension.toLowerCase();
  return /^[a-z0-9_-]+$/u.test(extension) ? extension : undefined;
}

function inferPathFromUserText(userText: string | undefined): string | undefined {
  if (userText === undefined) {
    return undefined;
  }
  const match = userText.match(/((?:Praxis_Agent_Architecture|\.|src|test|tasks|docs|scripts)[A-Za-z0-9_./~:-]*\.[A-Za-z0-9_-]+)/u);
  return match?.[1];
}

function inferLspPositionFromUserText(userText: string | undefined): { line: number; character: number } | undefined {
  if (userText === undefined) {
    return undefined;
  }
  const lineMatch = userText.match(/(?:第|line\s*)\s*([0-9]+|[一二两三四五六七八九十]{1,3})\s*(?:行|line)?/iu);
  const line = lineMatch === null ? undefined : parseSmallChineseInteger(lineMatch[1]);
  if (line === undefined) {
    return undefined;
  }
  const characterMatch = userText.match(/(?:第|column\s*|character\s*)\s*([0-9]+|[一二两三四五六七八九十]{1,3})\s*(?:列|个字符|column|character)/iu);
  const character = characterMatch === null ? 1 : parseSmallChineseInteger(characterMatch[1]) ?? 1;
  return { line: Math.max(0, line - 1), character: Math.max(0, character - 1) };
}

function inferLspQueryFromUserText(userText: string | undefined): string | undefined {
  if (userText === undefined) {
    return undefined;
  }
  const quoted = userText.match(/[“"`']([^“”"`']{1,80})[”"`']/u);
  if (quoted?.[1] !== undefined) {
    return quoted[1].trim();
  }
  const possessiveIdentifier = userText.match(/\b([A-Za-z_$][\w$]{1,80})\s*的(?:定义|类型定义|引用|实现|信息|签名|补全|符号|重命名)/u);
  if (possessiveIdentifier?.[1] !== undefined) {
    return possessiveIdentifier[1];
  }
  const describedIdentifier = userText.match(/\b([A-Za-z_$][\w$]{1,80})\s*(?:这个|这个目标|这个代码)?\s*(?:符号|函数|类|类型|变量)/u);
  if (describedIdentifier?.[1] !== undefined) {
    return describedIdentifier[1];
  }
  const symbol = userText.match(/(?:符号|symbol|名字|name)\s*[:：]?\s*([A-Za-z_$][\w$]{1,80})/iu);
  return symbol?.[1];
}

function inferLspPositionFromFile(targetPath: string | undefined, requestedPosition: { line: number; character: number }, symbolName: string | undefined): { line: number; character: number } {
  if (targetPath === undefined || symbolName === undefined) {
    return requestedPosition;
  }
  const file = readToolLabFile(targetPath);
  if (!file.ok) {
    return requestedPosition;
  }
  const lines = file.content.split(/\r?\n/u);
  const candidateLines = [requestedPosition.line, requestedPosition.line - 1, requestedPosition.line + 1].filter((line, index, all) => line >= 0 && line < lines.length && all.indexOf(line) === index);
  for (const line of candidateLines) {
    const character = (lines[line] ?? "").indexOf(symbolName);
    if (character >= 0) {
      return { line, character };
    }
  }
  return requestedPosition;
}

function trimIntentText(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/[。；;，,]$/u, "");
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function inferModifyIntentFromUserText(userText: string | undefined): { searchText: string; replacementText: string } | undefined {
  if (userText === undefined) {
    return undefined;
  }
  const match = userText.match(/(?:里面的|中的|把)\s*([^，。；;\n]+?)\s*(?:改成|替换成|替换为|换成)\s*([^，。；;\n]+)/u);
  const searchText = trimIntentText(match?.[1]);
  const replacementText = trimIntentText(match?.[2]);
  return searchText !== undefined && replacementText !== undefined ? { searchText, replacementText } : undefined;
}

function inferLineRangeFromUserText(userText: string | undefined): { startLine: number; endLine: number } | undefined {
  if (userText === undefined) {
    return undefined;
  }
  const single = userText.match(/第\s*([0-9]+|[一二两三四五六七八九十]{1,3})\s*行/u);
  if (single !== null) {
    const line = parseSmallChineseInteger(single[1]);
    return line === undefined ? undefined : { startLine: line, endLine: line };
  }
  return undefined;
}

function normalizeMountedCodeBaseInput(
  tool: MountedCodeBaseTool,
  args: Record<string, unknown>,
  userText?: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...args, context: toolLabGovernedContext(args) };
  const isLspTool = mountedLspTools.has(tool);

  if (tool === "code.read") {
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file) ?? input.targetPath;
    if (isRecord(input.range)) {
      input.range = {
        ...input.range,
        startLine: input.range.startLine ?? input.range.start,
        endLine: input.range.endLine ?? input.range.end,
      };
    }
    if (input.range === undefined && (args.startLine !== undefined || args.endLine !== undefined)) {
      input.range = { startLine: args.startLine, endLine: args.endLine };
    }
    input.range ??= inferReadRangeFromUserText(userText);
  }

  if (tool === "code.scan") {
    input.directoryPath = firstNonBlankString(input.directoryPath, args.directory, args.path) ?? ".";
    input.maxEntries ??= args.limit;
    input.depth ??= args.depth ?? 1;
    if (input.includeGlobs === undefined) {
      const extension = inferExtensionFromUserText(userText);
      if (extension !== undefined) {
        input.includeGlobs = [`*.${extension}`, `**/*.${extension}`];
      }
    }
  }

  if (tool === "code.search_Ripgrep") {
    input.query ??= args.pattern;
    input.directoryPath = firstNonBlankString(input.directoryPath, args.directory, args.path, args.cwd) ?? "Praxis_Agent_Architecture";
    input.fileGlob ??= args.glob;
    if (input.fileGlob === undefined) {
      const extension = inferExtensionFromUserText(userText);
      if (extension !== undefined) {
        input.fileGlob = `**/*.${extension}`;
      }
    }
  }

  if (tool === "code.replaceFile") {
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file, inferPathFromUserText(userText)) ?? input.targetPath;
    input.newContent = typeof input.newContent === "string" ? input.newContent : String(args.content ?? "");
  }

  if (tool === "code.overwrite") {
    input.workspaceRoot ??= repoRoot;
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file, inferPathFromUserText(userText)) ?? input.targetPath;
    input.content = typeof input.content === "string" ? input.content : String(args.content ?? "");
  }

  if (tool === "code.modify") {
    input.workspaceRoot ??= repoRoot;
    const inferredModify = inferModifyIntentFromUserText(userText);
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file, inferPathFromUserText(userText)) ?? input.targetPath;
    input.searchText ??= args.search ?? args.oldText ?? args.old;
    input.replacementText ??= args.replacement ?? args.newText ?? args.new;
    input.searchText ??= inferredModify?.searchText;
    input.replacementText ??= inferredModify?.replacementText;
  }

  if (tool === "code.delete") {
    input.workspaceRoot ??= repoRoot;
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file, inferPathFromUserText(userText)) ?? input.targetPath;
    input.range ??= inferLineRangeFromUserText(userText);
    input.deleteKind ??= args.kind ?? (input.range === undefined ? "file" : "code-range");
  }

  if (tool === "code.format") {
    input.workspaceRoot ??= repoRoot;
    input.targetPath = firstNonBlankString(input.targetPath, args.path, args.file, inferPathFromUserText(userText)) ?? input.targetPath;
    input.languageHint ??= args.languageId ?? args.language;
  }

  if (tool === "code.testCode") {
    input.workspaceRoot = firstNonBlankString(input.workspaceRoot, args.cwd, args.workspaceRoot) ?? architectureRoot;
    const rawTestTarget = firstNonBlankString(input.testTarget, args.target, args.path, args.file, inferPathFromUserText(userText)) ?? input.testTarget ?? ".";
    input.testTarget = relativeToWorkspaceCommandPath(String(rawTestTarget), String(input.workspaceRoot));
    input.testFramework ??= args.framework ?? "node:test";
    if (!Array.isArray(input.command)) {
      input.command = ["node", "--import", "tsx", "--test", String(input.testTarget)];
    }
    input.context = {
      ...toolLabGovernedContext(args),
      requestedScopes: ["workspace:read", "process:spawn"],
      allowedScopes: ["workspace:read", "process:spawn"],
    };
  }

  if (tool === "code.benchmark") {
    input.workspaceRoot = firstNonBlankString(input.workspaceRoot, args.cwd, args.workspaceRoot) ?? architectureRoot;
    input.benchmarkTarget = firstNonBlankString(input.benchmarkTarget, args.target, args.path, args.file, inferPathFromUserText(userText)) ?? input.benchmarkTarget ?? "tool-lab-benchmark";
    input.iterations ??= args.iterations ?? 1;
    input.warmup ??= args.warmup ?? 0;
    if (!Array.isArray(input.command)) {
      input.command = ["node", "-e", "const start=Date.now(); while(Date.now()-start<1){}; console.log('benchmark-ok')"];
    }
    input.context = {
      ...toolLabGovernedContext(args),
      requestedScopes: ["workspace:read", "process:spawn"],
      allowedScopes: ["workspace:read", "process:spawn"],
    };
  }

  if (tool === "code.debugCollectLogs") {
    input.sources = Array.isArray(input.sources) && input.sources.length > 0 ? input.sources : [{ kind: "debug-console", id: activeAgent.sessionId }];
    input.maxEntries ??= args.limit ?? 20;
    input.context = {
      ...toolLabGovernedContext(args),
      requestedScopes: ["debug:read", "logs:read"],
      allowedScopes: ["debug:read", "logs:read"],
    };
  }

  if (tool === "code.debugCaptureState") {
    input.target = isRecord(input.target) ? input.target : { kind: "debug-session", id: activeAgent.sessionId };
    input.capture = isRecord(input.capture) ? input.capture : { includeStack: true, includeVariables: true, includeBreakpoints: true, maxVariables: 20 };
    input.context = {
      ...toolLabGovernedContext(args),
      requestedScopes: ["debug:read"],
      allowedScopes: ["debug:read"],
    };
  }

  if (tool === "code.debugRun") {
    const existingTarget = isRecord(input.target) ? input.target : {};
    const inferredLabel = firstNonBlankString(existingTarget.label, args.label, args.target, inferPathFromUserText(userText)) ?? "tool-lab-debug";
    input.target = {
      ...existingTarget,
      kind: firstNonBlankString(existingTarget.kind, args.kind) ?? "test",
      label: inferredLabel,
      command: Array.isArray(existingTarget.command) ? existingTarget.command : Array.isArray(args.command) ? args.command : ["node", "-e", "console.log('debug-ready')"],
      cwd: firstNonBlankString(existingTarget.cwd, args.cwd) ?? architectureRoot,
    };
    input.context = {
      ...toolLabGovernedContext(args),
      requestedScopes: ["debug:read", "debug:run"],
      allowedScopes: ["debug:read", "debug:run"],
    };
  }

  if (isLspTool) {
    const explicitTarget = isRecord(input.target) ? input.target : {};
    const targetPath = firstNonBlankString(
      explicitTarget.filePath,
      input.documentUri,
      input.targetPath,
      args.path,
      args.file,
      inferPathFromUserText(userText),
    );
    const inferredPosition = inferLspPositionFromUserText(userText);
    const position = isRecord(input.position) ? input.position : {};
    const rawLine = inferredPosition?.line ?? (typeof explicitTarget.line === "number" ? explicitTarget.line : typeof position.line === "number" ? position.line : 0);
    const rawCharacter =
      inferredPosition?.character ??
      (typeof explicitTarget.character === "number"
        ? explicitTarget.character
        : typeof position.character === "number"
          ? position.character
          : 0);
    const symbolName = inferLspQueryFromUserText(userText);
    const inferredFilePosition = inferLspPositionFromFile(targetPath, { line: rawLine, character: rawCharacter }, symbolName);
    const line = inferredFilePosition.line;
    const character = inferredFilePosition.character;
    const languageId = firstNonBlankString(explicitTarget.languageId, input.languageId, args.languageId, args.language);

    input.dryRun = false;
    input.workspaceRoot ??= architectureRoot;
    input.runtime = isRecord(input.runtime) ? { ...input.runtime, workspaceRoot: firstNonBlankString(input.runtime.workspaceRoot, input.workspaceRoot) ?? architectureRoot } : { workspaceRoot: architectureRoot };
    input.context = {
      ...toolLabGovernedContext(args),
      workspaceRoot: firstNonBlankString(input.workspaceRoot, isRecord(input.context) ? input.context.workspaceRoot : undefined) ?? architectureRoot,
      requestedScopes: ["workspace:read", "lsp:read"],
      allowedScopes: ["workspace:read", "lsp:read"],
    };

    if (targetPath !== undefined) {
      input.documentUri ??= resolveAnyPath(targetPath);
      input.target = {
        ...explicitTarget,
        filePath: targetPath,
        languageId,
        ...(tool === "code.lsp_scanDocumentSymbols" || tool === "code.lsp_searchWorkspaceSymbols" || tool === "code.lsp_formatDocument" || tool === "code.lsp_inspectDiagnostics"
          ? {}
          : { line, character }),
      };
    }

    if (tool !== "code.lsp_scanDocumentSymbols" && tool !== "code.lsp_searchWorkspaceSymbols" && tool !== "code.lsp_formatDocument" && tool !== "code.lsp_inspectDiagnostics") {
      input.position ??= { line, character };
    }

    if (
      (tool === "code.lsp_formatRange" || tool === "code.lsp_suggestCodeActions" || tool === "code.lsp_applyCodeAction") &&
      !isRecord(input.range)
    ) {
      input.range = { start: { line, character: 0 }, end: { line, character: Number.MAX_SAFE_INTEGER } };
      input.target = isRecord(input.target) ? { ...input.target, range: input.range } : input.target;
    }

    if (tool === "code.lsp_searchWorkspaceSymbols") {
      input.query = firstNonBlankString(input.query, args.symbol, args.name, symbolName) ?? "";
      input.limit ??= args.limit ?? 50;
    }

    if (tool === "code.lsp_renameSymbol") {
      input.newName = firstNonBlankString(input.newName, args.replacement, args.newText, args.newName) ?? "RenamedSymbol";
    }
  }

  return input;
}

function mountedCodeBaseFailureHint(
  mountedTool: MountedCodeBaseTool,
  input: Record<string, unknown>,
): string | undefined {
  const target =
    mountedTool === "code.read" || mountedTool === "code.replaceFile" || mountedTool === "code.overwrite" || mountedTool === "code.modify" || mountedTool === "code.delete" || mountedTool === "code.format"
      ? input.targetPath
      : mountedLspTools.has(mountedTool)
        ? isRecord(input.target)
          ? input.target.filePath
          : input.documentUri
        : input.directoryPath;
  if (typeof target !== "string" || target.trim().length === 0) {
    return undefined;
  }

  const absoluteTarget = resolveAnyPath(target);
  if (!existsSync(absoluteTarget)) {
    return `${mountedTool} target does not exist: ${target}. Use code.scan or code.search_Ripgrep to find the correct path; do not switch to shell.`;
  }
  return undefined;
}

type MountedSearchBaseTool = "search.fetch" | "search.ground" | "search.nativeSearch" | "search.searchEngine";

type MountedGitBaseTool =
  | "git.getRepositoryStatus"
  | "git.getWorkingTreeDiff"
  | "git.getCommitHistory"
  | "git.showGitObjectDetails"
  | "git.traceLineOwnership"
  | "git.checkoutTarget"
  | "git.manageBranch"
  | "git.manageTag"
  | "git.mergeBranch"
  | "git.rebaseBranch"
  | "git.switchBranch"
  | "git.manageIgnoreRules"
  | "git.moveOrRenameFile"
  | "git.removeTrackedFile"
  | "git.addToStaging"
  | "git.resetStagingOrCommit"
  | "git.restoreWorkingTree"
  | "git.stashChanges"
  | "git.applyStashChanges"
  | "git.popStashChanges"
  | "git.cleanUntrackedFiles"
  | "git.amendLastCommit"
  | "git.cherryPickCommit"
  | "git.revertCommit"
  | "git.createCommit"
  | "git.initializeRepository"
  | "git.cloneRepository"
  | "git.archiveRepository"
  | "git.locateProblemCommit"
  | "git.manageSubmodule"
  | "git.manageWorktree"
  | "git.fetchRemoteUpdates"
  | "git.pullRemoteChanges"
  | "git.pushLocalChanges"
  | "git.manageRemote";

function normalizeMountedGitBaseTool(tool: string): MountedGitBaseTool | undefined {
  const normalized = tool.trim();
  if (
    normalized === "git.getRepositoryStatus" ||
    normalized === "git.getWorkingTreeDiff" ||
    normalized === "git.getCommitHistory" ||
    normalized === "git.showGitObjectDetails" ||
    normalized === "git.traceLineOwnership" ||
    normalized === "git.checkoutTarget" ||
    normalized === "git.manageBranch" ||
    normalized === "git.manageTag" ||
    normalized === "git.mergeBranch" ||
    normalized === "git.rebaseBranch" ||
    normalized === "git.switchBranch" ||
    normalized === "git.manageIgnoreRules" ||
    normalized === "git.moveOrRenameFile" ||
    normalized === "git.removeTrackedFile" ||
    normalized === "git.addToStaging" ||
    normalized === "git.resetStagingOrCommit" ||
    normalized === "git.restoreWorkingTree" ||
    normalized === "git.stashChanges" ||
    normalized === "git.applyStashChanges" ||
    normalized === "git.popStashChanges" ||
    normalized === "git.cleanUntrackedFiles" ||
    normalized === "git.amendLastCommit" ||
    normalized === "git.cherryPickCommit" ||
    normalized === "git.revertCommit" ||
    normalized === "git.createCommit" ||
    normalized === "git.initializeRepository" ||
    normalized === "git.cloneRepository" ||
    normalized === "git.archiveRepository" ||
    normalized === "git.locateProblemCommit" ||
    normalized === "git.manageSubmodule" ||
    normalized === "git.manageWorktree" ||
    normalized === "git.fetchRemoteUpdates" ||
    normalized === "git.pullRemoteChanges" ||
    normalized === "git.pushLocalChanges" ||
    normalized === "git.manageRemote"
  ) {
    return normalized;
  }
  return undefined;
}

function toolLabGitGovernedContext(
  args: Record<string, unknown>,
  _repositoryPath: string,
  defaultPermissions: readonly string[] = ["git:read", "filesystem:read"],
  trustedAllowedRepositoryRoots?: readonly string[],
): Record<string, unknown> {
  const inputContext = isRecord(args.context) ? args.context : {};
  const allowedRepositoryRoots =
    trustedAllowedRepositoryRoots === undefined ? [architectureRoot, repoRoot] : [...trustedAllowedRepositoryRoots];
  return {
    ...inputContext,
    dryRun: false,
    guard: { ...(isRecord(inputContext.guard) ? inputContext.guard : {}), allowed: true, accepted: true },
    allowedRepositoryRoots,
    grantedPermissions: normalizeSearchStringArray(inputContext.grantedPermissions) ?? [...defaultPermissions],
    auditMetadata: {
      ...(isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : {}),
      labRunId: runId,
      activeAgentId: activeAgent.id,
      surface: "agentcore_tool_lab",
      runtimeEntry: "BaseToolExecutorPort.git.runGit",
    },
  };
}

function normalizeMountedGitBaseInput(
  tool: MountedGitBaseTool,
  args: Record<string, unknown>,
  _userText?: string,
  trustedAllowedRepositoryRoots?: readonly string[],
): Record<string, unknown> {
  if (tool === "git.getRepositoryStatus") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.porcelainVersion = explicitTarget.porcelainVersion === "v2" ? "v2" : "v1";
    explicitTarget.includeBranch = explicitTarget.includeBranch === false ? false : true;
    explicitTarget.includeUntracked = explicitTarget.includeUntracked === false ? false : true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.getWorkingTreeDiff") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.mode =
      explicitTarget.mode === "staged" || explicitTarget.mode === "combined" || explicitTarget.mode === "unstaged"
        ? explicitTarget.mode
        : "unstaged";
    if (explicitTarget.pathspecs === undefined && args.pathspecs !== undefined) {
      explicitTarget.pathspecs = args.pathspecs;
    }
    if (explicitTarget.contextLines === undefined && typeof args.contextLines === "number") {
      explicitTarget.contextLines = args.contextLines;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.getCommitHistory") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.maxCount =
      typeof explicitTarget.maxCount === "number"
        ? explicitTarget.maxCount
        : typeof args.limit === "number"
          ? args.limit
          : typeof args.maxCount === "number"
            ? args.maxCount
            : 12;
    if (explicitTarget.ref === undefined && typeof args.ref === "string") {
      explicitTarget.ref = args.ref;
    }
    if (explicitTarget.pathFilter === undefined && typeof args.pathFilter === "string") {
      explicitTarget.pathFilter = args.pathFilter;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.showGitObjectDetails") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.objectRef = firstNonBlankString(explicitTarget.objectRef, args.objectRef, args.ref, args.revision) ?? "HEAD";
    explicitTarget.format =
      explicitTarget.format === "raw" || explicitTarget.format === "patch" || explicitTarget.format === "summary"
        ? explicitTarget.format
        : args.format === "raw" || args.format === "patch" || args.format === "summary"
          ? args.format
          : "summary";
    if (explicitTarget.maxBytes === undefined && typeof args.maxBytes === "number") {
      explicitTarget.maxBytes = args.maxBytes;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.traceLineOwnership") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.filePath = firstNonBlankString(explicitTarget.filePath, args.filePath, args.path, args.targetPath) ?? "README.md";
    if (!isRecord(explicitTarget.range)) {
      const startLine = typeof args.startLine === "number" ? args.startLine : 1;
      const endLine = typeof args.endLine === "number" ? args.endLine : startLine;
      explicitTarget.range = { startLine, endLine };
    }
    if (explicitTarget.revision === undefined && typeof args.revision === "string") {
      explicitTarget.revision = args.revision;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.switchBranch") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.branchName =
      firstNonBlankString(explicitTarget.branchName, explicitTarget.branch, explicitTarget.ref, args.branchName, args.branch, args.ref) ??
      "main";
    if (explicitTarget.startPoint === undefined) {
      explicitTarget.startPoint = firstNonBlankString(args.startPoint, args.fromRef, args.baseRef);
    }
    explicitTarget.create = explicitTarget.create === true || args.create === true;
    explicitTarget.track = explicitTarget.track === true || args.track === true;
    explicitTarget.discardChanges = explicitTarget.discardChanges === true || args.discardChanges === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.checkoutTarget") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.targetRef =
      firstNonBlankString(explicitTarget.targetRef, explicitTarget.ref, explicitTarget.revision, args.targetRef, args.ref, args.revision) ??
      "HEAD";
    explicitTarget.newBranchName = firstNonBlankString(explicitTarget.newBranchName, args.newBranchName, args.branchName, args.branch);
    explicitTarget.detach = explicitTarget.detach === true || args.detach === true;
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageTag") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "create" ||
      explicitTarget.action === "annotate" ||
      explicitTarget.action === "delete" ||
      explicitTarget.action === "list"
        ? explicitTarget.action
        : args.action === "create" || args.action === "annotate" || args.action === "delete" || args.action === "list"
          ? args.action
          : "list";
    explicitTarget.tagName = firstNonBlankString(explicitTarget.tagName, explicitTarget.tag, explicitTarget.name, args.tagName, args.tag, args.name);
    explicitTarget.targetRef = firstNonBlankString(explicitTarget.targetRef, explicitTarget.ref, explicitTarget.revision, args.targetRef, args.ref, args.revision);
    explicitTarget.message = firstNonBlankString(explicitTarget.message, args.message, args.annotation);
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    const permissions =
      explicitTarget.action === "list"
        ? ["git:read", "filesystem:read"]
        : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, permissions, trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageBranch") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "create" ||
      explicitTarget.action === "delete" ||
      explicitTarget.action === "rename" ||
      explicitTarget.action === "set-upstream" ||
      explicitTarget.action === "list"
        ? explicitTarget.action
        : args.action === "create" ||
            args.action === "delete" ||
            args.action === "rename" ||
            args.action === "set-upstream" ||
            args.action === "list"
          ? args.action
          : "list";
    explicitTarget.branchName = firstNonBlankString(
      explicitTarget.branchName,
      explicitTarget.branch,
      explicitTarget.name,
      args.branchName,
      args.branch,
      args.name,
    );
    explicitTarget.newBranchName = firstNonBlankString(
      explicitTarget.newBranchName,
      explicitTarget.newBranch,
      args.newBranchName,
      args.newBranch,
      args.newName,
    );
    explicitTarget.startPoint = firstNonBlankString(explicitTarget.startPoint, explicitTarget.ref, args.startPoint, args.ref, args.revision);
    explicitTarget.upstream = firstNonBlankString(explicitTarget.upstream, args.upstream, args.upstreamRef);
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    const permissions =
      explicitTarget.action === "list"
        ? ["git:read", "filesystem:read"]
        : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, permissions, trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.mergeBranch") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.sourceBranch =
      firstNonBlankString(explicitTarget.sourceBranch, explicitTarget.branchName, explicitTarget.ref, args.sourceBranch, args.branchName, args.branch, args.ref) ??
      "main";
    explicitTarget.mode =
      explicitTarget.mode === "ff-only" || explicitTarget.mode === "no-ff" || explicitTarget.mode === "squash" || explicitTarget.mode === "default"
        ? explicitTarget.mode
        : args.mode === "ff-only" || args.mode === "no-ff" || args.mode === "squash" || args.mode === "default"
          ? args.mode
          : "default";
    explicitTarget.commitMessage = firstNonBlankString(explicitTarget.commitMessage, args.commitMessage, args.message);
    explicitTarget.noCommit = explicitTarget.noCommit === true || args.noCommit === true;
    explicitTarget.allowUnrelatedHistories = explicitTarget.allowUnrelatedHistories === true || args.allowUnrelatedHistories === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.rebaseBranch") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.upstreamRef =
      firstNonBlankString(explicitTarget.upstreamRef, explicitTarget.upstream, explicitTarget.ref, args.upstreamRef, args.upstream, args.ref) ??
      "main";
    explicitTarget.branchName = firstNonBlankString(explicitTarget.branchName, explicitTarget.branch, args.branchName, args.branch);
    explicitTarget.ontoRef = firstNonBlankString(explicitTarget.ontoRef, explicitTarget.onto, args.ontoRef, args.onto);
    explicitTarget.keepBase = explicitTarget.keepBase === true || args.keepBase === true;
    explicitTarget.autosquash = explicitTarget.autosquash === true || args.autosquash === true;
    explicitTarget.interactive = explicitTarget.interactive === true || args.interactive === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.removeTrackedFile") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.filePath = firstNonBlankString(explicitTarget.filePath, args.filePath, args.path, args.targetPath) ?? "README.md";
    explicitTarget.keepWorkingTree = explicitTarget.keepWorkingTree === true || args.keepWorkingTree === true || args.cached === true;
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.moveOrRenameFile") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.sourcePath = firstNonBlankString(explicitTarget.sourcePath, args.sourcePath, args.fromPath, args.path, args.filePath) ?? "README.md";
    explicitTarget.destinationPath =
      firstNonBlankString(explicitTarget.destinationPath, args.destinationPath, args.toPath, args.newPath, args.targetPath) ?? "README.moved.md";
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageIgnoreRules") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "add" || explicitTarget.action === "remove" || explicitTarget.action === "replace" || explicitTarget.action === "inspect"
        ? explicitTarget.action
        : args.action === "add" || args.action === "remove" || args.action === "replace" || args.action === "inspect"
          ? args.action
          : "inspect";
    explicitTarget.ignoreFilePath = firstNonBlankString(explicitTarget.ignoreFilePath, args.ignoreFilePath, args.path, args.filePath) ?? ".gitignore";
    if (explicitTarget.rules === undefined) {
      explicitTarget.rules = normalizeSearchStringArray(args.rules) ?? normalizeSearchStringArray(args.patterns) ?? [];
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.addToStaging") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    if (explicitTarget.pathspecs === undefined) {
      const pathspecs = normalizeSearchStringArray(args.pathspecs);
      const singlePath = firstNonBlankString(args.pathspec, args.path, args.filePath, args.targetPath);
      explicitTarget.pathspecs = pathspecs ?? (singlePath === undefined ? undefined : [singlePath]);
    }
    explicitTarget.all = explicitTarget.all === true || args.all === true;
    explicitTarget.update = explicitTarget.update === true || args.update === true;
    explicitTarget.intentToAdd = explicitTarget.intentToAdd === true || args.intentToAdd === true;
    explicitTarget.patch = explicitTarget.patch === true || args.patch === true;
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.restoreWorkingTree") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    if (explicitTarget.paths === undefined) {
      const paths = normalizeSearchStringArray(args.paths) ?? normalizeSearchStringArray(args.pathspecs);
      const singlePath = firstNonBlankString(args.path, args.filePath, args.targetPath, args.pathspec);
      explicitTarget.paths = paths ?? (singlePath === undefined ? undefined : [singlePath]);
    }
    if (explicitTarget.sourceRef === undefined && typeof args.sourceRef === "string") {
      explicitTarget.sourceRef = args.sourceRef;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.resetStagingOrCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action = explicitTarget.action === "commit" || args.action === "commit" ? "commit" : "staging";
    if (explicitTarget.pathspecs === undefined) {
      const pathspecs = normalizeSearchStringArray(args.pathspecs) ?? normalizeSearchStringArray(args.paths);
      const singlePath = firstNonBlankString(args.pathspec, args.path, args.filePath, args.targetPath);
      explicitTarget.pathspecs = pathspecs ?? (singlePath === undefined ? undefined : [singlePath]);
    }
    if (explicitTarget.targetRef === undefined) {
      explicitTarget.targetRef = firstNonBlankString(args.targetRef, args.ref, args.revision);
    }
    if (
      explicitTarget.mode === undefined &&
      (args.mode === "soft" || args.mode === "mixed" || args.mode === "hard" || args.mode === "merge" || args.mode === "keep")
    ) {
      explicitTarget.mode = args.mode;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.stashChanges") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    if (explicitTarget.pathspecs === undefined) {
      const pathspecs = normalizeSearchStringArray(args.pathspecs) ?? normalizeSearchStringArray(args.paths);
      const singlePath = firstNonBlankString(args.pathspec, args.path, args.filePath, args.targetPath);
      explicitTarget.pathspecs = pathspecs ?? (singlePath === undefined ? undefined : [singlePath]);
    }
    if (explicitTarget.message === undefined) {
      explicitTarget.message = firstNonBlankString(args.message, args.stashMessage, args.summary);
    }
    explicitTarget.includeUntracked = explicitTarget.includeUntracked === true || args.includeUntracked === true;
    explicitTarget.keepIndex = explicitTarget.keepIndex === true || args.keepIndex === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.applyStashChanges") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.stashRef = firstNonBlankString(explicitTarget.stashRef, args.stashRef, args.ref, args.revision) ?? "stash@{0}";
    explicitTarget.reinstateIndex = explicitTarget.reinstateIndex === true || args.reinstateIndex === true || args.index === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.popStashChanges") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.stashRef = firstNonBlankString(explicitTarget.stashRef, args.stashRef, args.ref, args.revision) ?? "stash@{0}";
    explicitTarget.reinstateIndex = explicitTarget.reinstateIndex === true || args.reinstateIndex === true || args.index === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.cleanUntrackedFiles") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    if (explicitTarget.paths === undefined) {
      const paths = normalizeSearchStringArray(args.paths) ?? normalizeSearchStringArray(args.pathspecs);
      const singlePath = firstNonBlankString(args.path, args.filePath, args.targetPath, args.pathspec);
      explicitTarget.paths = paths ?? (singlePath === undefined ? undefined : [singlePath]);
    }
    explicitTarget.includeDirectories = explicitTarget.includeDirectories === false || args.includeDirectories === false ? false : true;
    explicitTarget.ignoredMode =
      explicitTarget.ignoredMode === "tracked-ignored" ||
      explicitTarget.ignoredMode === "ignored-only" ||
      explicitTarget.ignoredMode === "none"
        ? explicitTarget.ignoredMode
        : args.ignoredMode === "tracked-ignored" || args.ignoredMode === "ignored-only" || args.ignoredMode === "none"
          ? args.ignoredMode
          : "none";
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.createCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.commitMessage =
      firstNonBlankString(explicitTarget.commitMessage, explicitTarget.message, args.commitMessage, args.message) ?? "tool lab commit";
    explicitTarget.includeAllTracked =
      explicitTarget.includeAllTracked === true || explicitTarget.all === true || args.includeAllTracked === true || args.all === true;
    explicitTarget.allowEmpty = explicitTarget.allowEmpty === true || args.allowEmpty === true;
    explicitTarget.signoff = explicitTarget.signoff === true || args.signoff === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.amendLastCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.commitMessage = firstNonBlankString(
      explicitTarget.commitMessage,
      explicitTarget.message,
      args.commitMessage,
      args.message,
      args.newMessage,
    );
    explicitTarget.noEdit =
      explicitTarget.noEdit === true || args.noEdit === true || explicitTarget.commitMessage === undefined;
    explicitTarget.includeAllTracked =
      explicitTarget.includeAllTracked === true || explicitTarget.all === true || args.includeAllTracked === true || args.all === true;
    explicitTarget.resetAuthor = explicitTarget.resetAuthor === true || args.resetAuthor === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.cherryPickCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.commitRef = firstNonBlankString(explicitTarget.commitRef, explicitTarget.ref, explicitTarget.revision, args.commitRef, args.ref, args.revision) ?? "HEAD";
    explicitTarget.noCommit = explicitTarget.noCommit === true || args.noCommit === true;
    explicitTarget.signoff = explicitTarget.signoff === true || args.signoff === true;
    if (explicitTarget.mainlineParent === undefined && typeof args.mainlineParent === "number") {
      explicitTarget.mainlineParent = args.mainlineParent;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.revertCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.commitRef = firstNonBlankString(explicitTarget.commitRef, explicitTarget.ref, explicitTarget.revision, args.commitRef, args.ref, args.revision) ?? "HEAD";
    explicitTarget.noCommit = explicitTarget.noCommit === true || args.noCommit === true;
    if (explicitTarget.mainlineParent === undefined && typeof args.mainlineParent === "number") {
      explicitTarget.mainlineParent = args.mainlineParent;
    }
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.initializeRepository") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.initialBranch = firstNonBlankString(explicitTarget.initialBranch, args.initialBranch, args.branch);
    explicitTarget.bare = explicitTarget.bare === true || args.bare === true;
    explicitTarget.separateGitDir = firstNonBlankString(explicitTarget.separateGitDir, args.separateGitDir);
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:write",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.cloneRepository") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const destinationPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.destinationPath, args.destinationPath, args.path, args.targetPath),
      path.join(architectureRoot, "tool-lab-clone"),
    );
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      path.dirname(destinationPath),
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.remoteUrl = firstNonBlankString(explicitTarget.remoteUrl, explicitTarget.url, args.remoteUrl, args.url) ?? architectureRoot;
    explicitTarget.destinationPath = destinationPath;
    explicitTarget.branch = firstNonBlankString(explicitTarget.branch, args.branch);
    if (explicitTarget.depth === undefined && typeof args.depth === "number") {
      explicitTarget.depth = args.depth;
    }
    explicitTarget.singleBranch = explicitTarget.singleBranch === true || args.singleBranch === true;
    explicitTarget.bare = explicitTarget.bare === true || args.bare === true;
    explicitTarget.mirror = explicitTarget.mirror === true || args.mirror === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.archiveRepository") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.outputPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.outputPath, args.outputPath, args.path, args.targetPath),
      path.join(repositoryPath, "tool-lab-archive.tar"),
    );
    explicitTarget.ref = firstNonBlankString(explicitTarget.ref, args.ref, args.revision) ?? "HEAD";
    explicitTarget.format = explicitTarget.format === "zip" || args.format === "zip" ? "zip" : "tar";
    explicitTarget.pathspecs = normalizeSearchStringArray(explicitTarget.pathspecs) ?? normalizeSearchStringArray(args.pathspecs) ?? [];
    explicitTarget.prefix = firstNonBlankString(explicitTarget.prefix, args.prefix);
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "filesystem:write",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageWorktree") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "add" ||
      explicitTarget.action === "remove" ||
      explicitTarget.action === "prune" ||
      explicitTarget.action === "list"
        ? explicitTarget.action
        : args.action === "add" || args.action === "remove" || args.action === "prune" || args.action === "list"
          ? args.action
          : "list";
    if (explicitTarget.worktreePath === undefined) {
      const worktreePath = firstNonBlankString(args.worktreePath, args.targetPath, args.path);
      if (worktreePath !== undefined) explicitTarget.worktreePath = resolveAnyPath(worktreePath, architectureRoot);
    }
    explicitTarget.targetRef = firstNonBlankString(explicitTarget.targetRef, explicitTarget.ref, args.targetRef, args.ref, args.revision);
    explicitTarget.branchName = firstNonBlankString(explicitTarget.branchName, explicitTarget.branch, args.branchName, args.branch);
    explicitTarget.detach = explicitTarget.detach === true || args.detach === true;
    explicitTarget.force = explicitTarget.force === true || args.force === true;
    const mutation = explicitTarget.action !== "list";
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, mutation
        ? ["git:read", "git:write", "filesystem:read", "filesystem:write"]
        : ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageSubmodule") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "add" ||
      explicitTarget.action === "update" ||
      explicitTarget.action === "sync" ||
      explicitTarget.action === "deinit" ||
      explicitTarget.action === "status"
        ? explicitTarget.action
        : args.action === "add" || args.action === "update" || args.action === "sync" || args.action === "deinit" || args.action === "status"
          ? args.action
          : "status";
    explicitTarget.submodulePath = firstNonBlankString(explicitTarget.submodulePath, explicitTarget.path, args.submodulePath, args.path);
    explicitTarget.remoteUrl = firstNonBlankString(explicitTarget.remoteUrl, explicitTarget.url, args.remoteUrl, args.url);
    explicitTarget.branch = firstNonBlankString(explicitTarget.branch, args.branch, args.branchName);
    explicitTarget.recursive = explicitTarget.recursive === false || args.recursive === false ? false : true;
    const mutation = explicitTarget.action !== "status";
    const network = explicitTarget.action === "add" || explicitTarget.action === "update";
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, mutation
        ? [
            "git:read",
            "git:write",
            "filesystem:read",
            "filesystem:write",
            ...(network ? ["network:egress"] : []),
          ]
        : ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.locateProblemCommit") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.knownGoodRef =
      firstNonBlankString(explicitTarget.knownGoodRef, explicitTarget.goodRef, args.knownGoodRef, args.goodRef, args.baseRef) ?? "HEAD~1";
    explicitTarget.knownBadRef =
      firstNonBlankString(explicitTarget.knownBadRef, explicitTarget.badRef, args.knownBadRef, args.badRef, args.headRef) ?? "HEAD";
    explicitTarget.verificationCommand = firstNonBlankString(explicitTarget.verificationCommand, args.verificationCommand, args.command);
    explicitTarget.maxSteps = typeof explicitTarget.maxSteps === "number"
      ? explicitTarget.maxSteps
      : typeof args.maxSteps === "number"
        ? args.maxSteps
        : 64;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.manageRemote") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.action =
      explicitTarget.action === "show" ||
      explicitTarget.action === "add" ||
      explicitTarget.action === "remove" ||
      explicitTarget.action === "rename" ||
      explicitTarget.action === "set-url" ||
      explicitTarget.action === "list"
        ? explicitTarget.action
        : args.action === "show" ||
            args.action === "add" ||
            args.action === "remove" ||
            args.action === "rename" ||
            args.action === "set-url" ||
            args.action === "list"
          ? args.action
          : "list";
    explicitTarget.remoteName = firstNonBlankString(explicitTarget.remoteName, args.remoteName, args.remote) ?? explicitTarget.remoteName;
    explicitTarget.newRemoteName = firstNonBlankString(explicitTarget.newRemoteName, args.newRemoteName, args.newRemote);
    explicitTarget.remoteUrl = firstNonBlankString(explicitTarget.remoteUrl, args.remoteUrl, args.url);
    explicitTarget.urlMode = explicitTarget.urlMode === "push" || args.urlMode === "push" ? "push" : "fetch";
    const mutation = explicitTarget.action !== "list" && explicitTarget.action !== "show";
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, mutation
        ? ["git:read", "git:write", "filesystem:read", "filesystem:write"]
        : ["git:read", "filesystem:read"], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.fetchRemoteUpdates") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.remoteName = firstNonBlankString(explicitTarget.remoteName, explicitTarget.remote, args.remoteName, args.remote);
    const refspecs = normalizeSearchStringArray(explicitTarget.refspecs) ?? normalizeSearchStringArray(args.refspecs);
    if (refspecs !== undefined) explicitTarget.refspecs = refspecs;
    explicitTarget.prune = explicitTarget.prune === true || args.prune === true;
    explicitTarget.tagsMode =
      explicitTarget.tagsMode === "tags" ||
      explicitTarget.tagsMode === "no-tags" ||
      explicitTarget.tagsMode === "default"
        ? explicitTarget.tagsMode
        : args.tagsMode === "tags" || args.tagsMode === "no-tags" || args.tagsMode === "default"
          ? args.tagsMode
          : "default";
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:write",
        "network:egress",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.pullRemoteChanges") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.remoteName = firstNonBlankString(explicitTarget.remoteName, explicitTarget.remote, args.remoteName, args.remote);
    explicitTarget.branchName = firstNonBlankString(explicitTarget.branchName, explicitTarget.branch, args.branchName, args.branch);
    explicitTarget.integrationMode =
      explicitTarget.integrationMode === "rebase" ||
      explicitTarget.integrationMode === "ff-only" ||
      explicitTarget.integrationMode === "merge"
        ? explicitTarget.integrationMode
        : args.integrationMode === "rebase" || args.integrationMode === "ff-only" || args.integrationMode === "merge"
          ? args.integrationMode
          : "merge";
    explicitTarget.autostash = explicitTarget.autostash === true || args.autostash === true;
    explicitTarget.prune = explicitTarget.prune === true || args.prune === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:write",
        "network:egress",
      ], trustedAllowedRepositoryRoots),
    };
  }

  if (tool === "git.pushLocalChanges") {
    const explicitTarget = isRecord(args.target) ? { ...args.target } : {};
    const repositoryPath = resolveAnyPath(
      firstNonBlankString(explicitTarget.repositoryPath, args.repositoryPath, args.cwd, args.workspaceRoot),
      architectureRoot,
    );
    explicitTarget.repositoryPath = repositoryPath;
    explicitTarget.remoteName = firstNonBlankString(explicitTarget.remoteName, explicitTarget.remote, args.remoteName, args.remote) ?? "origin";
    explicitTarget.branchName = firstNonBlankString(explicitTarget.branchName, explicitTarget.branch, args.branchName, args.branch);
    explicitTarget.setUpstream = explicitTarget.setUpstream === true || args.setUpstream === true;
    explicitTarget.forceWithLease = explicitTarget.forceWithLease === true || args.forceWithLease === true;
    explicitTarget.pushTags = explicitTarget.pushTags === true || args.pushTags === true;
    explicitTarget.deleteRemoteBranch = explicitTarget.deleteRemoteBranch === true || args.deleteRemoteBranch === true;
    return {
      ...args,
      target: explicitTarget,
      context: toolLabGitGovernedContext(args, repositoryPath, [
        "git:read",
        "git:write",
        "filesystem:read",
        "network:egress",
      ], trustedAllowedRepositoryRoots),
    };
  }

  return { ...args };
}

function normalizeMountedSearchBaseTool(tool: string): MountedSearchBaseTool | undefined {
  const normalized = tool.trim();
  if (normalized === "search.fetch") return "search.fetch";
  if (normalized === "search.ground") return "search.ground";
  if (normalized === "search.nativeSearch" || normalized === "search.web") {
    return "search.nativeSearch";
  }
  if (normalized === "search.searchEngine") return "search.searchEngine";
  return undefined;
}

function toolLabSearchRuntimeEntry(tool: MountedSearchBaseTool): string {
  if (tool === "search.fetch") return "BaseToolExecutorPort.network.fetch";
  if (tool === "search.searchEngine") return "BaseToolExecutorPort.network.search";
  if (tool === "search.ground") return "BaseToolExecutorPort.network.ground";
  return "BaseToolExecutorPort.network.nativeWebSearch";
}

function normalizeNativeSearchProvider(value: unknown): "openai" | "anthropic" | "deepmind" {
  return value === "anthropic" || value === "deepmind" || value === "openai" ? value : "openai";
}

function normalizeSearchStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function toolLabSearchGovernedContext(tool: MountedSearchBaseTool, args: Record<string, unknown>): Record<string, unknown> {
  const inputContext = isRecord(args.context) ? args.context : {};
  const provider = isRecord(args.target) ? args.target.provider : args.provider;
  const explicitGuard = isRecord(inputContext.guard) ? inputContext.guard : undefined;
  const explicitGrantedPermissions = normalizeSearchStringArray(inputContext.grantedPermissions);
  const explicitAllowedProviders = normalizeSearchStringArray(inputContext.allowedProviders);
  const allowedProviders =
    explicitAllowedProviders ??
    (tool === "search.nativeSearch"
      ? ["openai", "anthropic", "deepmind"]
      : tool === "search.searchEngine"
        ? ["generic", "browser", "custom"]
        : tool === "search.ground"
          ? ["openai", "anthropic", "deepmind", "generic"]
          : undefined);
  return {
    ...inputContext,
    dryRun: false,
    ...(explicitGuard !== undefined ? { guard: explicitGuard } : {}),
    ...(allowedProviders !== undefined ? { allowedProviders } : {}),
    ...(explicitGrantedPermissions !== undefined ? { grantedPermissions: explicitGrantedPermissions } : {}),
    auditMetadata: {
      ...(isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : {}),
      labRunId: runId,
      activeAgentId: activeAgent.id,
      surface: "agentcore_tool_lab",
      requestedProvider: provider,
    },
  };
}

function normalizeMountedSearchBaseInput(
  tool: MountedSearchBaseTool,
  args: Record<string, unknown>,
  userText?: string,
): Record<string, unknown> {
  const inputContext = toolLabSearchGovernedContext(tool, args);
  if (tool === "search.fetch") {
    const target = isRecord(args.target) ? { ...args.target } : {};
    target.url = firstNonBlankString(target.url, args.url, args.href) ?? "";
    target.method ??= args.method;
    target.expectedContentType ??= args.expectedContentType ?? args.contentType;
    target.maxBytes ??= args.maxBytes;
    target.timeoutMs ??= args.timeoutMs;
    return { ...args, target, context: inputContext };
  }

  if (tool === "search.searchEngine") {
    const target = isRecord(args.target) ? { ...args.target } : {};
    target.query = firstNonBlankString(target.query, args.query, args.q, userText) ?? "";
    target.provider ??= args.provider ?? "generic";
    target.maxResults ??= args.maxResults ?? args.limit;
    target.recencyDays ??= args.recencyDays;
    target.safeSearch ??= args.safeSearch;
    target.locale ??= args.locale;
    return { ...args, target, context: inputContext };
  }

  if (tool === "search.nativeSearch") {
    const target = isRecord(args.target) ? { ...args.target } : {};
    target.provider = normalizeNativeSearchProvider(target.provider ?? args.provider);
    target.query = firstNonBlankString(target.query, args.query, args.q, userText) ?? "";
    target.model = firstNonBlankString(target.model, args.model) ?? target.model;
    target.maxResults ??= args.maxResults ?? args.limit;
    target.recencyDays ??= args.recencyDays;
    target.freshness ??= args.freshness;
    target.allowedDomains ??= normalizeSearchStringArray(args.allowedDomains ?? args.domains);
    target.searchContextSize ??= args.searchContextSize;
    target.userLocation ??= args.userLocation;
    target.citations ??= args.citations ?? "required";
    return {
      ...args,
      target,
      context: inputContext,
    };
  }

  if (tool === "search.ground") {
    const target = isRecord(args.target) ? { ...args.target } : {};
    target.claim = firstNonBlankString(target.claim, args.claim, args.query, userText) ?? "";
    target.evidence ??= args.evidence ?? [
      {
        id: "tool-lab-user-text",
        title: "Tool lab user request",
        excerpt: userText ?? "No explicit evidence supplied; this deterministic lab evidence only proves runtime mounting.",
      },
    ];
    target.mode ??= args.mode;
    target.minimumEvidenceCount ??= args.minimumEvidenceCount;
    target.provider ??= args.provider;
    target.model ??= args.model;
    target.citations ??= args.citations ?? "required";
    return { ...args, target, context: inputContext };
  }

  return { ...args, context: inputContext };
}

type MountedOmniBaseTool =
  | "omni.audioCompressor"
  | "omni.audioFormatConversion"
  | "omni.audioLyricsGeneration"
  | "omni.generateAudio"
  | "omni.listenAudio"
  | "omni.generateImage"
  | "omni.imageCompressor"
  | "omni.imageFormatConversion"
  | "omni.viewImage"
  | "omni.generateVideo"
  | "omni.videoCompressor"
  | "omni.videoFormatConversion"
  | "omni.videoSubtitleGeneration"
  | "omni.viewVideo";

const mountedOmniBaseTools = new Set<MountedOmniBaseTool>([
  "omni.audioCompressor",
  "omni.audioFormatConversion",
  "omni.audioLyricsGeneration",
  "omni.generateAudio",
  "omni.listenAudio",
  "omni.generateImage",
  "omni.imageCompressor",
  "omni.imageFormatConversion",
  "omni.viewImage",
  "omni.generateVideo",
  "omni.videoCompressor",
  "omni.videoFormatConversion",
  "omni.videoSubtitleGeneration",
  "omni.viewVideo",
]);

function normalizeMountedOmniBaseTool(tool: string): MountedOmniBaseTool | undefined {
  const normalized = tool.trim();
  return mountedOmniBaseTools.has(normalized as MountedOmniBaseTool) ? (normalized as MountedOmniBaseTool) : undefined;
}

function omniMediaKind(tool: MountedOmniBaseTool): "audio" | "image" | "video" {
  if (tool.includes("Audio") || tool.startsWith("omni.audio") || tool === "omni.listenAudio") return "audio";
  if (tool.includes("Image") || tool.startsWith("omni.image") || tool === "omni.viewImage") return "image";
  return "video";
}

function omniDefaultExtension(mediaKind: "audio" | "image" | "video"): string {
  if (mediaKind === "audio") return "wav";
  if (mediaKind === "image") return "png";
  return "mp4";
}

function omniPermissions(): readonly string[] {
  return [
    "filesystem:read",
    "omni:image:view",
    "provider:invoke",
    "provider:audio:invoke",
    "omni:audio:read",
    "omni:audio:write",
    "omni:audio:generate",
    "omni:image:read",
    "omni:image:write",
    "omni:image:generate",
    "omni:video:read",
    "omni:video:write",
    "omni:video:generate",
  ];
}

function toolLabOmniGovernedContext(args: Record<string, unknown>): Record<string, unknown> {
  const inputContext = isRecord(args.context) ? args.context : {};
  const toolId = typeof args.toolId === "string" ? args.toolId : "omni";
  const defaultPermissions = toolId === "omni.viewImage" ? ["filesystem:read", "omni:image:view"] : omniPermissions();
  return {
    ...inputContext,
    dryRun: inputContext.dryRun === true ? true : false,
    guard: { ...(isRecord(inputContext.guard) ? inputContext.guard : {}), allowed: true, accepted: true },
    allowedImageRoots: Array.isArray(inputContext.allowedImageRoots) ? inputContext.allowedImageRoots : [repoRoot, architectureRoot, "/workspace/media"],
    allowedInputRoots: Array.isArray(inputContext.allowedInputRoots) ? inputContext.allowedInputRoots : [repoRoot, architectureRoot, "/workspace/media"],
    allowedOutputRoots: Array.isArray(inputContext.allowedOutputRoots) ? inputContext.allowedOutputRoots : [repoRoot, architectureRoot, "/workspace/output"],
    grantedPermissions: Array.isArray(inputContext.grantedPermissions) ? inputContext.grantedPermissions : defaultPermissions,
    requestedScopes: Array.isArray(inputContext.requestedScopes) ? inputContext.requestedScopes : [`tool.${toolId}`],
    allowedScopes: Array.isArray(inputContext.allowedScopes) ? inputContext.allowedScopes : [`tool.${toolId}`],
    auditMetadata: {
      ...(isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : {}),
      labRunId: runId,
      activeAgentId: activeAgent.id,
      surface: "agentcore_tool_lab",
    },
  };
}

function normalizeMountedOmniBaseInput(
  tool: MountedOmniBaseTool,
  args: Record<string, unknown>,
  userText?: string,
): Record<string, unknown> {
  const mediaKind = omniMediaKind(tool);
  const extension = omniDefaultExtension(mediaKind);
  const target = isRecord(args.target) ? { ...args.target } : {};
  const prompt = firstNonBlankString(target.prompt, args.prompt, userText) ?? "Tool lab omni request.";
  const inputPath = firstNonBlankString(
    target.inputPath,
    target.audioPath,
    target.imagePath,
    target.videoPath,
    args.inputPath,
    args.path,
  ) ?? `/workspace/media/source.${extension}`;
  const outputPath = firstNonBlankString(target.outputPath, args.outputPath) ?? `/workspace/output/result.${extension}`;

  if (tool === "omni.viewImage") {
    target.imagePath = firstNonBlankString(target.imagePath, target.inputPath, args.imagePath, args.path) ?? "/workspace/media/source.png";
    target.mediaType ??= args.mediaType ?? "image/png";
    target.detail ??= args.detail ?? "high";
  } else {
    if (!tool.startsWith("omni.generate")) {
      target.inputPath = inputPath;
    }
    if (
      tool.includes("Compressor") ||
      tool.includes("FormatConversion") ||
      tool === "omni.generateAudio" ||
      tool === "omni.generateImage" ||
      tool === "omni.generateVideo"
    ) {
      target.outputPath = outputPath;
    }
    if (tool.startsWith("omni.generate")) {
      target.prompt = prompt;
    }
    target.targetFormat ??= args.targetFormat ?? extension;
  }

  return {
    ...args,
    target,
    context: toolLabOmniGovernedContext({ ...args, toolId: tool }),
  };
}

async function runMountedOmniBaseTool(tool: string, args: Record<string, unknown>, userText?: string): Promise<ToolResult | undefined> {
  const mountedTool = normalizeMountedOmniBaseTool(tool);
  if (mountedTool === undefined) {
    return undefined;
  }

  const input = normalizeMountedOmniBaseInput(mountedTool, args, userText);
  const lookup = createBaseToolRegistry().lookupHandler(mountedTool);
  if (!lookup.ok) {
    return { tool, ok: false, error: `baseTool registry did not mount ${mountedTool}: ${lookup.error.code}` };
  }

  const result = await lookup.handler.invoke({
    toolCallId: `${activeAgent.runtimeId}:handler:${mountedTool}:${Date.now()}`,
    runtimeId: activeAgent.runtimeId,
    sessionId: activeAgent.sessionId,
    input,
    executor: createToolLabBaseToolExecutor(),
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
      mountedVia: "createBaseToolRegistry.lookupHandler",
      runtimeEntry: "BaseToolExecutorPort.omni.transformMedia",
    },
  });
  logEvent("baseTool.handler.invoked", {
    requestedTool: tool,
    mountedTool,
    input,
    result,
    mountedVia: "createBaseToolRegistry.lookupHandler",
    runtimeEntry: "BaseToolExecutorPort.omni.transformMedia",
  });

  if (!result.ok) {
    return { tool, ok: false, error: `${result.error.code}: ${result.error.message}` };
  }

  return { tool, ok: true, output: result.output };
}

type MountedMcpTool =
  | "mcp.authenticate"
  | "mcp.authorize"
  | "mcp.cache"
  | "mcp.invalidateCache"
  | "mcp.connect"
  | "mcp.disconnect"
  | "mcp.subscribe"
  | "mcp.unsubscribe"
  | "mcp.call"
  | "mcp.stream"
  | "mcp.cancel"
  | "mcp.nativeExecute"
  | "mcp.listTools"
  | "mcp.registerTool"
  | "mcp.updateTool"
  | "mcp.unregisterTool"
  | "mcp.listResources"
  | "mcp.readResource"
  | "mcp.createResource"
  | "mcp.updateResource"
  | "mcp.deleteResource"
  | "mcp.ping"
  | "mcp.healthCheck";

function normalizeMountedMcpTool(tool: string): MountedMcpTool | undefined {
  const normalized = tool.trim();
  if (normalized === "mcp.authenticate" || normalized === "mcp.auth.authenticate") return "mcp.authenticate";
  if (normalized === "mcp.authorize" || normalized === "mcp.auth.authorize") return "mcp.authorize";
  if (normalized === "mcp.cache") return "mcp.cache";
  if (normalized === "mcp.invalidateCache" || normalized === "mcp.cache.invalidate") return "mcp.invalidateCache";
  if (normalized === "mcp.connect") return "mcp.connect";
  if (normalized === "mcp.disconnect") return "mcp.disconnect";
  if (normalized === "mcp.subscribe") return "mcp.subscribe";
  if (normalized === "mcp.unsubscribe") return "mcp.unsubscribe";
  if (normalized === "mcp.call" || normalized === "mcp.tool.call") return "mcp.call";
  if (normalized === "mcp.stream") return "mcp.stream";
  if (normalized === "mcp.cancel") return "mcp.cancel";
  if (normalized === "mcp.nativeExecute" || normalized === "mcp.native.execute") return "mcp.nativeExecute";
  if (normalized === "mcp.listTools" || normalized === "mcp.tools.list") return "mcp.listTools";
  if (normalized === "mcp.registerTool" || normalized === "mcp.tool.register") return "mcp.registerTool";
  if (normalized === "mcp.updateTool" || normalized === "mcp.tool.update") return "mcp.updateTool";
  if (normalized === "mcp.unregisterTool" || normalized === "mcp.tool.unregister") return "mcp.unregisterTool";
  if (normalized === "mcp.listResources" || normalized === "mcp.resources.list") return "mcp.listResources";
  if (normalized === "mcp.readResource" || normalized === "mcp.resource.read") return "mcp.readResource";
  if (normalized === "mcp.createResource" || normalized === "mcp.resource.create") return "mcp.createResource";
  if (normalized === "mcp.updateResource" || normalized === "mcp.resource.update") return "mcp.updateResource";
  if (normalized === "mcp.deleteResource" || normalized === "mcp.resource.delete") return "mcp.deleteResource";
  if (normalized === "mcp.ping") return "mcp.ping";
  if (normalized === "mcp.healthCheck" || normalized === "mcp.health") return "mcp.healthCheck";
  return undefined;
}

function toolLabMcpRuntimeEntry(tool: MountedMcpTool): string {
  if (tool === "mcp.authenticate") return "BaseToolExecutorPort.mcp.authenticate";
  if (tool === "mcp.authorize") return "BaseToolExecutorPort.mcp.authorize";
  if (tool === "mcp.cache") return "BaseToolExecutorPort.mcp.cache";
  if (tool === "mcp.invalidateCache") return "BaseToolExecutorPort.mcp.invalidateCache";
  if (tool === "mcp.connect") return "BaseToolExecutorPort.mcp.connect";
  if (tool === "mcp.disconnect") return "BaseToolExecutorPort.mcp.disconnect";
  if (tool === "mcp.subscribe") return "BaseToolExecutorPort.mcp.subscribe";
  if (tool === "mcp.unsubscribe") return "BaseToolExecutorPort.mcp.unsubscribe";
  if (tool === "mcp.call") return "BaseToolExecutorPort.mcp.callTool";
  if (tool === "mcp.stream") return "BaseToolExecutorPort.mcp.streamTool";
  if (tool === "mcp.cancel") return "BaseToolExecutorPort.mcp.cancelExecution";
  if (tool === "mcp.nativeExecute") return "BaseToolExecutorPort.mcp.nativeExecute";
  if (tool === "mcp.listTools") return "BaseToolExecutorPort.mcp.listTools";
  if (tool === "mcp.registerTool") return "BaseToolExecutorPort.mcp.registerTool";
  if (tool === "mcp.updateTool") return "BaseToolExecutorPort.mcp.updateTool";
  if (tool === "mcp.unregisterTool") return "BaseToolExecutorPort.mcp.unregisterTool";
  if (tool === "mcp.listResources") return "BaseToolExecutorPort.mcp.listResources";
  if (tool === "mcp.readResource") return "BaseToolExecutorPort.mcp.readResource";
  if (tool === "mcp.createResource") return "BaseToolExecutorPort.mcp.createResource";
  if (tool === "mcp.updateResource") return "BaseToolExecutorPort.mcp.updateResource";
  if (tool === "mcp.deleteResource") return "BaseToolExecutorPort.mcp.deleteResource";
  if (tool === "mcp.ping") return "BaseToolExecutorPort.mcp.ping";
  return "BaseToolExecutorPort.mcp.checkHealth";
}

function normalizeMcpResourceUri(value: unknown): string | undefined {
  const raw = firstNonBlankString(value);
  if (raw === undefined) return undefined;
  if (raw.startsWith("resource:file://")) return raw.slice("resource:".length);
  if (raw.includes("://")) return raw;
  return `file:///workspace/${raw.replace(/^\/+/u, "")}`;
}

function toolLabMcpContext(args: Record<string, unknown>, tool: MountedMcpTool): Record<string, unknown> {
  const inputContext = isRecord(args.context) ? args.context : {};
  const grantedPermissions =
    tool === "mcp.authenticate"
      ? ["mcp:connect", "mcp:auth"]
      : tool === "mcp.authorize"
        ? ["mcp:auth", "mcp:read"]
        : tool === "mcp.cache"
          ? ["mcp:read", "mcp:write", "cache:write"]
          : tool === "mcp.invalidateCache"
            ? ["mcp:cache:invalidate"]
        : tool === "mcp.connect"
      ? ["mcp:connect"]
      : tool === "mcp.disconnect"
        ? ["mcp:disconnect"]
        : tool === "mcp.subscribe" || tool === "mcp.unsubscribe"
        ? ["mcp:subscription:write"]
        : tool === "mcp.call"
      ? ["mcp:call", "mcp:service"]
      : tool === "mcp.stream"
      ? ["mcp:stream", "mcp:call"]
      : tool === "mcp.cancel"
        ? args.force === true || (isRecord(args.target) && args.target.force === true)
          ? ["mcp:cancel", "mcp:control"]
          : ["mcp:cancel"]
      : tool === "mcp.nativeExecute"
      ? ["mcp:native-execute", "mcp:raw"]
      : tool === "mcp.listTools"
      ? ["mcp:tool:read"]
      : tool === "mcp.registerTool" || tool === "mcp.updateTool" || tool === "mcp.unregisterTool"
      ? ["mcp:tool:read", "mcp:tool:write"]
      : tool === "mcp.listResources"
        ? ["mcp:connection:read", "mcp:resource:list"]
        : tool === "mcp.readResource"
          ? ["mcp:resource:read"]
          : tool === "mcp.createResource"
            ? ["mcp:connection:read", "mcp:resource:create"]
            : tool === "mcp.updateResource"
              ? ["mcp:resource:write"]
              : tool === "mcp.deleteResource"
                ? ["mcp:connection:read", "mcp:resource:delete"]
          : tool === "mcp.ping"
            ? ["mcp:ping"]
            : ["mcp:connection:read", "mcp:monitor:read"];
  return {
    ...inputContext,
    dryRun: false,
    guard: { ...(isRecord(inputContext.guard) ? inputContext.guard : {}), allowed: true, accepted: true },
    allowedServerIds: normalizeSearchStringArray(inputContext.allowedServerIds) ?? [toolLabMcpServerId],
    allowedUriPrefixes: normalizeSearchStringArray(inputContext.allowedUriPrefixes) ?? ["file:///workspace/"],
    requestedScopes: normalizeSearchStringArray(inputContext.requestedScopes) ?? ["mcp:fs"],
    allowedScopes: normalizeSearchStringArray(inputContext.allowedScopes) ?? ["mcp:fs"],
    grantedPermissions: normalizeSearchStringArray(inputContext.grantedPermissions) ?? grantedPermissions,
    auditMetadata: {
      ...(isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : {}),
      labRunId: runId,
      activeAgentId: activeAgent.id,
      surface: "agentcore_tool_lab",
      runtimeEntry: toolLabMcpRuntimeEntry(tool),
    },
  };
}

function normalizeMountedMcpInput(
  tool: MountedMcpTool,
  args: Record<string, unknown>,
  _userText?: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...args };
  const target = isRecord(args.target) ? { ...args.target } : {};
  target.serverId = firstNonBlankString(target.serverId, args.serverId, args.server, args.mcpServer) ?? toolLabMcpServerId;

  if (tool === "mcp.authenticate") {
    target.authStrategy = firstNonBlankString(target.authStrategy, args.authStrategy, args.strategy) ?? "oauth";
    target.credentialRef = firstNonBlankString(target.credentialRef, args.credentialRef) ?? "secret://tool-lab/mcp/fs";
    target.requestedScopes ??= normalizeSearchStringArray(args.requestedScopes ?? args.scopes) ?? ["mcp:fs"];
  }

  if (tool === "mcp.authorize") {
    target.subjectId = firstNonBlankString(target.subjectId, args.subjectId, args.subject) ?? "runtime:agentcore-tool-lab";
    target.action = firstNonBlankString(target.action, args.action) ?? "call-tool";
    target.toolName = firstNonBlankString(target.toolName, args.toolName, args.name) ?? "read_file";
    target.resourceUri = firstNonBlankString(target.resourceUri, args.resourceUri, args.uri);
    target.requestedScopes ??= normalizeSearchStringArray(args.requestedScopes ?? args.scopes) ?? ["mcp:fs"];
  }

  if (tool === "mcp.cache") {
    target.cacheKey = firstNonBlankString(target.cacheKey, args.cacheKey, args.key) ?? "resource:file:///workspace/README.md";
    target.valueRef = firstNonBlankString(target.valueRef, args.valueRef) ?? "envelope://tool-lab/mcp/readResource/README";
    target.ttlSeconds ??= args.ttlSeconds ?? 300;
    target.tags ??= normalizeSearchStringArray(args.tags) ?? ["resource", "tool-lab"];
  }

  if (tool === "mcp.invalidateCache") {
    target.scope = firstNonBlankString(target.scope, args.scope) ?? "resources";
    target.cacheKey = firstNonBlankString(target.cacheKey, args.cacheKey, args.key) ?? "resource:file:///workspace/README.md";
    target.reason = firstNonBlankString(target.reason, args.reason) ?? "tool lab invalidation";
  }

  if (tool === "mcp.connect") {
    target.connectionId = firstNonBlankString(target.connectionId, args.connectionId);
    target.transportHint = firstNonBlankString(target.transportHint, target.transport, args.transportHint, args.transport) ?? "stdio";
    delete target.transport;
    delete target.endpoint;
    delete target.command;
    target.timeoutMs ??= args.timeoutMs;
  }

  if (tool === "mcp.disconnect") {
    target.connectionId = firstNonBlankString(target.connectionId, args.connectionId) ?? `${toolLabMcpServerId}:connection`;
    target.reason = firstNonBlankString(target.reason, args.reason);
    target.force = target.force === true || args.force === true;
  }

  if (tool === "mcp.subscribe") {
    target.connectionId = firstNonBlankString(target.connectionId, args.connectionId) ?? `${toolLabMcpServerId}:connection`;
    target.subjectType = firstNonBlankString(target.subjectType, args.subjectType, args.kind) ?? "resource";
    target.subject =
      firstNonBlankString(target.subject, args.subject, args.resourceUri, args.uri) ??
      normalizeMcpResourceUri(args.path) ??
      "file:///workspace/README.md";
    target.eventKinds ??= normalizeSearchStringArray(args.eventKinds) ?? ["changed"];
    target.replayPolicy = firstNonBlankString(target.replayPolicy, args.replayPolicy) ?? "latest";
  }

  if (tool === "mcp.unsubscribe") {
    target.subscriptionId =
      firstNonBlankString(target.subscriptionId, args.subscriptionId) ??
      `${toolLabMcpServerId}:subscription:resource:file:///workspace/README.md`;
    target.reason = firstNonBlankString(target.reason, args.reason) ?? "tool lab cleanup";
  }

  if (tool === "mcp.call") {
    target.name = firstNonBlankString(target.name, target.toolName, args.name, args.toolName) ?? "read_file";
    target.mode = target.mode === "service" || args.mode === "service" ? "service" : "tool";
    target.arguments = isRecord(target.arguments)
      ? target.arguments
      : isRecord(args.arguments)
        ? args.arguments
        : { path: firstNonBlankString(args.path, args.resourceUri, args.uri) ?? "README.md" };
    target.timeoutMs ??= args.timeoutMs;
  }

  if (tool === "mcp.stream") {
    target.name = firstNonBlankString(target.name, args.name, args.toolName) ?? "read_file";
    target.channel = firstNonBlankString(target.channel, args.channel) ?? "chunks";
    target.arguments = isRecord(target.arguments)
      ? target.arguments
      : isRecord(args.arguments)
        ? args.arguments
        : { path: firstNonBlankString(args.path, args.resourceUri, args.uri) ?? "README.md" };
    target.maxEvents ??= args.maxEvents ?? args.limit ?? 3;
  }

  if (tool === "mcp.cancel") {
    target.executionId = firstNonBlankString(target.executionId, args.executionId) ?? `${toolLabMcpServerId}:execution:read_file`;
    target.reason = firstNonBlankString(target.reason, args.reason) ?? "tool lab cancel";
    target.force = target.force === true || args.force === true;
  }

  if (tool === "mcp.nativeExecute") {
    target.method = firstNonBlankString(target.method, args.method) ?? "tools/list";
    target.params = isRecord(target.params) ? target.params : isRecord(args.params) ? args.params : {};
    target.protocolVersion = firstNonBlankString(target.protocolVersion, args.protocolVersion) ?? "2025-06-18";
    target.idempotencyKey = firstNonBlankString(target.idempotencyKey, args.idempotencyKey);
  }

  if (tool === "mcp.listTools") {
    target.namespace = firstNonBlankString(target.namespace, args.namespace);
    target.limit ??= args.limit;
    target.cursor ??= args.cursor;
    target.includeDisabled ??= args.includeDisabled;
  }

  if (tool === "mcp.registerTool") {
    target.tool = isRecord(target.tool)
      ? target.tool
      : isRecord(args.tool)
        ? args.tool
        : {
            name: firstNonBlankString(args.toolName, args.name) ?? "dynamic_echo",
            description: firstNonBlankString(args.description) ?? "Dynamic echo tool from Tool Lab MCP runtime",
            inputSchema: { type: "object" },
          };
    target.replaceExisting = target.replaceExisting === true || args.replaceExisting === true;
  }

  if (tool === "mcp.updateTool") {
    target.toolName = firstNonBlankString(target.toolName, args.toolName, args.name) ?? "dynamic_echo";
    target.patch = isRecord(target.patch)
      ? target.patch
      : isRecord(args.patch)
        ? args.patch
        : { description: firstNonBlankString(args.description) ?? "Updated dynamic echo tool from Tool Lab MCP runtime" };
  }

  if (tool === "mcp.unregisterTool") {
    target.toolName = firstNonBlankString(target.toolName, args.toolName, args.name) ?? "dynamic_echo";
    target.keepAuditRecord = target.keepAuditRecord !== false && args.keepAuditRecord !== false;
  }

  if (tool === "mcp.listResources") {
    target.uriPrefix = firstNonBlankString(target.uriPrefix, args.uriPrefix, args.prefix) ?? "file:///workspace/";
    target.limit ??= args.limit;
    target.cursor ??= args.cursor;
  }

  if (tool === "mcp.readResource") {
    target.resourceUri =
      normalizeMcpResourceUri(target.resourceUri) ??
      normalizeMcpResourceUri(args.resourceUri) ??
      normalizeMcpResourceUri(args.uri) ??
      normalizeMcpResourceUri(args.path) ??
      "file:///workspace/README.md";
    target.acceptMimeTypes ??= normalizeSearchStringArray(args.acceptMimeTypes ?? args.mimeTypes);
    target.maxBytes ??= args.maxBytes;
  }

  if (tool === "mcp.createResource") {
    target.uri =
      normalizeMcpResourceUri(target.uri) ??
      normalizeMcpResourceUri(args.uri) ??
      normalizeMcpResourceUri(args.resourceUri) ??
      normalizeMcpResourceUri(args.path) ??
      "file:///workspace/tool-lab-created.md";
    target.resourceType = firstNonBlankString(target.resourceType, args.resourceType) ?? "document";
    target.mimeType = firstNonBlankString(target.mimeType, args.mimeType) ?? "text/markdown";
    input.initialContent = firstNonBlankString(args.initialContent, args.content, args.text) ?? "# Created by Tool Lab\n";
    input.metadata = isRecord(args.metadata) ? args.metadata : { owner: "agentcore_tool_lab" };
  }

  if (tool === "mcp.updateResource") {
    target.resourceUri =
      normalizeMcpResourceUri(target.resourceUri) ??
      normalizeMcpResourceUri(args.resourceUri) ??
      normalizeMcpResourceUri(args.uri) ??
      normalizeMcpResourceUri(args.path) ??
      "file:///workspace/README.md";
    target.expectedRevision = firstNonBlankString(target.expectedRevision, args.expectedRevision);
    target.content = isRecord(target.content)
      ? target.content
      : isRecord(args.content)
        ? args.content
        : { mimeType: "text/markdown", text: firstNonBlankString(args.text, args.body) ?? "# Updated by Tool Lab\n" };
  }

  if (tool === "mcp.deleteResource") {
    target.uri =
      normalizeMcpResourceUri(target.uri) ??
      normalizeMcpResourceUri(args.uri) ??
      normalizeMcpResourceUri(args.resourceUri) ??
      normalizeMcpResourceUri(args.path) ??
      "file:///workspace/tool-lab-created.md";
    target.expectedRevision = firstNonBlankString(target.expectedRevision, args.expectedRevision);
    input.reason = firstNonBlankString(args.reason) ?? "tool lab cleanup";
  }

  if (tool === "mcp.ping" || tool === "mcp.healthCheck") {
    target.connectionId = firstNonBlankString(target.connectionId, args.connectionId);
    target.timeoutMs ??= args.timeoutMs;
  }

  if (tool === "mcp.healthCheck") {
    target.includeCapabilities ??= args.includeCapabilities ?? true;
    target.includeLatencyProbe ??= args.includeLatencyProbe ?? true;
  }

  return {
    ...input,
    target,
    context: toolLabMcpContext(args, tool),
  };
}

async function runMountedMcpTool(tool: string, args: Record<string, unknown>, userText?: string): Promise<ToolResult | undefined> {
  const mountedTool = normalizeMountedMcpTool(tool);
  if (mountedTool === undefined) {
    return undefined;
  }

  const input = normalizeMountedMcpInput(mountedTool, args, userText);
  const lookup = createBaseToolRegistry().lookupHandler(mountedTool);
  if (!lookup.ok) {
    return { tool, ok: false, error: `baseTool registry did not mount ${mountedTool}: ${lookup.error.code}` };
  }

  const runtimeEntry = toolLabMcpRuntimeEntry(mountedTool);
  const result = await lookup.handler.invoke({
    toolCallId: `${activeAgent.runtimeId}:handler:${mountedTool}:${Date.now()}`,
    runtimeId: activeAgent.runtimeId,
    sessionId: activeAgent.sessionId,
    input,
    executor: createToolLabMcpExecutor(),
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
      mountedVia: "createBaseToolRegistry.lookupHandler",
      runtimeEntry,
    },
  });
  logEvent("baseTool.handler.invoked", {
    requestedTool: tool,
    mountedTool,
    input,
    result,
    mountedVia: "createBaseToolRegistry.lookupHandler",
    runtimeEntry,
  });

  if (!result.ok) {
    return { tool, ok: false, error: `${result.error.code}: ${result.error.message}` };
  }

  return { tool, ok: true, output: result.output };
}

export async function runMountedGitBaseTool(
  tool: string,
  args: Record<string, unknown>,
  userText?: string,
  executor: BaseToolExecutorPort = createToolLabBaseToolExecutor(),
  options: { trustedAllowedRepositoryRoots?: readonly string[] } = {},
): Promise<ToolResult | undefined> {
  const mountedTool = normalizeMountedGitBaseTool(tool);
  if (mountedTool === undefined) {
    return undefined;
  }

  const input = normalizeMountedGitBaseInput(mountedTool, args, userText, options.trustedAllowedRepositoryRoots);
  const lookup = createBaseToolRegistry().lookupHandler(mountedTool);
  if (!lookup.ok) {
    return { tool, ok: false, error: `baseTool registry did not mount ${mountedTool}: ${lookup.error.code}` };
  }

  const result = await lookup.handler.invoke({
    toolCallId: `${activeAgent.runtimeId}:handler:${mountedTool}:${Date.now()}`,
    runtimeId: activeAgent.runtimeId,
    sessionId: activeAgent.sessionId,
    input,
    executor,
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
      mountedVia: "createBaseToolRegistry.lookupHandler",
      runtimeEntry: "BaseToolExecutorPort.git.runGit",
    },
  });
  logEvent("baseTool.handler.invoked", {
    requestedTool: tool,
    mountedTool,
    input,
    result,
    mountedVia: "createBaseToolRegistry.lookupHandler",
    runtimeEntry: "BaseToolExecutorPort.git.runGit",
  });

  if (!result.ok) {
    return { tool, ok: false, error: `${result.error.code}: ${result.error.message}` };
  }

  return { tool, ok: true, output: result.output };
}

async function runMountedSearchBaseTool(tool: string, args: Record<string, unknown>, userText?: string): Promise<ToolResult | undefined> {
  const mountedTool = normalizeMountedSearchBaseTool(tool);
  if (mountedTool === undefined) {
    return undefined;
  }

  const input = normalizeMountedSearchBaseInput(mountedTool, args, userText);
  const lookup = createBaseToolRegistry().lookupHandler(mountedTool);
  if (!lookup.ok) {
    return { tool, ok: false, error: `baseTool registry did not mount ${mountedTool}: ${lookup.error.code}` };
  }

  const result = await lookup.handler.invoke({
    toolCallId: `${activeAgent.runtimeId}:handler:${mountedTool}:${Date.now()}`,
    runtimeId: activeAgent.runtimeId,
    sessionId: activeAgent.sessionId,
    input,
    executor: createToolLabBaseToolExecutor(),
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
      mountedVia: "createBaseToolRegistry.lookupHandler",
      runtimeEntry: toolLabSearchRuntimeEntry(mountedTool),
    },
  });
  logEvent("baseTool.handler.invoked", { requestedTool: tool, mountedTool, input, result });

  if (!result.ok) {
    return { tool, ok: false, error: `${result.error.code}: ${result.error.message}` };
  }

  return { tool, ok: true, output: result.output };
}

async function runMountedCodeBaseTool(tool: string, args: Record<string, unknown>, userText?: string): Promise<ToolResult | undefined> {
  const mountedTool = normalizeMountedCodeBaseTool(tool);
  if (mountedTool === undefined) {
    return undefined;
  }

  const input = normalizeMountedCodeBaseInput(mountedTool, args, userText);
  const lookup = createBaseToolRegistry().lookupHandler(mountedTool);
  if (!lookup.ok) {
    return { tool, ok: false, error: `baseTool registry did not mount ${mountedTool}: ${lookup.error.code}` };
  }

  const result = await lookup.handler.invoke({
    toolCallId: `${activeAgent.runtimeId}:handler:${mountedTool}:${Date.now()}`,
    runtimeId: activeAgent.runtimeId,
    sessionId: activeAgent.sessionId,
    input,
    executor: createToolLabBaseToolExecutor(),
    metadata: {
      labRunId: runId,
      activeAgentId: activeAgent.id,
      mountedVia: "createBaseToolRegistry.lookupHandler",
    },
  });
  logEvent("baseTool.handler.invoked", { requestedTool: tool, mountedTool, input, result });

  if (!result.ok) {
    const hint = mountedCodeBaseFailureHint(mountedTool, input);
    return {
      tool,
      ok: false,
      error: `${hint === undefined ? result.error.code : "FILE_NOT_FOUND"}: ${hint ?? result.error.message}`,
    };
  }

  return { tool, ok: true, output: result.output };
}

export async function runTool(tool: string, args: Record<string, unknown> = {}, userText?: string): Promise<ToolResult> {
  const startedAt = Date.now();
  logEvent("tool.started", { tool, args });
  const agentCoreEnvelopeFailure = createAgentCoreToolInvocationEnvelope(tool, args);
  if (agentCoreEnvelopeFailure !== undefined) {
    logEvent("tool.finished", { ...agentCoreEnvelopeFailure, durationMs: Date.now() - startedAt });
    return agentCoreEnvelopeFailure;
  }

  try {
    const normalized = tool.trim();
    const mountedCodeBaseResult = await runMountedCodeBaseTool(normalized, args, userText);
    if (mountedCodeBaseResult !== undefined) {
      logEvent("tool.finished", { ...mountedCodeBaseResult, durationMs: Date.now() - startedAt });
      return mountedCodeBaseResult;
    }

    const mountedMcpResult = await runMountedMcpTool(normalized, args, userText);
    if (mountedMcpResult !== undefined) {
      logEvent("tool.finished", { ...mountedMcpResult, durationMs: Date.now() - startedAt });
      return mountedMcpResult;
    }

    const mountedGitBaseResult = await runMountedGitBaseTool(normalized, args, userText);
    if (mountedGitBaseResult !== undefined) {
      logEvent("tool.finished", { ...mountedGitBaseResult, durationMs: Date.now() - startedAt });
      return mountedGitBaseResult;
    }

    const mountedSearchBaseResult = await runMountedSearchBaseTool(normalized, args, userText);
    if (mountedSearchBaseResult !== undefined) {
      logEvent("tool.finished", { ...mountedSearchBaseResult, durationMs: Date.now() - startedAt });
      return mountedSearchBaseResult;
    }

    const mountedOmniBaseResult = await runMountedOmniBaseTool(normalized, args, userText);
    if (mountedOmniBaseResult !== undefined) {
      logEvent("tool.finished", { ...mountedOmniBaseResult, durationMs: Date.now() - startedAt });
      return mountedOmniBaseResult;
    }

    if (normalized === "tool.catalog" || normalized === "tools.list") {
      const query = typeof args.query === "string" ? args.query : "";
      const tools = query.length > 0
        ? toolCatalog.filter((entry) => entry.toolId.includes(query) || entry.sourcePath.includes(query))
        : toolCatalog;
      const result = { tool, ok: true, output: { count: tools.length, tools: tools.slice(0, Number(args.limit ?? 120)) } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.write" || normalized === "code.overwrite" || normalized.endsWith(".overwrite")) {
      const target = resolveAnyPath(args.path ?? args.targetPath ?? args.file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, String(args.content ?? ""), "utf8");
      const result = { tool, ok: true, output: { path: target, bytes: Buffer.byteLength(String(args.content ?? "")) } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.append") {
      const target = resolveAnyPath(args.path ?? args.targetPath ?? args.file);
      mkdirSync(path.dirname(target), { recursive: true });
      await appendFile(target, String(args.content ?? ""), "utf8");
      const result = { tool, ok: true, output: { path: target, appendedBytes: Buffer.byteLength(String(args.content ?? "")) } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.delete" || normalized.endsWith(".delete")) {
      const target = resolveAnyPath(args.path ?? args.targetPath ?? args.file);
      rmSync(target, { recursive: true, force: true });
      const result = { tool, ok: true, output: { path: target, removed: true } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "shell.commandExecution" || normalized === "shell.command" || normalized === "shell.exec") {
      const command = String(args.command ?? "");
      const commandArgs = Array.isArray(args.args) ? args.args.map(String) : [];
      const cwd = resolveAnyPath(args.cwd, ".");
      const result = { tool, ok: true, output: runProcess(command, commandArgs, cwd) };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "shell.scriptExecution" || normalized === "shell.script") {
      const script = String(args.script ?? args.command ?? "");
      const cwd = resolveAnyPath(args.cwd, ".");
      const result = { tool, ok: true, output: runProcess("zsh", ["-lc", script], cwd) };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized.startsWith("git.")) {
      const result = {
        tool,
        ok: false,
        error: `git tool ${normalized} is visible in dev-all-tools mode but is not mounted; arbitrary git.execute fallback is disabled`,
        output: {
          mountedGitBaseTools: [
            "git.getRepositoryStatus",
            "git.getWorkingTreeDiff",
            "git.getCommitHistory",
            "git.showGitObjectDetails",
            "git.traceLineOwnership",
            "git.checkoutTarget",
            "git.manageBranch",
            "git.manageTag",
            "git.mergeBranch",
            "git.rebaseBranch",
            "git.switchBranch",
            "git.manageIgnoreRules",
            "git.moveOrRenameFile",
            "git.removeTrackedFile",
            "git.addToStaging",
            "git.resetStagingOrCommit",
            "git.restoreWorkingTree",
            "git.stashChanges",
            "git.applyStashChanges",
            "git.popStashChanges",
            "git.cleanUntrackedFiles",
            "git.amendLastCommit",
            "git.cherryPickCommit",
            "git.createCommit",
            "git.revertCommit",
            "git.initializeRepository",
            "git.cloneRepository",
            "git.archiveRepository",
            "git.locateProblemCommit",
            "git.manageSubmodule",
            "git.manageWorktree",
            "git.fetchRemoteUpdates",
            "git.pullRemoteChanges",
            "git.pushLocalChanges",
            "git.manageRemote",
          ],
          mountedInspectionTools: ["git.showGitObjectDetails", "git.traceLineOwnership"],
          mountedBranchTools: ["git.checkoutTarget", "git.manageBranch", "git.manageTag", "git.mergeBranch", "git.rebaseBranch", "git.switchBranch"],
          mountedCommitTools: ["git.createCommit", "git.amendLastCommit", "git.cherryPickCommit", "git.revertCommit"],
          mountedRepositoryTools: ["git.initializeRepository", "git.cloneRepository", "git.archiveRepository"],
          mountedAdvancedTools: ["git.locateProblemCommit", "git.manageSubmodule", "git.manageWorktree"],
          mountedRemoteTools: ["git.manageRemote", "git.fetchRemoteUpdates", "git.pullRemoteChanges", "git.pushLocalChanges"],
          legacyReadOnlyDirectTools: [],
        },
      };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "search.fetch") {
      const url = String(args.url ?? "");
      const response = await fetch(url);
      const text = await response.text();
      const result: ToolResult = {
        tool,
        ok: true,
        output: {
          url,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: limitText(text),
        },
      };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    const result = {
      tool,
      ok: false,
      error: `tool ${tool} is visible in dev-all-tools mode but has no real executor wired yet`,
      output: toolCatalog.find((entry) => entry.toolId === tool),
    };
    logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    const result = { tool, ok: false, error: error instanceof Error ? error.message : String(error) };
    logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
    return result;
  }
}

function extractResponseText(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    return String(response);
  }

  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text.trim();
  }

  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (typeof part !== "object" || part === null) {
          continue;
        }
        const text = (part as Record<string, unknown>).text ?? (part as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) {
          parts.push(text.trim());
        }
      }
    }
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return JSON.stringify(response, null, 2);
}

async function callModel(prompt: string): Promise<string> {
  const startedAt = Date.now();
  logEvent("model.request.started", {
    model,
    baseUrl,
    reasoningEffort,
    maxOutputTokens,
    promptPreview: prompt.slice(0, 4000),
  });
  const response = await fetch(buildEndpoint(baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
    }),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { rawText: text };
  }

  if (!response.ok) {
    logEvent("model.request.failed", {
      status: response.status,
      durationMs: Date.now() - startedAt,
      responsePreview: JSON.stringify(parsed).slice(0, 4000),
    });
    throw new Error(`model call failed with HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 1200)}`);
  }

  const extracted = extractResponseText(parsed);
  logEvent("model.request.finished", {
    status: response.status,
    durationMs: Date.now() - startedAt,
    outputPreview: extracted.slice(0, 4000),
  });
  return extracted;
}

function extractJsonObject(text: string): unknown | undefined {
  const trimmed = text.trim();
  const fenced = trimmed.startsWith("```")
    ? trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/u)
    : undefined;
  const source = fenced?.[1] ?? text;
  const firstBrace = source.indexOf("{");
  if (firstBrace === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = firstBrace; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  const candidate = end === -1 ? source.slice(firstBrace, source.lastIndexOf("}") + 1) : source.slice(firstBrace, end);
  if (candidate.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function normalizeToolCalls(value: unknown): ToolCall[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const rawCalls = record.tool_calls ?? record.toolCalls;
  if (!Array.isArray(rawCalls)) {
    return [];
  }

  const seenCalls = new Set<string>();
  return rawCalls
    .map((rawCall): ToolCall | undefined => {
      if (typeof rawCall !== "object" || rawCall === null) {
        return undefined;
      }

      const callRecord = rawCall as Record<string, unknown>;
      const tool = typeof callRecord.tool === "string" ? callRecord.tool : typeof callRecord.name === "string" ? callRecord.name : "";
      const toolArguments = typeof callRecord.arguments === "object" && callRecord.arguments !== null
        ? (callRecord.arguments as Record<string, unknown>)
        : {};
      return tool.trim().length > 0 ? { tool, arguments: toolArguments } : undefined;
    })
    .filter((call): call is ToolCall => call !== undefined)
    .filter((call) => {
      const key = `${call.tool}\0${JSON.stringify(call.arguments)}`;
      if (seenCalls.has(key)) {
        return false;
      }
      seenCalls.add(key);
      return true;
    });
}

function buildToolAwarePrompt(agent: LabAgent, history: readonly ChatMessage[], userText: string): string {
  const sampleTools = toolCatalog.slice(0, 80).map((entry) => entry.toolId).join(", ");
  const transcript = history.slice(-12).map((message) => `${message.role}: ${message.content}`).join("\n");
  return [
    "你是 Praxis agentCore 的临时全工具测试 agent。",
    "当前阶段是功能测试，agentCore 侧不做治理拦截，所有工具都对你可见。",
    "每个普通用户请求只输出一个最匹配的工具调用；不要重复输出同一个工具调用。只有用户明确要求多步操作时才输出多个不同工具调用。",
    "当用户要读取代码、扫描目录或搜索文本时，必须优先并且只使用 code.read、code.scan、code.search_Ripgrep。",
    "当用户要语义能力、符号树、查找符号、定义、引用、实现、补全、签名、诊断或 LSP 格式化预览时，必须优先并且只使用 code.lsp_* 工具。",
    "LSP 常用映射：文档符号/符号树用 code.lsp_scanDocumentSymbols；工作区符号搜索用 code.lsp_searchWorkspaceSymbols；定义用 code.lsp_locateDefinition；类型定义用 code.lsp_locateTypeDefinition；引用用 code.lsp_traceReferences；实现用 code.lsp_traceImplementations；补全用 code.lsp_completeCode；签名用 code.lsp_assistSignature；诊断用 code.lsp_inspectDiagnostics；格式化预览用 code.lsp_formatDocument 或 code.lsp_formatRange。",
    "调用 code.read 时，如果用户说“前 N 行”“开头 N 行”，必须设置 range: { startLine: 1, endLine: N }；如果说“开头几行”，设置 range: { startLine: 1, endLine: 12 }。",
    "调用 code.scan 时，如果用户说“下面有什么”“有哪些文件/文件夹”“第一层”，必须设置 depth: 1；只有用户明确说递归、展开多层、看结构或 deeper 时才设置更大的 depth。",
    "调用 code.search_Ripgrep 时必须提供 directoryPath；如果用户没有指定范围，默认用 Praxis_Agent_Architecture。",
    "如果用户说“只看/只列/只在 ts 文件”，code.scan 使用 includeGlobs: [\"*.ts\", \"**/*.ts\"]，code.search_Ripgrep 使用 fileGlob: \"**/*.ts\"；其他后缀同理。",
    "代码探索和 LSP 语义任务禁止改用 shell.commandExecution、shell.scriptExecution、bash、sed、head、find、rg、grep、cat、ls 等 shell 路径。",
    "当用户要创建、覆盖、整体替换、局部修改、删除文件/行或格式化代码时，必须优先并且只使用 code.replaceFile、code.overwrite、code.modify、code.delete、code.format。",
    "代码编辑任务禁止改用 shell.commandExecution、shell.scriptExecution、bash、sed -i、perl -pi、rm、cat > file、tee、printf 重定向等 shell 路径。",
    "调用 code.overwrite/code.modify/code.delete/code.format 时必须提供 workspaceRoot；如果用户没有指定，使用当前 repoRoot。",
    "调用编辑工具真实执行时必须设置 dryRun: false，并设置 context.guard 或 guard 为 { allowed: true, accepted: true }。",
    "编辑工具调用示例：code.overwrite 使用 {targetPath, content, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；code.modify 使用 {targetPath, searchText, replacementText, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；code.delete 删除行时使用 {targetPath, deleteKind:\"code-range\", range:{startLine:2,endLine:2}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}。",
    "当用户要跑测试、指定测试文件、只跑某个测试目标时，必须优先并且只使用 code.testCode；当用户要做性能/耗时 benchmark 时，必须优先并且只使用 code.benchmark。",
    "当用户要调试日志、debug console、调用栈、变量、断点、启动或附加 debug session 时，必须优先并且只使用 code.debugCollectLogs、code.debugCaptureState、code.debugRun。",
    "测试和调试任务禁止改用 shell.commandExecution、shell.scriptExecution、npm test、node --test、bash、tail、cat 等 shell 路径；这些真实执行由 code.* 工具挂载到 runtime port。",
    "调用 test/debug 工具真实执行时必须设置 dryRun:false，并设置 context.guard 或 guard 为 { allowed: true, accepted: true }。",
    "如果 code.read 返回 FILE_NOT_FOUND 或 READER_REJECTED，不要改用 shell。先用 code.scan 或 code.search_Ripgrep 查正确路径；如果仍找不到，就回答路径不存在。",
    "当用户要查看 Git 仓库状态时，必须使用 git.getRepositoryStatus；禁止改用 shell.commandExecution、shell.scriptExecution 或任意伪造的 git.* 子命令。",
    "gitBase 是内部 family 名称；对外可调用 toolId 必须精确使用 git.* registry 名称，禁止输出 gitBase.*、git.execute 或其他别名。",
    "当用户已经明确要求执行 Git mutation，lab 会注入 affirmative guard；模型仍必须选择对应 fixed-action gitBase 工具，让 storage core 和 runtime governance 继续执行安全边界，而不是改走 shell 或自造命令。",
    "git.getRepositoryStatus 是 fixed-action gitBase 工具，不是 git.execute。调用形状必须是 {target:{repositoryPath, porcelainVersion:\"v1\"或\"v2\"}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；如果用户没有指定仓库，repositoryPath 使用当前 Praxis_Agent_Architecture。",
    "当用户要查看 Git diff 时，必须使用 git.getWorkingTreeDiff。调用形状必须是 {target:{repositoryPath, mode:\"unstaged\"|\"staged\"|\"combined\", pathspecs?:string[], contextLines?:number}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}。",
    "当用户要查看 Git 提交历史时，必须使用 git.getCommitHistory。调用形状必须是 {target:{repositoryPath, maxCount?:number, ref?:string, pathFilter?:string}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}。",
    "当用户要查看 Git 对象、HEAD、某个 commit 的原始信息、摘要或 patch 时，必须使用 git.showGitObjectDetails。调用形状必须是 {target:{repositoryPath, objectRef:\"HEAD\"或安全 ref, format:\"summary\"|\"raw\"|\"patch\"}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}。",
    "当用户要查看某个文件某几行是谁改的、blame、line ownership 时，必须使用 git.traceLineOwnership。调用形状必须是 {target:{repositoryPath, filePath:\"仓库相对路径\", range:{startLine:number,endLine:number}, revision?:string}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}。",
    "当用户要检出某个安全 ref、detached checkout、从 ref 创建新分支并 checkout 时，必须使用 git.checkoutTarget。调用形状必须是 {target:{repositoryPath, targetRef:\"安全 ref\", newBranchName?:\"安全分支名\", detach?:boolean, force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把文件恢复任务混到 checkoutTarget。",
    "当用户要列出分支、创建分支、删除分支、重命名分支或设置 upstream 时，必须使用 git.manageBranch。调用形状必须是 {target:{repositoryPath, action:\"list\"|\"create\"|\"delete\"|\"rename\"|\"set-upstream\", branchName?:\"安全分支名\", newBranchName?:\"安全分支名\", startPoint?:\"安全 ref\", upstream?:\"安全 upstream\", force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；list 可只需 git:read/filesystem:read；禁止改用 shell、switchBranch、checkoutTarget 或任意 git 子命令。",
    "当用户要列出标签、创建标签、创建 annotated tag 或删除标签时，必须使用 git.manageTag。调用形状必须是 {target:{repositoryPath, action:\"list\"|\"create\"|\"annotate\"|\"delete\", tagName?:\"安全标签名\", targetRef?:\"安全 ref\", message?:string, force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；list 可只需 git:read/filesystem:read；禁止改用 shell 或任意 git 子命令。",
    "当用户要合并分支、merge branch、ff-only/no-ff/squash merge 时，必须使用 git.mergeBranch。调用形状必须是 {target:{repositoryPath, sourceBranch:\"安全分支名\", mode?:\"default\"|\"ff-only\"|\"no-ff\"|\"squash\", commitMessage?:string, noCommit?:boolean, allowUnrelatedHistories?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把 rebase/cherry-pick/reset 混进 mergeBranch。",
    "当用户要变基分支、rebase branch、rebase onto、autosquash 或 interactive rebase 时，必须使用 git.rebaseBranch。调用形状必须是 {target:{repositoryPath, upstreamRef:\"安全 ref\", branchName?:\"安全分支名\", ontoRef?:\"安全 ref\", keepBase?:boolean, autosquash?:boolean, interactive?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把 merge/cherry-pick/reset 混进 rebaseBranch。",
    "当用户要切换分支、创建并切换分支、git switch 或 checkout 到分支时，必须使用 git.switchBranch。调用形状必须是 {target:{repositoryPath, branchName:\"安全分支名\", create?:boolean, startPoint?:\"安全 ref\", track?:boolean, discardChanges?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、checkoutTarget 或任意 git 子命令。",
    "当用户要移除已跟踪文件、git rm、从 index 删除 tracked file 时，必须使用 git.removeTrackedFile。调用形状必须是 {target:{repositoryPath, filePath:\"仓库相对路径\", keepWorkingTree?:boolean, force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要移动或重命名 Git 已跟踪文件、git mv、rename tracked file 时，必须使用 git.moveOrRenameFile。调用形状必须是 {target:{repositoryPath, sourcePath:\"仓库相对路径\", destinationPath:\"仓库相对路径\", force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要查看、添加、删除或替换 .gitignore / ignore 规则时，必须使用 git.manageIgnoreRules。调用形状必须是 {target:{repositoryPath, action:\"inspect\"|\"add\"|\"remove\"|\"replace\", ignoreFilePath?:\".gitignore\", rules?:string[]}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell redirection、sed 或任意 git 子命令。",
    "当用户要把文件加入暂存区、stage 文件、git add 时，必须使用 git.addToStaging。调用形状必须是 {target:{repositoryPath, pathspecs?:string[], all?:boolean, update?:boolean, intentToAdd?:boolean, force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要取消暂存、unstage、重置 index，必须使用 git.resetStagingOrCommit 且 action:\"staging\"。调用形状必须是 {target:{repositoryPath, action:\"staging\", pathspecs?:string[]}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要 reset commit、移动 HEAD 或执行 hard/soft/mixed reset，必须使用 git.resetStagingOrCommit 且 action:\"commit\"，并提供 targetRef 和 mode。mode:\"hard\" 属于 destructive 风险，必须保留 affirmative guard。",
    "当用户要丢弃工作树改动、从 HEAD 或指定 revision 恢复文件时，必须使用 git.restoreWorkingTree。调用形状必须是 {target:{repositoryPath, paths:[\"仓库相对路径\"], sourceRef?:\"HEAD\"或安全 ref}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要保存当前工作区改动、stash、临时收起改动时，必须使用 git.stashChanges。调用形状必须是 {target:{repositoryPath, message?:string, includeUntracked?:boolean, keepIndex?:boolean, pathspecs?:string[]}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要应用已有 stash、恢复 stash 内容但不删除 stash entry 时，必须使用 git.applyStashChanges。调用形状必须是 {target:{repositoryPath, stashRef?:\"stash@{0}\", reinstateIndex?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要弹出 stash、应用 stash 内容并在成功后删除 stash entry 时，必须使用 git.popStashChanges。调用形状必须是 {target:{repositoryPath, stashRef?:\"stash@{0}\", reinstateIndex?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要清理未跟踪文件、删除 untracked 文件或执行 git clean 时，必须使用 git.cleanUntrackedFiles。调用形状必须是 {target:{repositoryPath, paths?:string[], includeDirectories?:boolean, ignoredMode?:\"none\"|\"tracked-ignored\"|\"ignored-only\"}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；这是 destructive 风险，禁止改用 shell 或任意 git 子命令。",
    "当用户要创建 Git 提交、提交当前 index 或提交 tracked 改动时，必须使用 git.createCommit。调用形状必须是 {target:{repositoryPath, commitMessage:string, includeAllTracked?:boolean, allowEmpty?:boolean, signoff?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把 amend/cherry-pick/revert 混进 createCommit。",
    "当用户要修订最后一次提交、amend last commit、修改最后一次提交信息或把 tracked 改动合入最后一次提交时，必须使用 git.amendLastCommit。调用形状必须是 {target:{repositoryPath, commitMessage?:string, noEdit?:boolean, includeAllTracked?:boolean, resetAuthor?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；如果用户没有给新 message 且语义是保留原提交信息，使用 noEdit:true；禁止改用 shell、任意 git 子命令或把 create/cherry-pick/revert 混进 amendLastCommit。",
    "当用户要挑选某个提交、cherry-pick commit 或把某个 commit 应用到当前分支时，必须使用 git.cherryPickCommit。调用形状必须是 {target:{repositoryPath, commitRef:\"安全 ref\", noCommit?:boolean, mainlineParent?:number, signoff?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把 revert/merge/rebase 混进 cherryPickCommit。",
    "当用户要反向回滚某个提交、revert commit 或生成反向补丁时，必须使用 git.revertCommit。调用形状必须是 {target:{repositoryPath, commitRef:\"安全 ref\", noCommit?:boolean, mainlineParent?:number}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"filesystem:write\"]}}；禁止改用 shell、任意 git 子命令或把 cherry-pick/reset 混进 revertCommit。",
    "当用户要初始化仓库、git init 或创建新的 Git metadata 时，必须使用 git.initializeRepository。调用形状必须是 {target:{repositoryPath, initialBranch?:\"安全分支名\", bare?:boolean, separateGitDir?:string}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:write\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要克隆仓库、git clone、本地或远程 clone 时，必须使用 git.cloneRepository。调用形状必须是 {target:{repositoryPath:\"clone 的 runtime 工作目录\", remoteUrl:string, destinationPath:string, branch?:\"安全 ref\", depth?:number, singleBranch?:boolean, bare?:boolean, mirror?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要导出仓库归档、git archive、生成 tar/zip 时，必须使用 git.archiveRepository。调用形状必须是 {target:{repositoryPath, outputPath, ref?:\"安全 ref\", format?:\"tar\"|\"zip\", pathspecs?:string[], prefix?:string}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"filesystem:write\"]}}；禁止改用 shell 或任意 git 子命令。",
    "当用户要定位问题提交、查找已知 good/bad 范围里的可疑 commit 或做 bisect 候选读取时，必须使用 git.locateProblemCommit。调用形状必须是 {target:{repositoryPath, knownGoodRef:\"安全 ref\", knownBadRef:\"安全 ref\", verificationCommand?:string, maxSteps?:number}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"filesystem:read\"]}}；该工具只运行固定 git rev-list --bisect-all，不执行 verificationCommand，不改用 shell、git bisect run 或任意 git 子命令。",
    "当用户要列出、新增、删除或清理 Git worktree 时，必须使用 git.manageWorktree。调用形状必须是 {target:{repositoryPath, action:\"list\"|\"add\"|\"remove\"|\"prune\", worktreePath?:string, targetRef?:\"安全 ref\", branchName?:\"安全分支名\", detach?:boolean, force?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；list 可只需 git:read/filesystem:read，mutation 需要 git:read/git:write/filesystem:read/filesystem:write；禁止改用 shell 或任意 git 子命令。",
    "当用户要查看、新增、更新、同步或 deinit Git submodule 时，必须使用 git.manageSubmodule。调用形状必须是 {target:{repositoryPath, action:\"status\"|\"add\"|\"update\"|\"sync\"|\"deinit\", submodulePath?:\"仓库相对路径\", remoteUrl?:string, branch?:\"安全 ref\", recursive?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；status 可只需 git:read/filesystem:read，add/update 需要 network:egress，mutation 需要 git:read/git:write/filesystem:read/filesystem:write；禁止改用 shell 或任意 git 子命令。",
    "当用户要列出、查看、新增、删除、重命名远端或修改 remote url 时，必须使用 git.manageRemote。调用形状必须是 {target:{repositoryPath, action:\"list\"|\"show\"|\"add\"|\"remove\"|\"rename\"|\"set-url\", remoteName?:string, newRemoteName?:string, remoteUrl?:string, urlMode?:\"fetch\"|\"push\"}, context:{dryRun:false, guard:{allowed:true, accepted:true}}}；list/show 可只需 git:read/filesystem:read，mutation 需要 git:read/git:write/filesystem:read/filesystem:write；禁止改用 shell 或任意 git 子命令。",
    "当用户要 fetch、抓取远端更新、更新 remote-tracking refs 时，必须使用 git.fetchRemoteUpdates。调用形状必须是 {target:{repositoryPath, remoteName?:\"origin\", refspecs?:string[], prune?:boolean, tagsMode?:\"default\"|\"tags\"|\"no-tags\"}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:write\",\"network:egress\"]}}；这是 remote-network 风险，禁止改用 shell、pull、push 或任意 git 子命令。",
    "当用户要 pull、拉取并整合远端变更时，必须使用 git.pullRemoteChanges。调用形状必须是 {target:{repositoryPath, remoteName?:\"origin\", branchName?:\"main\", integrationMode?:\"merge\"|\"rebase\"|\"ff-only\", autostash?:boolean, prune?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:write\",\"network:egress\"]}}；这是 remote-network 且可能改工作树的风险，禁止改用 shell、fetch、push 或任意 git 子命令。",
    "当用户要 push、推送本地分支/标签、设置 upstream、delete remote branch 或 force-with-lease 时，必须使用 git.pushLocalChanges。调用形状必须是 {target:{repositoryPath, remoteName:\"origin\", branchName?:\"main\", setUpstream?:boolean, forceWithLease?:boolean, pushTags?:boolean, deleteRemoteBranch?:boolean}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"git:read\",\"git:write\",\"filesystem:read\",\"network:egress\"]}}；这是 remote-network 风险，forceWithLease/deleteRemoteBranch 是 destructive 风险，禁止改用 shell、fetch、pull 或任意 git 子命令。",
    "Git 三家实践认知：Claude Code 常通过 shell/tool permission pattern 包住 git；Codex 更强调 sandbox/runtime executor；Gemini CLI 有 shell policy 与 GitService/checkpoint 经验；Praxis 在 lab 中统一为 fixed-action gitBase + BaseToolExecutorPort.git.runGit。",
    "当用户要联网搜索、查最新资料、查官方文档或要求 provider 原生 web search 时，必须优先使用 search.nativeSearch。",
    "search.nativeSearch 是 OpenAI / Anthropic / DeepMind 官方 provider-native 网络搜索，不是本地文件搜索，也不是普通搜索引擎。必须提供 target: { provider, query }；provider 只能是 openai、anthropic、deepmind。",
    "search.nativeSearch 真实执行时必须设置 context: { dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"network:search\",\"search:native\"] }。如果用户没有指定 provider，默认使用 openai。",
    "search.fetch 只用于抓取明确 URL；search.searchEngine 用于通用/自建搜索引擎；search.ground 用于基于证据生成带引用答案。不要把这三个和 search.nativeSearch 混用。",
    "search.fetch 真实执行必须设置 context: { dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"network:read\",\"search:fetch\"] }。",
    "search.searchEngine 真实执行必须设置 context: { dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"network:search\"] }。",
    "search.ground 真实执行必须设置 context: { dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"search:read\",\"grounding:audit\"] }。",
    "当用户要把图片交给模型看、查看图片、传入图片或 view image 时，必须使用 omni.viewImage。调用形状必须是 {target:{imagePath或imageRef, mediaType?, detail?}, context:{dryRun:false, guard:{allowed:true, accepted:true}, grantedPermissions:[\"filesystem:read\",\"omni:image:view\"]}}。",
    "当用户要生成图片/音频/视频时，分别使用 omni.generateImage、omni.generateAudio、omni.generateVideo。必须提供 target.prompt 和 target.outputPath 或 outputRef；真实执行必须设置 dryRun:false、affirmative guard、provider:invoke 与对应 omni:*:generate/write 权限。",
    "当用户要压缩或转换图片/音频/视频格式时，分别使用 omni.imageCompressor、omni.audioCompressor、omni.videoCompressor 或 omni.imageFormatConversion、omni.audioFormatConversion、omni.videoFormatConversion。必须提供输入 path/ref 和输出 path/ref；不要改用 shell、ffmpeg 命令或 code 工具。",
    "当用户要听音频、转写音频或生成歌词时，使用 omni.listenAudio 或 omni.audioLyricsGeneration。必须提供输入 path/ref；runtime/modelAdapter 才负责解码、ASR、上传和 provider body lowering。",
    "当用户要看视频、理解视频或生成字幕时，使用 omni.viewVideo 或 omni.videoSubtitleGeneration。必须提供输入 path/ref；runtime 负责视频抽帧、字幕、上传、模型能力和 provider 兼容性判断。",
    "omniBase 只做 agent 可调用承托面：校验 target/context、dry-run、guard、public-safe error、registry handler 和 BaseToolExecutorPort.omni.transformMedia 转交。不要让 omni 工具自己读取文件、base64 编码、调用 ffmpeg、选择模型 endpoint、自动调用 shell/code 或串联其他 omni 工具。",
    "omni.viewImage 工具调用示例：",
    '{"tool_calls":[{"tool":"omni.viewImage","arguments":{"target":{"imagePath":"/workspace/media/source.png","mediaType":"image/png","detail":"high"},"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true},"grantedPermissions":["filesystem:read","omni:image:view"]}}}]}',
    "如果你需要工具，请只输出 JSON，不要加解释：",
    '{"tool_calls":[{"tool":"code.read","arguments":{"path":"Praxis_Agent_Architecture/package.json"}}]}',
    "网络搜索工具调用示例：",
    '{"tool_calls":[{"tool":"search.nativeSearch","arguments":{"target":{"provider":"openai","query":"OpenAI Responses web_search citations","maxResults":3,"citations":"required"},"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true},"grantedPermissions":["network:search","search:native"]}}}]}',
    "如果不需要工具，请输出 JSON：",
    '{"answer":"你的回答"}',
    "可用工具很多，样例工具如下：",
    sampleTools,
    "当前已有真实执行器的工具包括：tool.catalog, code.read, code.scan, code.search_Ripgrep, code.replaceFile, code.overwrite, code.modify, code.delete, code.format, code.testCode, code.benchmark, code.debugCollectLogs, code.debugCaptureState, code.debugRun, code.lsp_scanDocumentSymbols, code.lsp_searchWorkspaceSymbols, code.lsp_locateDefinition, code.lsp_locateTypeDefinition, code.lsp_traceReferences, code.lsp_traceImplementations, code.lsp_completeCode, code.lsp_assistSignature, code.lsp_explainSymbol, code.lsp_inspectSymbol, code.lsp_inspectDiagnostics, code.lsp_suggestCodeActions, code.lsp_applyCodeAction, code.lsp_renameSymbol, code.lsp_formatDocument, code.lsp_formatRange, code.write, code.append, shell.commandExecution, shell.scriptExecution, git.getRepositoryStatus, git.getWorkingTreeDiff, git.getCommitHistory, git.showGitObjectDetails, git.traceLineOwnership, git.checkoutTarget, git.manageBranch, git.manageTag, git.mergeBranch, git.rebaseBranch, git.switchBranch, git.manageIgnoreRules, git.moveOrRenameFile, git.removeTrackedFile, git.addToStaging, git.resetStagingOrCommit, git.restoreWorkingTree, git.stashChanges, git.applyStashChanges, git.popStashChanges, git.cleanUntrackedFiles, git.createCommit, git.amendLastCommit, git.cherryPickCommit, git.revertCommit, git.initializeRepository, git.cloneRepository, git.archiveRepository, git.locateProblemCommit, git.manageSubmodule, git.manageWorktree, git.manageRemote, git.fetchRemoteUpdates, git.pullRemoteChanges, git.pushLocalChanges, search.nativeSearch, search.fetch, search.searchEngine, search.ground, mcp.authenticate, mcp.authorize, mcp.cache, mcp.invalidateCache, mcp.connect, mcp.disconnect, mcp.subscribe, mcp.unsubscribe, mcp.call, mcp.stream, mcp.cancel, mcp.nativeExecute, mcp.listTools, mcp.registerTool, mcp.updateTool, mcp.unregisterTool, mcp.listResources, mcp.readResource, mcp.createResource, mcp.updateResource, mcp.deleteResource, mcp.ping, mcp.healthCheck, omni.viewImage, omni.generateImage, omni.imageCompressor, omni.imageFormatConversion, omni.listenAudio, omni.generateAudio, omni.audioCompressor, omni.audioFormatConversion, omni.audioLyricsGeneration, omni.viewVideo, omni.generateVideo, omni.videoCompressor, omni.videoFormatConversion, omni.videoSubtitleGeneration。",
    "注意：shell 工具只用于明确的 shell/命令执行测试，不用于代码阅读、目录扫描或文本搜索。",
    `当前 agent: ${agent.id}, runtimeId=${agent.runtimeId}, sessionId=${agent.sessionId}`,
    transcript.length > 0 ? `对话历史：\n${transcript}` : "",
    `用户输入：\n${userText}`,
  ].join("\n\n");
}

async function askAgent(userText: string): Promise<void> {
  const history = histories.get(activeAgent.id) ?? [];
  let prompt = buildToolAwarePrompt(activeAgent, history, userText);
  const toolResults: ToolResult[] = [];
  const successfulToolCallKeys = new Set<string>();
  logEvent("agent.turn.started", { userText });

  for (let round = 0; round < maxToolRounds; round += 1) {
    const modelText = await callModel(prompt);
    logEvent("agent.model.output", { round, modelText });
    const parsed = extractJsonObject(modelText);
    const toolCalls = normalizeToolCalls(parsed);

    if (toolCalls.length === 0) {
      const answer = typeof parsed === "object" && parsed !== null && typeof (parsed as Record<string, unknown>).answer === "string"
        ? String((parsed as Record<string, unknown>).answer)
        : modelText;
      history.push({ role: "user", content: userText }, { role: "assistant", content: answer });
      activeAgent.turns += 1;
      console.log(`agentCore> ${answer}`);
      if (toolResults.length > 0) {
        history.push({ role: "tool", content: JSON.stringify(toolResults) });
      }
      logEvent("agent.turn.finished", { answer, toolResults, roundsUsed: round + 1 });
      return;
    }

    logEvent("agent.tool_calls.requested", { round, toolCalls });
    for (const call of toolCalls) {
      const callKey = `${call.tool}\0${JSON.stringify(call.arguments ?? {})}`;
      if (successfulToolCallKeys.has(callKey)) {
        const result = {
          tool: call.tool,
          ok: true,
          output: {
            skippedDuplicate: true,
            reason: "same tool call already succeeded in this turn; answer from the existing result instead of repeating side effects",
          },
        };
        toolResults.push(result);
        logEvent("agent.tool_call.skipped_duplicate", { round, call });
        console.log(`tool:${call.tool}> ${JSON.stringify(result).slice(0, 1600)}`);
        continue;
      }
      const result = await runTool(call.tool, call.arguments ?? {}, userText);
      toolResults.push(result);
      if (result.ok) {
        successfulToolCallKeys.add(callKey);
      }
      console.log(`tool:${call.tool}> ${JSON.stringify(result).slice(0, 1600)}`);
    }

    prompt = [
      buildToolAwarePrompt(activeAgent, history, userText),
      "刚才的工具执行结果如下，请继续。如果还需要工具，继续输出 tool_calls JSON；如果已经能回答，输出 answer JSON。不要重复调用已经成功的同一个工具。代码探索失败时仍然禁止切到 shell，只能继续用 code.scan/code.search_Ripgrep 或直接说明找不到。",
      JSON.stringify(toolResults).slice(0, maxOutputBytes),
    ].join("\n\n");
  }

  const finalPrompt = [
    buildToolAwarePrompt(activeAgent, history, userText),
    `工具轮次已经达到上限 ${maxToolRounds}，现在禁止继续调用任何工具。`,
    "请只输出 JSON：{\"answer\":\"...\"}。",
    "根据已有工具结果给出最终回答；如果目标路径不存在或没有找到匹配项，直接说明这一点。",
    JSON.stringify(toolResults).slice(0, maxOutputBytes),
  ].join("\n\n");
  const finalText = await callModel(finalPrompt);
  const finalParsed = extractJsonObject(finalText);
  const finalAnswer = typeof finalParsed === "object" && finalParsed !== null && typeof (finalParsed as Record<string, unknown>).answer === "string"
    ? String((finalParsed as Record<string, unknown>).answer)
    : finalText;
  history.push({ role: "user", content: userText }, { role: "assistant", content: finalAnswer });
  if (toolResults.length > 0) {
    history.push({ role: "tool", content: JSON.stringify(toolResults) });
  }
  activeAgent.turns += 1;
  console.log(`agentCore> ${finalAnswer}`);
  logEvent("agent.turn.tool_round_limit_final_answer", { userText, toolResults, finalAnswer });
}

function printBanner(): void {
  console.log("agentCore tool lab is ready");
  console.log(`repoRoot=${repoRoot}`);
  console.log(`logRoot=${logRoot}`);
  console.log(`model=${model}`);
  console.log(`reasoning.effort=${reasoningEffort}`);
  console.log(`tools.visible=${toolCatalog.length}`);
  console.log("commands: /agents, /agent create <id>, /agent use <id>, /tools [query], /tool <toolId> <json>, /log, /status, /exit");
  console.log("");
}

async function handleCommand(line: string): Promise<boolean> {
  logEvent("command.received", { line });
  if (line === "/exit" || line === "/quit") {
    logEvent("lab.exit.requested", {});
    return false;
  }

  if (line === "/status") {
    console.log(JSON.stringify({ activeAgent, assembly: assemblies.get(activeAgent.id), agents: [...agents.values()], toolCount: toolCatalog.length, model, baseUrl, logRoot, jsonlLogPath, summaryLogPath }, null, 2));
    return true;
  }

  if (line === "/log" || line === "/logs") {
    const content = existsSync(jsonlLogPath) ? readFileSync(jsonlLogPath, "utf8") : "";
    const recent = content.trim().split(/\r?\n/u).filter(Boolean).slice(-12);
    console.log(JSON.stringify({ logRoot, jsonlLogPath, summaryLogPath, recent }, null, 2));
    return true;
  }

  if (line === "/agents") {
    console.log(JSON.stringify([...agents.values()], null, 2));
    return true;
  }

  if (line.startsWith("/agent create ")) {
    const id = line.slice("/agent create ".length).trim();
    activeAgent = createLabAgent(id);
    logEvent("agent.created", { agent: activeAgent });
    console.log(`activeAgent=${activeAgent.id}`);
    return true;
  }

  if (line.startsWith("/agent use ")) {
    const id = line.slice("/agent use ".length).trim();
    const agent = agents.get(id);
    if (agent === undefined) {
      console.log(`agent ${id} not found`);
      logEvent("agent.use.failed", { id });
    } else {
      activeAgent = agent;
      logEvent("agent.used", { agent: activeAgent });
      console.log(`activeAgent=${activeAgent.id}`);
    }
    return true;
  }

  if (line.startsWith("/tools")) {
    const query = line.slice("/tools".length).trim();
    const result = await runTool("tool.catalog", { query, limit: 160 });
    console.log(JSON.stringify(result, null, 2));
    return true;
  }

  if (line.startsWith("/tool ")) {
    const rest = line.slice("/tool ".length).trim();
    const space = rest.indexOf(" ");
    const tool = space === -1 ? rest : rest.slice(0, space);
    const args = space === -1 ? {} : JSON.parse(rest.slice(space + 1)) as Record<string, unknown>;
    console.log(JSON.stringify(await runTool(tool, args), null, 2));
    return true;
  }

  await askAgent(line);
  return true;
}

async function main(): Promise<void> {
  await initializeLogs();
  logEvent("agent.created", { agent: activeAgent, initial: true });
  await appendFile(summaryLogPath, `\n## Initial agent\n\n- id: ${activeAgent.id}\n- runtimeId: ${activeAgent.runtimeId}\n- sessionId: ${activeAgent.sessionId}\n`, "utf8");
  printBanner();
  const rl = readline.createInterface({ input, output });
  output.write("lab> ");
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        output.write("lab> ");
        continue;
      }

      const keepGoing = await handleCommand(trimmed);
      if (!keepGoing) {
        break;
      }
      output.write("lab> ");
    }
  } finally {
    rl.close();
    logEvent("lab.closed", { runId });
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
