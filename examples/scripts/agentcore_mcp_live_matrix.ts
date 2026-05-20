import type { BaseToolExecutorPort, BaseToolExecutorResult } from "../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const serverId = "matrix-mcp";
const connectionId = `${serverId}:connection`;
const resourceUri = "file:///workspace/README.md";

type McpCase = {
  toolId: string;
  input: Readonly<Record<string, unknown>>;
  expectedCall: string;
};

const mcpContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  grantedPermissions: [
    "mcp:connect",
    "mcp:auth",
    "mcp:read",
    "mcp:write",
    "cache:write",
    "mcp:cache:invalidate",
    "mcp:disconnect",
    "mcp:subscription:write",
    "mcp:call",
    "mcp:service",
    "mcp:stream",
    "mcp:cancel",
    "mcp:control",
    "mcp:native-execute",
    "mcp:raw",
    "mcp:tool:read",
    "mcp:tool:write",
    "mcp:connection:read",
    "mcp:resource:list",
    "mcp:resource:read",
    "mcp:resource:create",
    "mcp:resource:write",
    "mcp:resource:delete",
    "mcp:ping",
    "mcp:monitor:read",
  ],
} as const;

const mcpCases: readonly McpCase[] = [
  { toolId: "mcp.authenticate", input: { target: { serverId, authStrategy: "oauth", credentialRef: "secret://matrix/mcp", requestedScopes: ["mcp:fs"] }, context: mcpContext }, expectedCall: "mcp.authenticate" },
  { toolId: "mcp.authorize", input: { target: { serverId, subjectId: "agent:matrix", action: "call-tool", toolName: "read_file", requestedScopes: ["mcp:fs"] }, context: mcpContext }, expectedCall: "mcp.authorize" },
  { toolId: "mcp.cache", input: { target: { serverId, cacheKey: "resource:file:///workspace/README.md", valueRef: "value://readme", ttlSeconds: 300, tags: ["matrix"] }, context: mcpContext }, expectedCall: "mcp.cache" },
  { toolId: "mcp.invalidateCache", input: { target: { serverId, scope: "resources", cacheKey: "resource:file:///workspace/README.md", reason: "matrix" }, context: mcpContext }, expectedCall: "mcp.invalidateCache" },
  { toolId: "mcp.connect", input: { target: { serverId, connectionId, transportHint: "stdio", timeoutMs: 1000 }, context: mcpContext }, expectedCall: "mcp.connect" },
  { toolId: "mcp.disconnect", input: { target: { serverId, connectionId, reason: "matrix cleanup", force: false }, context: mcpContext }, expectedCall: "mcp.disconnect" },
  { toolId: "mcp.subscribe", input: { target: { serverId, connectionId, subjectType: "resource", subject: resourceUri, eventKinds: ["changed"], replayPolicy: "latest" }, context: mcpContext }, expectedCall: "mcp.subscribe" },
  { toolId: "mcp.unsubscribe", input: { target: { serverId, subscriptionId: `${serverId}:subscription:resource:${resourceUri}`, reason: "matrix cleanup" }, context: mcpContext }, expectedCall: "mcp.unsubscribe" },
  { toolId: "mcp.call", input: { target: { serverId, name: "read_file", mode: "tool", arguments: { path: "README.md" }, timeoutMs: 1000 }, context: mcpContext }, expectedCall: "mcp.callTool" },
  { toolId: "mcp.stream", input: { target: { serverId, name: "read_file", channel: "chunks", arguments: { path: "README.md" }, maxEvents: 2 }, context: mcpContext }, expectedCall: "mcp.streamTool" },
  { toolId: "mcp.cancel", input: { target: { serverId, executionId: `${serverId}:execution:read_file`, reason: "matrix cancel", force: false }, context: mcpContext }, expectedCall: "mcp.cancelExecution" },
  { toolId: "mcp.nativeExecute", input: { target: { serverId, method: "tools/list", params: {}, protocolVersion: "2025-06-18" }, context: mcpContext }, expectedCall: "mcp.nativeExecute" },
  { toolId: "mcp.listTools", input: { target: { serverId, namespace: "fs", limit: 10 }, context: mcpContext }, expectedCall: "mcp.listTools" },
  { toolId: "mcp.registerTool", input: { target: { serverId, tool: { name: "dynamic_echo", description: "Dynamic echo", inputSchema: { type: "object" } }, replaceExisting: true }, context: mcpContext }, expectedCall: "mcp.registerTool" },
  { toolId: "mcp.updateTool", input: { target: { serverId, toolName: "dynamic_echo", patch: { description: "Updated dynamic echo" } }, context: mcpContext }, expectedCall: "mcp.updateTool" },
  { toolId: "mcp.unregisterTool", input: { target: { serverId, toolName: "dynamic_echo", keepAuditRecord: true }, context: mcpContext }, expectedCall: "mcp.unregisterTool" },
  { toolId: "mcp.listResources", input: { target: { serverId, uriPrefix: "file:///workspace/", limit: 10 }, context: mcpContext }, expectedCall: "mcp.listResources" },
  { toolId: "mcp.readResource", input: { target: { serverId, resourceUri, maxBytes: 512 }, context: mcpContext }, expectedCall: "mcp.readResource" },
  { toolId: "mcp.createResource", input: { target: { serverId, uri: "file:///workspace/matrix-created.md", resourceType: "document", mimeType: "text/markdown" }, initialContent: "# Matrix\n", metadata: { owner: "matrix" }, context: mcpContext }, expectedCall: "mcp.createResource" },
  { toolId: "mcp.updateResource", input: { target: { serverId, resourceUri, content: { mimeType: "text/markdown", text: "# Updated\n" } }, context: mcpContext }, expectedCall: "mcp.updateResource" },
  { toolId: "mcp.deleteResource", input: { target: { serverId, uri: "file:///workspace/matrix-created.md" }, reason: "matrix cleanup", context: mcpContext }, expectedCall: "mcp.deleteResource" },
  { toolId: "mcp.ping", input: { target: { serverId, connectionId, timeoutMs: 1000 }, context: mcpContext }, expectedCall: "mcp.ping" },
  { toolId: "mcp.healthCheck", input: { target: { serverId, connectionId, includeCapabilities: true, includeLatencyProbe: true, timeoutMs: 1000 }, context: mcpContext }, expectedCall: "mcp.checkHealth" },
] as const;

