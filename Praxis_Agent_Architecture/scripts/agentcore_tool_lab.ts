import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { providePromptPackInput } from "../src/agentCore/agent_executionEngine/promptPack/promptProvider.js";
import { adaptRuntimeToolInvocation } from "../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { mountAgentApplication } from "../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";
import { createAgentApplicationRuntime } from "../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";
import { createAgentRuntimeClient } from "../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";
import { createAgentRuntime } from "../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";
import { createBehaviorExposureRuntime } from "../src/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorExposureRuntime.js";
import { createCapabilityExposureRuntimeSnapshot } from "../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityExposureRuntime.js";
import type { RuntimeCapabilityDescriptor } from "../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.js";
import { bindBasicToolLayer } from "../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindBasicToolLayer.js";
import { bridgeExecEngineInvocation } from "../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";
import { createRuntimeAccessSession } from "../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import { createRuntimeManagementPlane } from "../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";
import { openRuntimeOperatorConsole } from "../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";
import { createRuntimeSurfaceRegistry } from "../src/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.js";

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
const architectureRoot = path.resolve(path.dirname(scriptPath), "..");
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

function scanDirectory(root: string, limit: number): string[] {
  const outputPaths: string[] = [];

  function walk(current: string): void {
    if (outputPaths.length >= limit) {
      return;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      outputPaths.push(path.relative(repoRoot, absolutePath).split(path.sep).join("/") + (entry.isDirectory() ? "/" : ""));
      if (entry.isDirectory()) {
        walk(absolutePath);
      }

      if (outputPaths.length >= limit) {
        return;
      }
    }
  }

  walk(root);
  return outputPaths;
}

async function runTool(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const startedAt = Date.now();
  logEvent("tool.started", { tool, args });
  const agentCoreEnvelopeFailure = createAgentCoreToolInvocationEnvelope(tool, args);
  if (agentCoreEnvelopeFailure !== undefined) {
    logEvent("tool.finished", { ...agentCoreEnvelopeFailure, durationMs: Date.now() - startedAt });
    return agentCoreEnvelopeFailure;
  }

  try {
    const normalized = tool.trim();

    if (normalized === "tool.catalog" || normalized === "tools.list") {
      const query = typeof args.query === "string" ? args.query : "";
      const tools = query.length > 0
        ? toolCatalog.filter((entry) => entry.toolId.includes(query) || entry.sourcePath.includes(query))
        : toolCatalog;
      const result = { tool, ok: true, output: { count: tools.length, tools: tools.slice(0, Number(args.limit ?? 120)) } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.read" || normalized.endsWith(".read")) {
      const target = resolveAnyPath(args.path ?? args.targetPath ?? args.file);
      const content = readFileSync(target, "utf8");
      const startLine = Number(args.startLine ?? 1);
      const endLine = args.endLine === undefined ? undefined : Number(args.endLine);
      const lines = content.split(/\r?\n/);
      const selected = lines.slice(Math.max(0, startLine - 1), endLine ?? lines.length).join("\n");
      const result: ToolResult = {
        tool,
        ok: true,
        output: {
          path: target,
          exists: true,
          size: statSync(target).size,
          content: limitText(selected),
        },
      };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.scan" || normalized === "code.list") {
      const root = resolveAnyPath(args.path ?? args.directory ?? args.directoryPath, ".");
      const result = { tool, ok: true, output: { root, paths: scanDirectory(root, Number(args.limit ?? 200)) } };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "code.search_Ripgrep" || normalized === "skill.ripgrep") {
      const query = String(args.query ?? args.pattern ?? "");
      const directory = resolveAnyPath(args.path ?? args.directoryPath ?? args.cwd, ".");
      const rgArgs = ["--line-number", "--column", "--max-count", String(args.maxMatches ?? 80), query, "."];
      const result = { tool, ok: true, output: runProcess("rg", rgArgs, directory) };
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

    if (normalized === "git.getRepositoryStatus") {
      const result = { tool, ok: true, output: runProcess("git", ["status", "--short", "--branch"], resolveAnyPath(args.cwd, ".")) };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "git.getWorkingTreeDiff") {
      const result = { tool, ok: true, output: runProcess("git", ["diff", "--", "."], resolveAnyPath(args.cwd, ".")) };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized === "git.getCommitHistory") {
      const result = {
        tool,
        ok: true,
        output: runProcess("git", ["log", "--oneline", "--decorate", "-n", String(args.limit ?? 12)], resolveAnyPath(args.cwd, ".")),
      };
      logEvent("tool.finished", { ...result, durationMs: Date.now() - startedAt });
      return result;
    }

    if (normalized.startsWith("git.")) {
      const subcommand = String(args.subcommand ?? normalized.replace(/^git\./u, ""));
      const commandArgs = Array.isArray(args.args) ? args.args.map(String) : [];
      const result = { tool, ok: true, output: runProcess("git", [subcommand, ...commandArgs], resolveAnyPath(args.cwd, ".")) };
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
  const fenced = text.match(/```json\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
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

  return rawCalls
    .map((rawCall) => {
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
    .filter((call): call is ToolCall => call !== undefined);
}

function buildToolAwarePrompt(agent: LabAgent, history: readonly ChatMessage[], userText: string): string {
  const sampleTools = toolCatalog.slice(0, 80).map((entry) => entry.toolId).join(", ");
  const transcript = history.slice(-12).map((message) => `${message.role}: ${message.content}`).join("\n");
  return [
    "你是 Praxis agentCore 的临时全工具测试 agent。",
    "当前阶段是功能测试，agentCore 侧不做治理拦截，所有工具都对你可见。",
    "如果你需要工具，请只输出 JSON，不要加解释：",
    '{"tool_calls":[{"tool":"code.read","arguments":{"path":"Praxis_Agent_Architecture/package.json"}}]}',
    "如果不需要工具，请输出 JSON：",
    '{"answer":"你的回答"}',
    "可用工具很多，样例工具如下：",
    sampleTools,
    "当前已有真实执行器的工具包括：tool.catalog, code.read, code.scan, code.search_Ripgrep, code.write, code.append, code.delete, shell.commandExecution, shell.scriptExecution, git.getRepositoryStatus, git.getWorkingTreeDiff, git.getCommitHistory, search.fetch。",
    `当前 agent: ${agent.id}, runtimeId=${agent.runtimeId}, sessionId=${agent.sessionId}`,
    transcript.length > 0 ? `对话历史：\n${transcript}` : "",
    `用户输入：\n${userText}`,
  ].join("\n\n");
}

async function askAgent(userText: string): Promise<void> {
  const history = histories.get(activeAgent.id) ?? [];
  let prompt = buildToolAwarePrompt(activeAgent, history, userText);
  const toolResults: ToolResult[] = [];
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
      const result = await runTool(call.tool, call.arguments ?? {});
      toolResults.push(result);
      console.log(`tool:${call.tool}> ${JSON.stringify(result).slice(0, 1600)}`);
    }

    prompt = [
      buildToolAwarePrompt(activeAgent, history, userText),
      "刚才的工具执行结果如下，请继续。如果还需要工具，继续输出 tool_calls JSON；如果已经能回答，输出 answer JSON。",
      JSON.stringify(toolResults).slice(0, maxOutputBytes),
    ].join("\n\n");
  }

  console.log(`agentCore> 工具轮次已达到上限 ${maxToolRounds}，请收窄测试目标。`);
  logEvent("agent.turn.tool_round_limit", { userText, toolResults });
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
