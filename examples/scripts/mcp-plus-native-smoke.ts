import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { createCredentialRef } from "../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createChatGPTCodexAuthEnvelope } from "../../src/modelAdapter/authProfileLayer/codexAuth.js";
import { compileAgent, harness, loop, model, policy, PraxisAgent, toolPolicies } from "../../src/runtimeImplementation/runtimeAgentManifest.js";
import { createPraxisRuntimeKernel, type AgentModelCacheDebugRecord, type AgentModelCallProgressEvent } from "../../src/runtimeImplementation/praxisRuntimeKernel.js";
import { createMcpRuntimeAdapter, type McpRuntimeServerProfile } from "../../src/runtimeImplementation/runtime.execEngine/mcpRuntimeAdapter.js";
import { runDevDoctor } from "../../src/devdoctor/index.js";
import type { ExecutionMonitorReport } from "../../src/runtimeImplementation/runtime.executionMonitor/index.js";
import {
  createInMemoryMcpPlusSkillStore,
  mcp,
  type McpHarnessModuleSpec,
  type McpHarnessServerSpec,
} from "../../src/runtimeImplementation/runtime.mcpPlane/index.js";

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

type LivePromptProbeResult = {
  serverId: string;
  operation: "list" | "get";
  name?: string;
  ok: boolean;
  outputPreview?: string;
  error?: string;
};

type LiveResourceProbeResult = {
  serverId: string;
  operation: "list" | "templates" | "read";
  uri?: string;
  ok: boolean;
  outputPreview?: string;
  error?: string;
};

type LiveCompletionProbeResult = {
  serverId: string;
  refType: "ref/resource" | "ref/prompt";
  argumentName: string;
  ok: boolean;
  values?: readonly string[];
  outputPreview?: string;
  error?: string;
};