function fail(code: string, message: string): BaseToolExecutorResult<never> {
  return { ok: false, error: { code, message, publicSafe: true } };
}

function createMcpExecutor(calls: string[]): BaseToolExecutorPort {
  const tools = new Map<string, { name: string; description?: string; inputSchema?: unknown; namespace?: string }>();
  const resources = new Map<string, { uri: string; name: string; mimeType: string; text: string }>([
    [resourceUri, { uri: resourceUri, name: "README.md", mimeType: "text/markdown", text: "# Matrix MCP README\n" }],
  ]);
  const checkServer = (id: string) => id === serverId;
  const metadata = (runtimeEntry: string) => ({ runtimeEntry, serverId, labMode: "deterministic-mcp-matrix" });
  return {
    mcp: {
      async authenticate(request) {
        calls.push("mcp.authenticate");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { status: "authenticated", serverId, authSessionId: `${serverId}:auth`, scopesGranted: request.requestedScopes, providerMetadata: metadata("BaseToolExecutorPort.mcp.authenticate") } };
      },
      async authorize(request) {
        calls.push("mcp.authorize");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { decision: "allowed", policyId: `${serverId}:policy:${request.action}`, scopesGranted: request.requestedScopes, providerMetadata: metadata("BaseToolExecutorPort.mcp.authorize") } };
      },
      async cache(request) {
        calls.push("mcp.cache");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { cacheKey: request.cacheKey, status: "cached", providerMetadata: metadata("BaseToolExecutorPort.mcp.cache") } };
      },
      async invalidateCache(request) {
        calls.push("mcp.invalidateCache");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { scope: request.scope, cacheKey: request.cacheKey, status: "invalidated", invalidatedCount: 1, providerMetadata: metadata("BaseToolExecutorPort.mcp.invalidateCache") } };
      },
      async connect(request) {
        calls.push("mcp.connect");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { serverId, connectionId: request.connectionId ?? connectionId, status: "connected", providerMetadata: metadata("BaseToolExecutorPort.mcp.connect") } };
      },
      async disconnect(request) {
        calls.push("mcp.disconnect");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { serverId, connectionId: request.connectionId ?? connectionId, status: "disconnected", providerMetadata: metadata("BaseToolExecutorPort.mcp.disconnect") } };
      },
      async subscribe(request) {
        calls.push("mcp.subscribe");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { serverId, connectionId: request.connectionId ?? connectionId, subscriptionId: `${serverId}:subscription:${request.subjectType}:${request.subject}`, status: "subscribed", providerMetadata: metadata("BaseToolExecutorPort.mcp.subscribe") } };
      },
      async unsubscribe(request) {
        calls.push("mcp.unsubscribe");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { serverId, subscriptionId: request.subscriptionId, status: "unsubscribed", providerMetadata: metadata("BaseToolExecutorPort.mcp.unsubscribe") } };
      },
      async callTool(request) {
        calls.push("mcp.callTool");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { content: [{ type: "text", text: resources.get(resourceUri)?.text ?? "" }], resourceUri, providerMetadata: metadata("BaseToolExecutorPort.mcp.callTool") } };
      },
      async streamTool(request) {
        calls.push("mcp.streamTool");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { executionId: `${serverId}:execution:${request.name}`, streamId: `${serverId}:stream:${request.name}`, status: "completed", channel: request.channel ?? "chunks", chunks: ["# Matrix MCP README"], providerMetadata: metadata("BaseToolExecutorPort.mcp.streamTool") } };
      },
      async cancelExecution(request) {
        calls.push("mcp.cancelExecution");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { serverId, executionId: request.executionId, status: "cancelled", providerMetadata: metadata("BaseToolExecutorPort.mcp.cancelExecution") } };
      },
      async nativeExecute(request) {
        calls.push("mcp.nativeExecute");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { status: "executed", result: { tools: ["read_file", ...tools.keys()] }, providerMetadata: metadata("BaseToolExecutorPort.mcp.nativeExecute") } };
      },
      async listTools(request) {
        calls.push("mcp.listTools");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { tools: [{ name: "read_file", namespace: "fs", inputSchema: { type: "object" } }, ...tools.values()], providerMetadata: metadata("BaseToolExecutorPort.mcp.listTools") } };
      },
      async registerTool(request) {
        calls.push("mcp.registerTool");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        tools.set(request.tool.name, { ...request.tool, namespace: "dynamic" });
        return { ok: true, output: { name: request.tool.name, status: "registered", providerMetadata: metadata("BaseToolExecutorPort.mcp.registerTool") } };
      },
      async updateTool(request) {
        calls.push("mcp.updateTool");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        const existing = tools.get(request.toolName) ?? { name: request.toolName, namespace: "dynamic" };
        const name = request.patch.name ?? existing.name;
        tools.set(name, { ...existing, ...request.patch, name });
        return { ok: true, output: { toolName: name, status: "updated", providerMetadata: metadata("BaseToolExecutorPort.mcp.updateTool") } };
      },
      async unregisterTool(request) {
        calls.push("mcp.unregisterTool");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        const existed = tools.delete(request.toolName);
        return { ok: true, output: { toolName: request.toolName, status: existed ? "unregistered" : "not_found", providerMetadata: metadata("BaseToolExecutorPort.mcp.unregisterTool") } };
      },
      async listResources(request) {
        calls.push("mcp.listResources");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        const listed = [...resources.values()].filter((item) => request.uriPrefix === undefined || item.uri.startsWith(request.uriPrefix));
        return { ok: true, output: { resources: listed.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })), exhausted: true, providerMetadata: metadata("BaseToolExecutorPort.mcp.listResources") } };
      },
      async readResource(request) {
        calls.push("mcp.readResource");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        const resource = resources.get(request.resourceUri);
        if (resource === undefined) return fail("MCP_RESOURCE_NOT_FOUND", request.resourceUri);
        return { ok: true, output: { uri: resource.uri, contents: [{ mimeType: resource.mimeType, text: resource.text }], truncated: false, providerMetadata: metadata("BaseToolExecutorPort.mcp.readResource") } };
      },
      async createResource(request) {
        calls.push("mcp.createResource");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        resources.set(request.uri, { uri: request.uri, name: request.uri.split("/").pop() ?? request.uri, mimeType: request.mimeType ?? "text/plain", text: String(request.initialContent ?? "") });
        return { ok: true, output: { uri: request.uri, status: "created", revision: "rev-1", providerMetadata: metadata("BaseToolExecutorPort.mcp.createResource") } };
      },
      async updateResource(request) {
        calls.push("mcp.updateResource");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        const resource = resources.get(request.resourceUri) ?? { uri: request.resourceUri, name: request.resourceUri.split("/").pop() ?? request.resourceUri, mimeType: "text/plain", text: "" };
        resources.set(request.resourceUri, { ...resource, mimeType: request.content.mimeType ?? resource.mimeType, text: request.content.text ?? resource.text });
        return { ok: true, output: { uri: request.resourceUri, status: "updated", revision: "rev-2", providerMetadata: metadata("BaseToolExecutorPort.mcp.updateResource") } };
      },
      async deleteResource(request) {
        calls.push("mcp.deleteResource");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        resources.delete(request.uri);
        return { ok: true, output: { uri: request.uri, status: "deleted", providerMetadata: metadata("BaseToolExecutorPort.mcp.deleteResource") } };
      },
      async ping(request) {
        calls.push("mcp.ping");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { healthy: true, status: "ok", latencyMs: 1, providerMetadata: metadata("BaseToolExecutorPort.mcp.ping") } };
      },
      async checkHealth(request) {
        calls.push("mcp.checkHealth");
        if (!checkServer(request.serverId)) return fail("MCP_SERVER_NOT_FOUND", request.serverId);
        return { ok: true, output: { status: "healthy", connection: "connected", latencyMs: 1, capabilities: request.includeCapabilities === false ? [] : ["tools", "resources", "ping"], providerMetadata: metadata("BaseToolExecutorPort.mcp.checkHealth") } };
      },
    },
  };
}

