import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";
import { createMcpRuntimeAdapter } from "../../src/runtimeImplementation/runtime.execEngine/mcpRuntimeAdapter.js";

const args = process.argv.slice(2);
const argSet = new Set(args);

const stdioServerId = "external-stdio-mcp";
const httpServerId = "external-http-mcp";
const sseServerId = "external-sse-mcp";
const npmFilesystemServerId = "npm-filesystem-mcp";
const resourceUri = "file:///workspace/external-mcp.md";

type SmokeCase = {
  label: string;
  toolId: string;
  input: Readonly<Record<string, unknown>>;
  expectText: string;
};

const mcpContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  grantedPermissions: [
    "mcp:connect",
    "mcp:auth",
    "mcp:read",
    "mcp:write",
    "mcp:disconnect",
    "mcp:call",
    "mcp:service",
    "mcp:raw",
    "mcp:tool:read",
    "mcp:connection:read",
    "mcp:resource:list",
    "mcp:resource:read",
    "mcp:ping",
    "mcp:monitor:read",
  ],
} as const;

const stdioServerSource = String.raw`
let buffer = "";
const tools = [{ name: "echo", description: "External stdio echo", inputSchema: { type: "object", additionalProperties: true } }];
const resources = [{ uri: "file:///workspace/external-mcp.md", name: "external-mcp.md", mimeType: "text/markdown" }];
function frame(payload) {
  const body = JSON.stringify(payload);
  return "Content-Length: " + Buffer.byteLength(body, "utf8") + "\r\n\r\n" + body;
}
function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "praxis-external-stdio-smoke", version: "1.0.0" } } };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (method === "tools/call") return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "stdio echo:" + JSON.stringify(params?.arguments ?? {}) }] } };
  if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources } };
  if (method === "resources/read") return { jsonrpc: "2.0", id, result: { contents: [{ uri: params?.uri, mimeType: "text/markdown", text: "# external stdio MCP resource" }] } };
  return { jsonrpc: "2.0", id, result: { ok: true, method } };
}
function pump() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /^Content-Length:\s*(\d+)$/im.exec(buffer.slice(0, headerEnd));
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.length < end) return;
    const body = buffer.slice(start, end);
    buffer = buffer.slice(end);
    process.stdout.write(frame(handle(JSON.parse(body))));
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  pump();
});
`;

function jsonRpcResult(method: string, params: Record<string, unknown>): unknown {
  if (method === "initialize") {
    return {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "praxis-external-http-smoke", version: "1.0.0" },
    };
  }
  if (method === "tools/list") {
    return { tools: [{ name: "echo", description: "External HTTP echo", inputSchema: { type: "object", additionalProperties: true } }] };
  }
  if (method === "tools/call") {
    return { content: [{ type: "text", text: `http echo:${JSON.stringify(params.arguments ?? {})}` }] };
  }
  if (method === "resources/list") {
    return { resources: [{ uri: resourceUri, name: "external-mcp.md", mimeType: "text/markdown" }] };
  }
  if (method === "resources/read") {
    return { contents: [{ uri: params.uri, mimeType: "text/markdown", text: "# external HTTP/SSE MCP resource" }] };
  }
  return { ok: true, method };
}

async function startHttpMcpServer(): Promise<{ server: Server; url: string; sseUrl: string }> {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("event: endpoint\ndata: /sse-rpc\n\n");
      response.end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id?: unknown; method?: unknown; params?: unknown };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: jsonRpcResult(String(body.method ?? ""), typeof body.params === "object" && body.params !== null ? body.params as Record<string, unknown> : {}),
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("HTTP MCP smoke server did not expose a port.");
  const base = `http://127.0.0.1:${address.port}`;
  return { server, url: `${base}/mcp`, sseUrl: `${base}/sse` };
}

