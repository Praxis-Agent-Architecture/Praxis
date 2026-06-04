import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCredentialRef } from "../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createChatGPTCodexAuthEnvelope } from "../src/modelAdapter/authProfileLayer/codexAuth.js";
import { compileAgent, harness, loop, model, policy, PraxisAgent, toolPolicies } from "../src/runtimeImplementation/runtimeAgentManifest.js";
import { createPraxisRuntimeKernel, type AgentModelCacheDebugRecord, type AgentModelCallProgressEvent } from "../src/runtimeImplementation/praxisRuntimeKernel.js";
import { createMcpRuntimeAdapter, type McpRuntimeServerProfile } from "../src/runtimeImplementation/runtime.execEngine/mcpRuntimeAdapter.js";
import { analyzeExecutionMonitor } from "../src/runtimeImplementation/runtime.executionMonitor/index.js";
import { mcp, type McpHarnessModuleSpec, type McpHarnessServerSpec } from "../src/runtimeImplementation/runtime.mcpPlane/index.js";

type DiscoveredServer = {
  serverId: string;
  title: string;
  summary: string;
  profile: Extract<McpRuntimeServerProfile, { transport: "stdio" }>;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
};

type LiveCallProbe = {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

type LiveCallProbeResult = LiveCallProbe & {
  ok: boolean;
  outputPreview?: string;
  error?: string;
};

type RuntimeToolFlowSummary = {
  mode: "native" | "mcp-plus";
  ok: boolean;
  providerToolName?: string;
  toolId?: string;
  toolCallCount: number;
  toolCallOkCount: number;
  toolOutputPreview?: string;
  outputPreview?: string;
};

const repoRoot = path.resolve(import.meta.dirname, "..");
const runRoot = process.env.PRAXIS_MCP_SMOKE_DIR
  ? path.resolve(process.env.PRAXIS_MCP_SMOKE_DIR)
  : path.join(os.tmpdir(), `praxis-mcp-smoke-${Date.now()}`);

const SERVER_PROFILES: Array<{
  serverId: string;
  title: string;
  summary: string;
  profile: Extract<McpRuntimeServerProfile, { transport: "stdio" }>;
}> = [
  {
    serverId: "filesystem-praxis",
    title: "Filesystem Praxis",
    summary: "Filesystem MCP server scoped to the Praxis repository.",
    profile: {
      serverId: "filesystem-praxis",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", repoRoot],
      cwd: repoRoot,
      timeoutMs: 20_000,
    },
  },
  {
    serverId: "filesystem-tmp",
    title: "Filesystem Tmp",
    summary: "Filesystem MCP server scoped to /tmp.",
    profile: {
      serverId: "filesystem-tmp",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", os.tmpdir()],
      cwd: repoRoot,
      timeoutMs: 20_000,
    },
  },
  {
    serverId: "memory",
    title: "Memory",
    summary: "Reference memory graph MCP server.",
    profile: {
      serverId: "memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      cwd: repoRoot,
      timeoutMs: 20_000,
    },
  },
  {
    serverId: "sequential-thinking",
    title: "Sequential Thinking",
    summary: "Structured reasoning MCP server.",
    profile: {
      serverId: "sequential-thinking",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      cwd: repoRoot,
      timeoutMs: 20_000,
    },
  },
  {
    serverId: "everything",
    title: "Everything",
    summary: "Reference MCP server with broad protocol examples.",
    profile: {
      serverId: "everything",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      cwd: repoRoot,
      timeoutMs: 20_000,
    },
  },
  {
    serverId: "playwright",
    title: "Playwright",
    summary: "Browser automation through Playwright MCP.",
    profile: {
      serverId: "playwright",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--headless"],
      cwd: repoRoot,
      timeoutMs: 30_000,
    },
  },
  {
    serverId: "time",
    title: "Time",
    summary: "Time and timezone conversion MCP server.",
    profile: {
      serverId: "time",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-time", "--local-timezone", "UTC"],
      cwd: repoRoot,
      timeoutMs: 30_000,
    },
  },
  {
    serverId: "fetch",
    title: "Fetch",
    summary: "HTTP fetch MCP server.",
    profile: {
      serverId: "fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
      cwd: repoRoot,
      timeoutMs: 30_000,
    },
  },
  {
    serverId: "git",
    title: "Git",
    summary: "Git repository MCP server scoped to Praxis.",
    profile: {
      serverId: "git",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-git", "--repository", repoRoot],
      cwd: repoRoot,
      timeoutMs: 30_000,
    },
  },
  {
    serverId: "sqlite",
    title: "SQLite",
    summary: "SQLite MCP server backed by a temporary database.",
    profile: {
      serverId: "sqlite",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-sqlite", "--db-path", path.join(os.tmpdir(), "praxis-mcp-smoke.sqlite")],
      cwd: repoRoot,
      timeoutMs: 30_000,
    },
  },
];

class McpSmokeAgent extends PraxisAgent {
  identity = "agent.mcp-smoke";
  model = model("gpt-5.4", { carrierId: "carrier.mcp-smoke" });
  toolPolicy = toolPolicies.bapr();
  harness = harness({
    tools: mcp.recommendedTools(),
    policy: policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list"],
    }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1, maxToolCalls: 0 }),
  });
}