async function invokeMcpToolThroughRuntimeChain(toolId: string, input: Readonly<Record<string, unknown>>, executor: BaseToolExecutorPort): Promise<{ ok: boolean; output?: unknown; error?: unknown }> {
  const toolCallId = `${toolId}:mcp-live-matrix`;
  const runtimeId = "agentcore-mcp-live-matrix-runtime";
  const sessionId = "agentcore-mcp-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 15_000, maxOutputBytes: 12_000 },
  });
  if (!adapted.ok) return { ok: false, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-mcp-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolId, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

function truncate(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  return text.length > 900 ? `${text.slice(0, 900)}...<truncated>` : text;
}

async function main(): Promise<void> {
  if (!argSet.has("--no-model")) {
    console.log("agentCore MCP live matrix currently runs deterministic no-model runtime smoke; pass --no-model for the strict registry/handler/executor path.");
  }
  const onlyTool = args.find((arg) => arg.startsWith("--tool="))?.slice("--tool=".length);
  const selected = mcpCases.filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool);
  const results = [];
  for (const testCase of selected) {
    const calls: string[] = [];
    const result = await invokeMcpToolThroughRuntimeChain(testCase.toolId, testCase.input, createMcpExecutor(calls));
    const expectedCallOk = calls.includes(testCase.expectedCall);
    const ok = result.ok && expectedCallOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      expectedCallOk,
      expectedCall: testCase.expectedCall,
      calls,
      resultOk: result.ok,
      outputPreview: truncate(result.ok ? result.output : result.error),
    };
    results.push(record);
    console.log(JSON.stringify(record));
  }
  const failedTools = results.filter((result) => !result.ok).map((result) => result.toolId);
  const summary = { ok: failedTools.length === 0, mode: "registry-handler-only", total: results.length, passed: results.length - failedTools.length, failed: failedTools.length, failedTools };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

await main();