type LiveTransportProbeResult = {
  transport: "http";
  serverId: string;
  ok: boolean;
  sessionIdObserved: boolean;
  protocolVersionObserved: boolean;
  eventStreamObserved?: boolean;
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

type RuntimeSkillFlowSummary = {
  ok: boolean;
  providerToolName?: string;
  toolCallCount: number;
  toolCallOkCount: number;
  skillBodyMarker: string;
  skillPitfallMarker: string;
  firstStablePrefixContainsSkillBody: boolean;
  firstProviderBodyContainsSkillBody: boolean;
  secondStablePrefixContainsSkillBody: boolean;
  secondDynamicInputContainsSkillBody: boolean;
  secondDynamicInputContainsSkillPitfall: boolean;
  secondObservationSegmentCachePolicy?: string;
  secondProviderInstructionSegmentKinds: readonly string[];
  secondProviderDynamicInputSegmentKinds: readonly string[];
  outputPreview?: string;
};

type DevdoctorCacheXraySummary = {
  status: "ok" | "warning" | "error" | "no-model-calls";
  cache?: {
    weightedCacheHitRate?: number;
    cacheTelemetryCoverage?: number;
    providerCacheMissCalls?: number;
    previousResponseReuseCalls?: number;
  };
};

type PromptPackFlowSummary = {
  mcpPlusPreludePresent: boolean;
  mcpPlusPreludeSegmentKind?: string;
  mcpPlusPreludeCachePolicy?: string;
  mcpPlusPreludeInCacheablePrefix: boolean;
  mcpPlusPreludeMaterialIndex: number;
  builtInToolDeclarationsMaterialIndex: number;
  mcpPlusPreludeAfterBuiltInToolDeclarations: boolean;
  refsAroundMcpPlusPrelude: readonly string[];
  providerInstructionSegmentKinds: readonly string[];
  providerDynamicInputSegmentKinds: readonly string[];
  cacheRiskWarnings: readonly string[];
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
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
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list", "mcp:prompt:get"],
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
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:prompt:list", "mcp:prompt:get"],
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
  return mcp.module({ servers, metadata: { source: "examples.scripts.mcp-plus-native-smoke", mode } });
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

async function runLivePromptProbes(): Promise<LivePromptProbeResult[]> {
  const adapter = createMcpRuntimeAdapter({ servers: SERVER_PROFILES.map((server) => server.profile) });
  const results: LivePromptProbeResult[] = [];
  try {
    const listed = await adapter.listPrompts?.({ serverId: "everything" });
    const listResult: LivePromptProbeResult = listed?.ok === true
      ? {
          serverId: "everything",
          operation: "list",
          ok: true,
          outputPreview: outputPreview(listed.output),
        }
      : {
          serverId: "everything",
          operation: "list",
          ok: false,
          error: listed?.ok === false ? listed.error.message : "missing listPrompts result",
        };
    results.push(listResult);
    console.log(`[prompt-probe] everything.prompts/list: ${listResult.ok ? "ok" : `failed: ${listResult.error}`}`);
    if (!listResult.ok) throw new Error(`Live MCP prompt list probe failed: ${listResult.error}`);
    const promptName = listed.output.prompts.find((prompt: { name?: string }) => prompt.name === "simple-prompt")?.name ?? listed.output.prompts[0]?.name;
    if (promptName === undefined) throw new Error("Live MCP prompt list probe returned no prompt names.");

    const prompt = await adapter.getPrompt?.({ serverId: "everything", name: promptName, arguments: {} });
    const getResult: LivePromptProbeResult = prompt?.ok === true
      ? {
          serverId: "everything",
          operation: "get",
          name: promptName,
          ok: true,
          outputPreview: outputPreview(prompt.output),
        }
      : {
          serverId: "everything",
          operation: "get",
          name: promptName,
          ok: false,
          error: prompt?.ok === false ? prompt.error.message : "missing getPrompt result",
        };
    results.push(getResult);
    console.log(`[prompt-probe] everything.prompts/get:${promptName}: ${getResult.ok ? "ok" : `failed: ${getResult.error}`}`);
    if (!getResult.ok) throw new Error(`Live MCP prompt get probe failed for ${promptName}: ${getResult.error}`);
  } finally {
    await adapter.shutdown?.({});
  }
  return results;
}

async function runLiveResourceProbes(): Promise<LiveResourceProbeResult[]> {
  const adapter = createMcpRuntimeAdapter({ servers: SERVER_PROFILES.map((server) => server.profile) });
  const results: LiveResourceProbeResult[] = [];
  try {
    const listed = await adapter.listResources?.({ serverId: "everything" });
    const listResult: LiveResourceProbeResult = listed?.ok === true
      ? {
          serverId: "everything",
          operation: "list",
          ok: true,
          outputPreview: outputPreview(listed.output),
        }
      : {
          serverId: "everything",
          operation: "list",
          ok: false,
          error: listed?.ok === false ? listed.error.message : "missing listResources result",
        };
    results.push(listResult);
    console.log(`[resource-probe] everything.resources/list: ${listResult.ok ? "ok" : `failed: ${listResult.error}`}`);
    if (!listResult.ok) throw new Error(`Live MCP resource list probe failed: ${listResult.error}`);

    const templates = await adapter.listResourceTemplates?.({ serverId: "everything" });
    const templatesResult: LiveResourceProbeResult = templates?.ok === true
      ? {
          serverId: "everything",
          operation: "templates",
          ok: true,
          outputPreview: outputPreview(templates.output),
        }
      : {
          serverId: "everything",
          operation: "templates",
          ok: false,
          error: templates?.ok === false ? templates.error.message : "missing listResourceTemplates result",
        };
    results.push(templatesResult);
    console.log(`[resource-probe] everything.resources/templates/list: ${templatesResult.ok ? "ok" : `failed: ${templatesResult.error}`}`);
    if (!templatesResult.ok) throw new Error(`Live MCP resource template list probe failed: ${templatesResult.error}`);

    const resourceUri = listed.output.resources.find((resource: { uri?: string; name?: string }) =>
      resource.uri === "demo://resource/static/document/architecture.md" || resource.name === "architecture.md"
    )?.uri ?? listed.output.resources[0]?.uri;
    if (typeof resourceUri !== "string" || resourceUri.length === 0) {
      throw new Error("Live MCP resource list probe returned no readable resource URI.");
    }
    const read = await adapter.readResource?.({ serverId: "everything", uri: resourceUri });
    const readResult: LiveResourceProbeResult = read?.ok === true
      ? {
          serverId: "everything",
          operation: "read",
          uri: resourceUri,
          ok: true,
          outputPreview: outputPreview(read.output),
        }
      : {
          serverId: "everything",
          operation: "read",
          uri: resourceUri,
          ok: false,
          error: read?.ok === false ? read.error.message : "missing readResource result",
        };
    results.push(readResult);
    console.log(`[resource-probe] everything.resources/read:${resourceUri}: ${readResult.ok ? "ok" : `failed: ${readResult.error}`}`);
    if (!readResult.ok) throw new Error(`Live MCP resource read probe failed for ${resourceUri}: ${readResult.error}`);
  } finally {
    await adapter.shutdown?.({});
  }
  return results;
}

async function runLiveCompletionProbes(): Promise<LiveCompletionProbeResult[]> {
  const adapter = createMcpRuntimeAdapter({ servers: SERVER_PROFILES.map((server) => server.profile) });
  const results: LiveCompletionProbeResult[] = [];
  try {
    const completed = await adapter.complete?.({
      serverId: "everything",
      ref: { type: "ref/resource", uri: "demo://resource/dynamic/text/{resourceId}" },
      argument: { name: "resourceId", value: "1" },
    });
    const result: LiveCompletionProbeResult = completed?.ok === true
      ? {
          serverId: "everything",
          refType: "ref/resource",
          argumentName: "resourceId",
          ok: completed.output.values.includes("1"),
          values: completed.output.values,
          outputPreview: outputPreview(completed.output),
          ...(completed.output.values.includes("1") ? {} : { error: `completion values did not include expected resource id: ${completed.output.values.join(", ")}` }),
        }
      : {
          serverId: "everything",
          refType: "ref/resource",
          argumentName: "resourceId",
          ok: false,
          error: completed?.ok === false ? completed.error.message : "missing completion result",
        };
    results.push(result);
    console.log(`[completion-probe] everything.completion/complete: ${result.ok ? "ok" : `failed: ${result.error}`}`);
    if (!result.ok) throw new Error(`Live MCP completion probe failed: ${result.error}`);
  } finally {
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
    outputPreview: outputPreview(result.finalOutput),
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

async function runRuntimeSkillFlow(discovered: readonly DiscoveredServer[]): Promise<RuntimeSkillFlowSummary> {
  const compiled = compileAgent(McpSmokeToolFlowAgent, {
    compiledAt: "2026-06-05T00:00:00.000Z",
    manifestId: "manifest.mcp-smoke.skill-flow.mcp-plus",
  });
  if (!compiled.ok) throw new Error("Failed to compile MCP+ skill-flow smoke agent.");

  const skillBodyMarker = "UNIQUE_MCP_PLUS_SKILL_BODY_DYNAMIC_ONLY";
  const skillPitfallMarker = "UNIQUE_MCP_PLUS_SKILL_PITFALL_DYNAMIC_ONLY";
  const skillStore = createInMemoryMcpPlusSkillStore([{
    id: "skill.everything.echo",
    serverId: "everything",
    projectId: "project.mcp-smoke",
    chapter: "everything-debug",
    title: "Echo workflow skill card",
    summary: "Compact card for the everything echo workflow.",
    whenToUse: "When validating MCP+ skill body expansion.",
    do: [skillBodyMarker],
    pitfalls: [skillPitfallMarker],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
  }]);

  let calls = 0;
  let providerToolName: string | undefined;
  let firstProviderBodyText = "";
  let firstStableInstructionsText = "";
  let secondStableInstructionsText = "";
  let secondDynamicInputText = "";
  const cacheDebugs: AgentModelCacheDebugRecord[] = [];
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-real-mcp-skill-flow-mcp-plus" }).runManifest(
    compiled.manifest,
    "Read the full everything MCP+ skill body and keep it out of the stable prefix.",
    {
      sessionId: "session-real-mcp-skill-flow-mcp-plus",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      mcpModule: moduleFor("mcp-plus", discovered),
      mcpPlus: {
        projectId: "project.mcp-smoke",
        skillStore,
      },
      providerCaller: async (envelope) => {
        calls += 1;
        const body = envelope.body as { instructions?: unknown; input?: unknown; tools?: readonly { name?: string }[] };
        if (calls === 1) {
          firstProviderBodyText = JSON.stringify(envelope.body);
          firstStableInstructionsText = JSON.stringify(body.instructions);
          providerToolName = body.tools
            ?.map((item) => item.name)
            .find((name): name is string => typeof name === "string" && name.includes("mcp_plus_skill_read"));
          if (providerToolName === undefined) {
            throw new Error("MCP+ skill-flow did not expose mcp_plus.skill_read provider tool.");
          }
          return {
            output: [{
              type: "function_call",
              name: providerToolName,
              call_id: "mcp-plus-skill-read",
              arguments: JSON.stringify({ serverId: "everything", id: "skill.everything.echo" }),
            }],
          };
        }
        secondStableInstructionsText = JSON.stringify(body.instructions);
        secondDynamicInputText = JSON.stringify(body.input);
        return { output_text: "mcp-plus skill body expansion stayed dynamic" };
      },
      onModelCallProgress: async (progress) => {
        if (progress.phase === "completed" && progress.cacheDebug !== undefined) {
          cacheDebugs.push(progress.cacheDebug);
        }
      },
      now: () => "2026-06-05T00:00:00.000Z",
    },
  );
  if (!result.ok) throw new Error(`mcp-plus runtime skill-flow failed: ${JSON.stringify(result.error)}`);
  const secondCache = cacheDebugs[1];
  const observationSegment = secondCache?.promptPack.segments.find((segment) => segment.segmentKind === "observations");
  const summary: RuntimeSkillFlowSummary = {
    ok: result.ok,
    providerToolName,
    toolCallCount: result.toolCalls.length,
    toolCallOkCount: result.toolCalls.filter((toolCall) => toolCall.ok).length,
    skillBodyMarker,
    skillPitfallMarker,
    firstStablePrefixContainsSkillBody: firstStableInstructionsText.includes(skillBodyMarker) || firstStableInstructionsText.includes(skillPitfallMarker),
    firstProviderBodyContainsSkillBody: firstProviderBodyText.includes(skillBodyMarker) || firstProviderBodyText.includes(skillPitfallMarker),
    secondStablePrefixContainsSkillBody: secondStableInstructionsText.includes(skillBodyMarker) || secondStableInstructionsText.includes(skillPitfallMarker),
    secondDynamicInputContainsSkillBody: secondDynamicInputText.includes(skillBodyMarker),
    secondDynamicInputContainsSkillPitfall: secondDynamicInputText.includes(skillPitfallMarker),
    secondObservationSegmentCachePolicy: observationSegment?.cachePolicy,
    secondProviderInstructionSegmentKinds: secondCache?.promptPack.providerLowering?.instructionSegmentKinds ?? [],
    secondProviderDynamicInputSegmentKinds: secondCache?.promptPack.providerLowering?.dynamicInputSegmentKinds ?? [],
    outputPreview: outputPreview(result.finalOutput),
  };
  if (summary.toolCallCount !== 1 || summary.toolCallOkCount !== 1) {
    throw new Error(`mcp-plus skill-flow expected one successful skill_read call, got ${JSON.stringify(summary)}`);
  }
  if (summary.firstProviderBodyContainsSkillBody || summary.secondStablePrefixContainsSkillBody) {
    throw new Error(`MCP+ full skill body leaked into provider stable/prefix text: ${JSON.stringify(summary)}`);
  }
  if (!summary.secondDynamicInputContainsSkillBody || !summary.secondDynamicInputContainsSkillPitfall) {
    throw new Error(`MCP+ full skill body was not delivered through dynamic tool-result input: ${JSON.stringify(summary)}`);
  }
  if (summary.secondObservationSegmentCachePolicy !== "dynamic-no-cache") {
    throw new Error(`MCP+ skill_read observation is not dynamic-no-cache: ${JSON.stringify(summary)}`);
  }
  console.log(`[skill-flow] mcp-plus: ${JSON.stringify(summary)}`);
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
        tools: listed.output.tools.map((tool: { name: string; description?: string; inputSchema?: unknown }) => ({
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

async function runLiveTransportProbes(): Promise<LiveTransportProbeResult[]> {
  const sessionId = "smoke-http-session";
  let sessionIdObserved = false;
  let protocolVersionObserved = false;
  let eventStreamObserved = false;
  const sse = (message: unknown): string => `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/rpc") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { id?: string | number; method?: string };
      const protocolVersion = request.headers["mcp-protocol-version"];
      protocolVersionObserved ||= protocolVersion === "2025-06-18";
      const currentSessionId = request.headers["mcp-session-id"];
      if (payload.method !== "initialize") {
        sessionIdObserved ||= currentSessionId === sessionId;
      }
      if (payload.method !== "initialize" && currentSessionId !== sessionId) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "Mcp-Session-Id header is required" } }));
        return;
      }
      if (payload.method === "tools/list") {
        eventStreamObserved = true;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(sse({
          jsonrpc: "2.0",
          id: payload.id,
          result: { tools: [{ name: "http_session_echo", description: "HTTP session echo", inputSchema: { type: "object" } }] },
        }));
        return;
      }
      response.writeHead(200, {
        "content-type": "application/json",
        ...(payload.method === "initialize" ? { "Mcp-Session-Id": sessionId } : {}),
      });
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id,
        result: { ok: true },
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const adapter = createMcpRuntimeAdapter({
      servers: [{
        serverId: "strict-http-session",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
        timeoutMs: 3_000,
      }],
    });
    try {
      const listed = await adapter.listTools?.({ serverId: "strict-http-session" });
      const ok = listed?.ok === true
        && listed.output.tools[0]?.name === "http_session_echo"
        && sessionIdObserved
        && protocolVersionObserved
        && eventStreamObserved;
      const result: LiveTransportProbeResult = {
        transport: "http",
        serverId: "strict-http-session",
        ok,
        sessionIdObserved,
        protocolVersionObserved,
        eventStreamObserved,
        outputPreview: listed?.ok === true ? JSON.stringify(listed.output.tools[0]) : undefined,
        error: listed?.ok === false ? listed.error.message : ok ? undefined : "missing HTTP MCP session/protocol evidence",
      };
      console.log(`[transport-probe] ${result.serverId}.streamable-http-session: ${result.ok ? "ok" : "failed"}`);
      return [result];
    } finally {
      await adapter.shutdown?.({});
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
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

async function runDevdoctorCacheDiagnostics(runDir: string): Promise<{
  report: ExecutionMonitorReport;
  cacheXray: DevdoctorCacheXraySummary;
}> {
  const monitor = await runDevDoctor(["monitor", "--run", runDir, "--project", repoRoot, "--json"]);
  if (monitor.exitCode !== 0) {
    throw new Error(`devdoctor monitor failed for ${runDir}: ${monitor.output}`);
  }
  const report = JSON.parse(monitor.output) as ExecutionMonitorReport;
  const cacheXray = await runDevDoctor(["cache-xray", "--run", runDir, "--project", repoRoot, "--json"]);
  if (cacheXray.exitCode !== 0) {
    throw new Error(`devdoctor cache-xray failed for ${runDir}: ${cacheXray.output}`);
  }
  return { report, cacheXray: JSON.parse(cacheXray.output) as DevdoctorCacheXraySummary };
}

function summarizePromptPackFlow(cache: AgentModelCacheDebugRecord): PromptPackFlowSummary {
  const toolSegment = cache.promptPack.segments.find((segment) => segment.segmentKind === "toolDeclarations");
  const toolRefs = toolSegment?.materialRefs ?? [];
  const builtInToolDeclarationsMaterialIndex = toolRefs.indexOf("runtime:tool-declarations");
  const mcpPlusPreludeMaterialIndex = toolRefs.indexOf("runtime:mcp-plus-native-exposure");
  const providerLowering = cache.promptPack.providerLowering ?? {
    instructionSegmentKinds: [],
    dynamicInputSegmentKinds: [],
  };
  return {
    mcpPlusPreludePresent: mcpPlusPreludeMaterialIndex >= 0,
    mcpPlusPreludeSegmentKind: mcpPlusPreludeMaterialIndex >= 0 ? toolSegment?.segmentKind : undefined,
    mcpPlusPreludeCachePolicy: mcpPlusPreludeMaterialIndex >= 0 ? toolSegment?.cachePolicy : undefined,
    mcpPlusPreludeInCacheablePrefix: toolSegment?.cachePolicy === "cacheable-prefix" && mcpPlusPreludeMaterialIndex >= 0,
    mcpPlusPreludeMaterialIndex,
    builtInToolDeclarationsMaterialIndex,
    mcpPlusPreludeAfterBuiltInToolDeclarations:
      builtInToolDeclarationsMaterialIndex >= 0 &&
      mcpPlusPreludeMaterialIndex > builtInToolDeclarationsMaterialIndex,
    refsAroundMcpPlusPrelude: mcpPlusPreludeMaterialIndex < 0
      ? []
      : toolRefs.slice(Math.max(0, mcpPlusPreludeMaterialIndex - 3), mcpPlusPreludeMaterialIndex + 4),
    providerInstructionSegmentKinds: providerLowering.instructionSegmentKinds,
    providerDynamicInputSegmentKinds: providerLowering.dynamicInputSegmentKinds,
    cacheRiskWarnings: cache.promptPack.cacheRiskWarnings,
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

  const { report, cacheXray } = await runDevdoctorCacheDiagnostics(runDir);

  const cache = cacheDebugs[0];
  const promptPackFlow = summarizePromptPackFlow(cache);
  if (mode === "native" && promptPackFlow.mcpPlusPreludePresent) {
    throw new Error("native MCP smoke unexpectedly included MCP+ native exposure prelude.");
  }
  if (mode === "mcp-plus" && !promptPackFlow.mcpPlusPreludeAfterBuiltInToolDeclarations) {
    throw new Error(`MCP+ native exposure prelude is not placed after built-in tool declarations: ${JSON.stringify(promptPackFlow)}`);
  }
  if (mode === "mcp-plus" && !promptPackFlow.mcpPlusPreludeInCacheablePrefix) {
    throw new Error(`MCP+ native exposure prelude is not in the cacheable tool declaration prefix: ${JSON.stringify(promptPackFlow)}`);
  }
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
    promptPackFlow,
    devdoctorCacheStatus: cacheXray.status,
    devdoctorWeightedCacheHitRate: cacheXray.cache?.weightedCacheHitRate,
    devdoctorCacheTelemetryCoverage: cacheXray.cache?.cacheTelemetryCoverage,
    devdoctorProviderCacheMissCalls: cacheXray.cache?.providerCacheMissCalls,
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
const livePromptProbes = await runLivePromptProbes();
const liveResourceProbes = await runLiveResourceProbes();
const liveCompletionProbes = await runLiveCompletionProbes();
const liveTransportProbes = await runLiveTransportProbes();
const nativeToolFlow = await runRuntimeToolFlow("native", discovered);
const mcpPlusToolFlow = await runRuntimeToolFlow("mcp-plus", discovered);
const mcpPlusSkillFlow = await runRuntimeSkillFlow(discovered);
await writeFile(path.join(runRoot, "discovery.json"), `${JSON.stringify(discovered.map((server) => ({
  serverId: server.serverId,
  toolCount: server.tools.length,
  toolNames: server.tools.map((tool) => tool.name),
})), null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-call-probes.json"), `${JSON.stringify(liveCallProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-prompt-probes.json"), `${JSON.stringify(livePromptProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-resource-probes.json"), `${JSON.stringify(liveResourceProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-completion-probes.json"), `${JSON.stringify(liveCompletionProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "live-transport-probes.json"), `${JSON.stringify(liveTransportProbes, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "runtime-tool-flow.json"), `${JSON.stringify([nativeToolFlow, mcpPlusToolFlow], null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, "runtime-skill-flow.json"), `${JSON.stringify(mcpPlusSkillFlow, null, 2)}\n`, "utf8");
const native = await runMode("native", discovered);
const mcpPlus = await runMode("mcp-plus", discovered);
const comparison = {
  runRoot,
  serverCount: discovered.length,
  totalNativeToolsDiscovered: discovered.reduce((sum, server) => sum + server.tools.length, 0),
  liveCallProbeCount: liveCallProbes.length,
  liveCallProbeServers: [...new Set(liveCallProbes.map((probe) => probe.serverId))],
  livePromptProbeCount: livePromptProbes.length,
  livePromptProbeServers: [...new Set(livePromptProbes.map((probe) => probe.serverId))],
  liveResourceProbeCount: liveResourceProbes.length,
  liveResourceProbeServers: [...new Set(liveResourceProbes.map((probe) => probe.serverId))],
  liveResourceProbeOperations: [...new Set(liveResourceProbes.map((probe) => probe.operation))],
  liveCompletionProbeCount: liveCompletionProbes.length,
  liveCompletionProbeServers: [...new Set(liveCompletionProbes.map((probe) => probe.serverId))],
  liveTransportProbeCount: liveTransportProbes.length,
  liveTransportProbeTransports: [...new Set(liveTransportProbes.map((probe) => probe.transport))],
  liveResourceProbeResults: liveResourceProbes,
  liveCompletionProbeResults: liveCompletionProbes,
  liveTransportProbeResults: liveTransportProbes,
  runtimeToolFlows: [nativeToolFlow, mcpPlusToolFlow],
  runtimeSkillFlow: mcpPlusSkillFlow,
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