class McpSmokeToolFlowAgent extends PraxisAgent {
  identity = "agent.mcp-smoke-tool-flow";
  model = model("gpt-5.4", { carrierId: "carrier.mcp-smoke-tool-flow" });
  toolPolicy = toolPolicies.bapr();
  harness = harness({
    tools: mcp.recommendedTools(),
    policy: policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call"],
    }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
  });
}

function authEnvelope() {
  const ref = createCredentialRef({
    id: "mcp-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "mcp-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create MCP smoke credential ref.");
  return createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "mcp-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "mcp-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function jsonl(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function toolManifest(server: DiscoveredServer) {
  const pinnedCount = server.tools.length <= 3 ? server.tools.length : 2;
  const pinnedTools = server.tools.slice(0, pinnedCount).map((tool) => tool.name);
  const indexedTools = server.tools.slice(pinnedCount).map((tool) => tool.name);
  return {
    server: {
      id: server.serverId,
      title: server.title,
      summary: server.summary,
    },
    exposure: {
      pinnedTools,
      indexedTools,
      toolCards: Object.fromEntries(server.tools.slice(pinnedCount).map((tool) => [tool.name, {
        title: tool.name,
        summary: tool.description ?? tool.name,
        keywords: tool.name.split(/[^a-zA-Z0-9]+/u).filter(Boolean),
      }])),
    },
  };
}

function moduleFor(mode: "native" | "mcp-plus", discovered: readonly DiscoveredServer[]): McpHarnessModuleSpec {
  const servers: McpHarnessServerSpec[] = discovered.map((server) => ({
    ...server.profile,
    serverId: server.serverId,
    title: server.title,
    summary: server.summary,
    mode,
    ...(mode === "mcp-plus" ? { manifest: toolManifest(server) } : {}),
  }));
  return mcp.module({ servers, metadata: { source: "automations.mcp-plus-native-smoke", mode } });
}

function outputPreview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, 500);
}

function liveCallProbesFor(discovered: readonly DiscoveredServer[]): LiveCallProbe[] {
  const servers = new Map(discovered.map((server) => [server.serverId, new Set(server.tools.map((tool) => tool.name))]));
  const probes: LiveCallProbe[] = [
    {
      serverId: "filesystem-praxis",
      toolName: "list_allowed_directories",
      arguments: {},
    },
    {
      serverId: "filesystem-tmp",
      toolName: "list_allowed_directories",
      arguments: {},
    },
    {
      serverId: "memory",
      toolName: "read_graph",
      arguments: {},
    },
    {
      serverId: "sequential-thinking",
      toolName: "sequentialthinking",
      arguments: {
        thought: "Praxis MCP smoke probe.",
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
      },
    },
    {
      serverId: "everything",
      toolName: "echo",
      arguments: { message: "praxis mcp smoke" },
    },
    {
      serverId: "playwright",
      toolName: "browser_navigate",
      arguments: { url: "data:text/html,<title>Praxis MCP Smoke</title><main>Praxis MCP smoke probe</main>" },
    },
    {
      serverId: "playwright",
      toolName: "browser_snapshot",
      arguments: { depth: 2 },
    },
    {
      serverId: "time",
      toolName: "get_current_time",
      arguments: { timezone: "UTC" },
    },
    {
      serverId: "fetch",
      toolName: "fetch",
      arguments: { url: "https://example.com", max_length: 300 },
    },
    {
      serverId: "git",
      toolName: "git_status",
      arguments: { repo_path: repoRoot },
    },
    {
      serverId: "sqlite",
      toolName: "read_query",
      arguments: { query: "select 1 as praxis_mcp_smoke" },
    },
  ];
  return probes.filter((probe) => servers.get(probe.serverId)?.has(probe.toolName) === true);
}

async function runLiveCallProbes(discovered: readonly DiscoveredServer[]): Promise<LiveCallProbeResult[]> {
  const adapter = createMcpRuntimeAdapter({ servers: SERVER_PROFILES.map((server) => server.profile) });
  const results: LiveCallProbeResult[] = [];
  try {
    for (const probe of liveCallProbesFor(discovered)) {
      const called = await adapter.callTool?.({
        serverId: probe.serverId,
        toolName: probe.toolName,
        arguments: probe.arguments,
      });
      const result: LiveCallProbeResult = called?.ok === true
        ? {
            ...probe,
            ok: true,
            outputPreview: outputPreview(called.output),
          }
        : {
            ...probe,
            ok: false,
            error: called?.ok === false ? called.error.message : "missing callTool result",
          };
      results.push(result);
      console.log(`[probe] ${probe.serverId}.${probe.toolName}: ${result.ok ? "ok" : `failed: ${result.error}`}`);
      if (!result.ok) throw new Error(`Live MCP call probe failed for ${probe.serverId}.${probe.toolName}: ${result.error}`);
    }
  } finally {
    await adapter.callTool?.({ serverId: "playwright", toolName: "browser_close", arguments: {} });
    await adapter.shutdown?.({});
  }
  return results;
}

async function runRuntimeToolFlow(mode: "native" | "mcp-plus", discovered: readonly DiscoveredServer[]): Promise<RuntimeToolFlowSummary> {
  const compiled = compileAgent(McpSmokeToolFlowAgent, {
    compiledAt: "2026-06-05T00:00:00.000Z",
    manifestId: `manifest.mcp-smoke.tool-flow.${mode}`,
  });
  if (!compiled.ok) throw new Error(`Failed to compile ${mode} MCP tool-flow smoke agent.`);

  let calls = 0;
  let providerToolName: string | undefined;
  const result = await createPraxisRuntimeKernel({ runtimeId: `runtime-real-mcp-tool-flow-${mode}` }).runManifest(
    compiled.manifest,
    `Call the everything echo MCP tool through ${mode} runtime tool flow.`,
    {
      sessionId: `session-real-mcp-tool-flow-${mode}`,
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      mcpModule: moduleFor(mode, discovered),
      mcpPlus: { projectId: "project.mcp-smoke" },
      providerCaller: async (envelope) => {
        calls += 1;
        const body = envelope.body as { tools?: readonly { name?: string }[] };
        providerToolName ??= body.tools
          ?.map((item) => item.name)
          .find((name): name is string => typeof name === "string" && name.includes("mcp_everything_echo"));
        if (calls === 1) {
          if (providerToolName === undefined) {
            throw new Error(`${mode} tool-flow did not expose everything.echo provider tool.`);
          }
          return {
            output: [{
              type: "function_call",
              name: providerToolName,
              call_id: `${mode}-everything-echo`,
              arguments: JSON.stringify({ message: `praxis ${mode} runtime tool flow` }),
            }],
          };
        }
        return { output_text: `${mode} runtime MCP tool flow completed` };
      },
      now: () => "2026-06-05T00:00:00.000Z",
    },
  );
  if (!result.ok) throw new Error(`${mode} runtime tool-flow failed: ${JSON.stringify(result.error)}`);
  const toolCall = result.toolCalls[0];
  const summary: RuntimeToolFlowSummary = {
    mode,
    ok: result.ok,
    providerToolName,
    toolId: toolCall?.toolId,
    toolCallCount: result.toolCalls.length,
    toolCallOkCount: result.toolCalls.filter((toolCall) => toolCall.ok).length,
    toolOutputPreview: outputPreview(toolCall?.output),
    outputPreview: outputPreview(result.outputText),
  };
  if (summary.toolCallCount !== 1 || summary.toolCallOkCount !== 1) {
    throw new Error(`${mode} runtime tool-flow expected one successful MCP tool call, got ${JSON.stringify(summary)}`);
  }
  if (!summary.toolOutputPreview?.includes(`praxis ${mode} runtime tool flow`)) {
    throw new Error(`${mode} runtime tool-flow did not capture the expected MCP echo output: ${summary.toolOutputPreview ?? "empty"}`);
  }
  console.log(`[tool-flow] ${mode}: ${JSON.stringify(summary)}`);
  return summary;
}

async function discover(): Promise<DiscoveredServer[]> {
  const adapter = createMcpRuntimeAdapter({ servers: SERVER_PROFILES.map((server) => server.profile) });
  const discovered: DiscoveredServer[] = [];
  try {
    for (const server of SERVER_PROFILES) {
      const listed = await adapter.listTools?.({ serverId: server.serverId });
      if (listed?.ok !== true) {
        throw new Error(`Failed to list ${server.serverId}: ${listed?.ok === false ? listed.error.message : "missing listTools result"}`);
      }
      discovered.push({
        ...server,
        tools: listed.output.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
      console.log(`[discover] ${server.serverId}: ${listed.output.tools.length} tools`);
    }
    return discovered;
  } finally {
    await adapter.shutdown?.({});
  }
}

function eventFromProgress(mode: string, progress: AgentModelCallProgressEvent & { cacheDebug?: AgentModelCacheDebugRecord }) {
  const cacheDebug = progress.cacheDebug;
  const estimatedInput = cacheDebug?.providerBody.cacheShape.providerStablePrefixEstimatedTokens ?? 0;
  const estimatedDynamic = cacheDebug?.providerBody.cacheShape.providerDynamicInputEstimatedTokens ?? 0;
  return {
    eventId: `event.${mode}.model.${progress.phase}`,
    kind: "model",
    status: progress.phase === "completed" ? "completed" : progress.phase,
    message: `${mode} MCP smoke model call ${progress.phase}`,
    createdAt: "2026-06-05T00:00:00.000Z",
    sessionId: `session-real-mcp-${mode}`,
    runtimeId: `runtime-real-mcp-${mode}`,
    turnId: `turn-real-mcp-${mode}-1`,
    publicSafe: true,
    metadata: {
      modelPhase: progress.phase,
      invocationId: progress.invocationId,
      turnIndex: progress.turnIndex,
      provider: progress.provider,
      carrierId: progress.carrierId,
      model: progress.model,
      usage: {
        inputTokens: estimatedInput,
        cachedInputTokens: 0,
        outputTokens: 1,
        totalTokens: estimatedInput + estimatedDynamic + 1,
        estimated: true,
      },
      cacheDebug,
    },
  };
}

async function runMode(mode: "native" | "mcp-plus", discovered: readonly DiscoveredServer[]) {
  const runDir = path.join(runRoot, mode);
  await mkdir(runDir, { recursive: true });
  const events: unknown[] = [];
  const cacheDebugs: AgentModelCacheDebugRecord[] = [];
  const compiled = compileAgent(McpSmokeAgent, {
    compiledAt: "2026-06-05T00:00:00.000Z",
    manifestId: `manifest.mcp-smoke.${mode}`,
  });
  if (!compiled.ok) throw new Error(`Failed to compile ${mode} MCP smoke agent.`);

  const result = await createPraxisRuntimeKernel({ runtimeId: `runtime-real-mcp-${mode}` }).runManifest(
    compiled.manifest,
    `Run ${mode} MCP smoke without calling tools.`,
    {
      sessionId: `session-real-mcp-${mode}`,
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: false,
      auth: authEnvelope(),
      mcpModule: moduleFor(mode, discovered),
      mcpPlus: { projectId: "project.mcp-smoke" },
      providerCaller: async () => ({
        output_text: `${mode} smoke ok`,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
      onModelCallProgress: async (progress) => {
        if (progress.phase === "completed" && progress.cacheDebug !== undefined) {
          cacheDebugs.push(progress.cacheDebug);
          events.push(eventFromProgress(mode, progress));
        }
      },
      now: () => "2026-06-05T00:00:00.000Z",
    },
  );
  if (!result.ok) throw new Error(`${mode} runManifest failed.`);
  if (cacheDebugs[0] === undefined) throw new Error(`${mode} did not emit cacheDebug`);

  await writeFile(path.join(runDir, "events.jsonl"), events.map(jsonl).join(""), "utf8");
  await writeFile(path.join(runDir, "views.jsonl"), "", "utf8");
  await writeFile(path.join(runDir, "config.json"), `${JSON.stringify({ mode, serverIds: discovered.map((server) => server.serverId) }, null, 2)}\n`, "utf8");

  const report = analyzeExecutionMonitor({
    events: events as never,
    views: [],
    runDir,
    profileName: `mcp-smoke-${mode}`,
    project: repoRoot,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  await writeFile(path.join(runDir, "execution-monitor.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const cache = cacheDebugs[0];
  const toolRefs = cache.promptPack.segments.find((segment) => segment.segmentKind === "toolDeclarations")?.materialRefs ?? [];
  const summary = {
    mode,
    runDir,
    providerToolCount: cache.providerBody.toolCount,
    toolsEstimatedTokens: cache.providerBody.toolsEstimatedTokens,
    providerStablePrefixEstimatedTokens: cache.providerBody.cacheShape.providerStablePrefixEstimatedTokens,
    providerDynamicInputEstimatedTokens: cache.providerBody.cacheShape.providerDynamicInputEstimatedTokens,
    promptPackTotalEstimatedTokens: cache.promptPack.totalEstimatedTokens,
    cacheablePrefixEstimatedTokens: cache.promptPack.cacheablePrefixEstimatedTokens,
    sidecarPresent: toolRefs.includes("runtime:mcp-plus-native-exposure"),
    mcpGroups: toolRefs
      .filter((ref) => ref.startsWith("baseTool:context:group:mcp:"))
      .map((ref) => ref.slice("baseTool:context:group:mcp:".length)),
    monitorFindingIds: report.findings.map((finding) => finding.id),
    monitorHealthGrade: report.project.health.grade,
  };
  await writeFile(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`[${mode}] ${JSON.stringify(summary)}`);
  return summary;
}

await mkdir(runRoot, { recursive: true });
const discovered = await discover();
const liveCallProbes = await runLiveCallProbes(discovered);
const nativeToolFlow = await runRuntimeToolFlow("native", discovered);
const mcpPlusToolFlow = await runRuntimeToolFlow("mcp-plus", discovered);
await writeFile(path.join(runRoot, "discovery.json"), `${JSON.stringify(discovered.map((server) => ({
  serverId: server.serverId,
  toolCount: server.tools.length,
  toolNames: server.tools.map((tool) => tool.name),
})), null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-call-probes.json"), `${JSON.stringify(liveCallProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "runtime-tool-flow.json"), `${JSON.stringify([nativeToolFlow, mcpPlusToolFlow], null, 2)}\n`, "utf8");
const native = await runMode("native", discovered);
const mcpPlus = await runMode("mcp-plus", discovered);
const comparison = {
  runRoot,
  serverCount: discovered.length,
  totalNativeToolsDiscovered: discovered.reduce((sum, server) => sum + server.tools.length, 0),
  liveCallProbeCount: liveCallProbes.length,
  liveCallProbeServers: [...new Set(liveCallProbes.map((probe) => probe.serverId))],
  runtimeToolFlows: [nativeToolFlow, mcpPlusToolFlow],
  native,
  mcpPlus,
  deltas: {
    providerToolCount: mcpPlus.providerToolCount - native.providerToolCount,
    toolsEstimatedTokens: mcpPlus.toolsEstimatedTokens - native.toolsEstimatedTokens,
    providerStablePrefixEstimatedTokens: mcpPlus.providerStablePrefixEstimatedTokens - native.providerStablePrefixEstimatedTokens,
    promptPackTotalEstimatedTokens: mcpPlus.promptPackTotalEstimatedTokens - native.promptPackTotalEstimatedTokens,
  },
};
await writeFile(path.join(runRoot, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
console.log(`[comparison] ${JSON.stringify(comparison, null, 2)}`);