async function invokeMcpToolThroughRuntimeChain(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; output?: unknown; error?: unknown }> {
  const toolCallId = `${toolId}:mcp-external-transport-smoke`;
  const runtimeId = "agentcore-mcp-external-transport-runtime";
  const sessionId = "agentcore-mcp-external-transport-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 15_000, maxOutputBytes: 24_000 },
  });
  if (!adapted.ok) return { ok: false, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-mcp-external-transport-smoke", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolId, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

function includesText(value: unknown, needle: string): boolean {
  return JSON.stringify(value).includes(needle);
}

function truncate(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  return text.length > 900 ? `${text.slice(0, 900)}...<truncated>` : text;
}

async function main(): Promise<void> {
  if (!argSet.has("--no-model")) {
    console.log("agentCore MCP external transport smoke is a no-model transport test; pass --no-model for the strict registry/handler/executor path.");
  }
  const useNpmFilesystem = argSet.has("--npm-filesystem");
  const npmWorkspace = useNpmFilesystem ? await mkdtemp(path.join(os.tmpdir(), "praxis-mcp-filesystem-")) : undefined;
  const npmReadme = npmWorkspace === undefined ? undefined : path.join(npmWorkspace, "external-mcp-readme.md");
  if (npmReadme !== undefined) {
    await writeFile(npmReadme, "# npm filesystem MCP\n\nexternal package smoke\n", "utf8");
  }
  const http = await startHttpMcpServer();
  const executor: BaseToolExecutorPort = {
    mcp: createMcpRuntimeAdapter({
      servers: [
        { serverId: stdioServerId, transport: "stdio", command: process.execPath, args: ["--input-type=module", "-e", stdioServerSource], timeoutMs: 5_000 },
        { serverId: httpServerId, transport: "http", url: http.url, timeoutMs: 5_000 },
        { serverId: sseServerId, transport: "sse", url: http.url, sseUrl: http.sseUrl, timeoutMs: 5_000 },
        ...(npmWorkspace === undefined ? [] : [{
          serverId: npmFilesystemServerId,
          transport: "stdio" as const,
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", npmWorkspace],
          timeoutMs: 20_000,
          framing: "line-json" as const,
        }]),
      ],
    }),
  };
  const cases: readonly SmokeCase[] = [
    { label: "stdio-connect", toolId: "mcp.connect", input: { target: { serverId: stdioServerId, transportHint: "stdio" }, context: mcpContext }, expectText: "connected" },
    { label: "stdio-list-tools", toolId: "mcp.listTools", input: { target: { serverId: stdioServerId }, context: mcpContext }, expectText: "External stdio echo" },
    { label: "stdio-call-tool", toolId: "mcp.call", input: { target: { serverId: stdioServerId, name: "echo", mode: "tool", arguments: { message: "hello-stdio" } }, context: mcpContext }, expectText: "hello-stdio" },
    { label: "stdio-read-resource", toolId: "mcp.readResource", input: { target: { serverId: stdioServerId, resourceUri }, context: mcpContext }, expectText: "external stdio MCP resource" },
    { label: "http-connect", toolId: "mcp.connect", input: { target: { serverId: httpServerId, transportHint: "http" }, context: mcpContext }, expectText: "connected" },
    { label: "http-list-tools", toolId: "mcp.listTools", input: { target: { serverId: httpServerId }, context: mcpContext }, expectText: "External HTTP echo" },
    { label: "http-call-tool", toolId: "mcp.call", input: { target: { serverId: httpServerId, name: "echo", mode: "tool", arguments: { message: "hello-http" } }, context: mcpContext }, expectText: "hello-http" },
    { label: "sse-connect", toolId: "mcp.connect", input: { target: { serverId: sseServerId, transportHint: "sse" }, context: mcpContext }, expectText: "connected" },
    { label: "sse-call-tool", toolId: "mcp.call", input: { target: { serverId: sseServerId, name: "echo", mode: "tool", arguments: { message: "hello-sse" } }, context: mcpContext }, expectText: "hello-sse" },
    ...(npmReadme === undefined ? [] : [
      { label: "npm-filesystem-connect", toolId: "mcp.connect", input: { target: { serverId: npmFilesystemServerId, transportHint: "stdio" }, context: mcpContext }, expectText: "connected" },
      { label: "npm-filesystem-list-tools", toolId: "mcp.listTools", input: { target: { serverId: npmFilesystemServerId }, context: mcpContext }, expectText: "read_file" },
      { label: "npm-filesystem-call-tool", toolId: "mcp.call", input: { target: { serverId: npmFilesystemServerId, name: "read_file", mode: "tool", arguments: { path: npmReadme } }, context: mcpContext }, expectText: "npm filesystem MCP" },
    ] satisfies readonly SmokeCase[]),
  ];

  const results = [];
  try {
    for (const testCase of cases) {
      const result = await invokeMcpToolThroughRuntimeChain(testCase.toolId, testCase.input, executor);
      const ok = result.ok && includesText(result.output, testCase.expectText);
      const record = {
        ok,
        label: testCase.label,
        toolId: testCase.toolId,
        transport: testCase.label.split("-")[0],
        resultOk: result.ok,
        outputPreview: truncate(result.ok ? result.output : result.error),
      };
      results.push(record);
      console.log(JSON.stringify(record));
    }
  } finally {
    await new Promise<void>((resolve) => http.server.close(() => resolve()));
    await executor.mcp?.disconnect?.({ serverId: stdioServerId });
    await executor.mcp?.disconnect?.({ serverId: npmFilesystemServerId });
    if (npmWorkspace !== undefined) await rm(npmWorkspace, { recursive: true, force: true });
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    mode: "external-mcp-transport-smoke",
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    transports: [...new Set(results.map((result) => result.transport))].sort(),
    externalPackage: useNpmFilesystem ? "@modelcontextprotocol/server-filesystem" : undefined,
    failedLabels: failed.map((result) => result.label),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

await main();
