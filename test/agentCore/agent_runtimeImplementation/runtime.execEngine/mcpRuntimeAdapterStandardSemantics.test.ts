import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

import { createMcpRuntimeAdapter } from "../../../../src/runtimeImplementation/runtime.execEngine/mcpRuntimeAdapter.js";

test("MCP runtime adapter exposes standard MCP prompt and host semantic methods", async () => {
  const seenMethods: string[] = [];
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
      const payload = JSON.parse(body) as { id?: string | number; method?: string; params?: Record<string, unknown> };
      seenMethods.push(payload.method ?? "");
      const result = payload.method === "prompts/list"
        ? { prompts: [{ name: "triage", title: "Triage" }] }
        : payload.method === "prompts/get"
          ? { description: "Triage prompt", messages: [{ role: "user", content: { type: "text", text: "triage" } }] }
          : payload.method === "completion/complete"
            ? { completion: { values: ["repo"], total: 1, hasMore: false } }
            : payload.method === "logging/setLevel"
              ? { accepted: true, level: payload.params?.level }
              : payload.method === "ping"
                ? {}
                : { ok: true };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "standard-mcp",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
      }],
    });

    assert.equal(typeof mcp.listPrompts, "function");
    assert.equal(typeof mcp.getPrompt, "function");
    assert.equal(typeof mcp.setRoots, "function");
    assert.equal(typeof mcp.reportProgress, "function");
    assert.equal(typeof mcp.createSamplingMessage, "function");
    assert.equal(typeof mcp.elicit, "function");
    assert.equal(typeof mcp.setLoggingLevel, "function");
    assert.equal(typeof mcp.complete, "function");

    const prompts = await mcp.listPrompts?.({ serverId: "standard-mcp" });
    assert.equal(prompts?.ok, true);
    assert.equal(prompts?.output.prompts[0]?.name, "triage");

    const prompt = await mcp.getPrompt?.({ serverId: "standard-mcp", name: "triage", arguments: { topic: "repo" } });
    assert.equal(prompt?.ok, true);
    assert.match(JSON.stringify(prompt?.output), /Triage prompt/u);

    const completion = await mcp.complete?.({
      serverId: "standard-mcp",
      ref: { type: "ref/prompt", name: "triage" },
      argument: { name: "topic", value: "re" },
      context: { arguments: { mode: "test" } },
    });
    assert.equal(completion?.ok, true);
    assert.deepEqual(completion?.output.values, ["repo"]);
    assert.equal(completion?.output.providerMetadata.method, "completion/complete");

    const progress = await mcp.reportProgress?.({ serverId: "standard-mcp", progressToken: "p1", progress: 1, total: 2 });
    assert.equal(progress?.ok, true);
    assert.equal(progress?.output.status, "reported");

    const logging = await mcp.setLoggingLevel?.({ serverId: "standard-mcp", level: "debug" });
    assert.equal(logging?.ok, true);
    assert.equal(logging?.output.level, "debug");

    const cancelled = await mcp.cancelExecution?.({ serverId: "standard-mcp", executionId: "request-1", reason: "test cancellation" });
    assert.equal(cancelled?.ok, true);
    assert.equal(cancelled?.output.status, "cancelled");

    assert.deepEqual(seenMethods, [
      "initialize",
      "notifications/initialized",
      "prompts/list",
      "prompts/get",
      "completion/complete",
      "logging/setLevel",
      "notifications/cancelled",
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime HTTP adapter preserves streamable HTTP session ids", async () => {
  const sessionId = "session-http-1";
  const seen: Array<{ method?: string; sessionId?: string; protocolVersion?: string }> = [];
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
      const currentSessionId = request.headers["mcp-session-id"];
      seen.push({
        method: payload.method,
        sessionId: typeof currentSessionId === "string" ? currentSessionId : undefined,
        protocolVersion: typeof request.headers["mcp-protocol-version"] === "string"
          ? request.headers["mcp-protocol-version"]
          : undefined,
      });
      if (payload.method !== "initialize" && currentSessionId !== sessionId) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "Mcp-Session-Id header is required" } }));
        return;
      }
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "session_echo", description: "Echo", inputSchema: { type: "object" } }] }
        : { ok: true };
      response.writeHead(200, {
        "content-type": "application/json",
        ...(payload.method === "initialize" ? { "Mcp-Session-Id": sessionId } : {}),
      });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "session-http",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
      }],
    });

    const listed = await mcp.listTools?.({ serverId: "session-http" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "session_echo");
    assert.deepEqual(seen, [
      { method: "initialize", sessionId: undefined, protocolVersion: "2025-06-18" },
      { method: "notifications/initialized", sessionId, protocolVersion: "2025-06-18" },
      { method: "tools/list", sessionId, protocolVersion: "2025-06-18" },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime HTTP adapter accepts streamable HTTP event-stream responses", async () => {
  const sessionId = "session-http-sse-1";
  const seen: Array<{ method?: string; sessionId?: string; accept?: string }> = [];
  const sse = (messages: readonly unknown[]): string => messages
    .map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`)
    .join("");
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
      const currentSessionId = request.headers["mcp-session-id"];
      seen.push({
        method: payload.method,
        sessionId: typeof currentSessionId === "string" ? currentSessionId : undefined,
        accept: typeof request.headers.accept === "string" ? request.headers.accept : undefined,
      });
      if (payload.method !== "initialize" && currentSessionId !== sessionId) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "Mcp-Session-Id header is required" } }));
        return;
      }
      if (payload.method === "notifications/initialized") {
        response.writeHead(202, { "content-type": "application/json" }).end("{}");
        return;
      }
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "sse_echo", description: "Echo over SSE", inputSchema: { type: "object" } }] }
        : { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "sse", version: "1" } };
      response.writeHead(200, {
        "content-type": "text/event-stream",
        ...(payload.method === "initialize" ? { "Mcp-Session-Id": sessionId } : {}),
      });
      response.end(sse([
        ...(payload.method === "tools/list"
          ? [{ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "http-list", progress: 1, total: 1 } }]
          : []),
        { jsonrpc: "2.0", id: payload.id, result },
      ]));
    });
  });

  const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "session-http-sse",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
      }],
      host: {
        onNotification(notification) {
          notifications.push({ method: notification.method, params: notification.params });
        },
      },
    });

    const listed = await mcp.listTools?.({ serverId: "session-http-sse" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "sse_echo");
    assert.deepEqual(notifications, [{
      method: "notifications/progress",
      params: { progressToken: "http-list", progress: 1, total: 1 },
    }]);
    assert.deepEqual(seen, [
      { method: "initialize", sessionId: undefined, accept: "application/json, text/event-stream" },
      { method: "notifications/initialized", sessionId, accept: "application/json, text/event-stream" },
      { method: "tools/list", sessionId, accept: "application/json, text/event-stream" },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime SSE adapter reads JSON-RPC responses from the legacy event stream", async () => {
  const seen: Array<{ method?: string; url?: string }> = [];
  let sseStream: ServerResponse | undefined;
  const sseMessage = (message: unknown): string => `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
      seen.push({ method: "GET", url: request.url });
      sseStream = response;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write("event: endpoint\ndata: /sse-rpc\n\n");
      return;
    }
    if (request.method !== "POST" || request.url !== "/sse-rpc") {
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
      seen.push({ method: payload.method, url: request.url });
      response.writeHead(202, { "content-type": "application/json" }).end("{}");
      if (payload.method === "notifications/initialized") return;
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "legacy_sse_echo", description: "Echo over legacy SSE", inputSchema: { type: "object" } }] }
        : { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "legacy-sse", version: "1" } };
      if (payload.method === "tools/list") {
        sseStream?.write(sseMessage({
          jsonrpc: "2.0",
          method: "notifications/progress",
          params: { progressToken: "legacy-sse-list", progress: 1, total: 1 },
        }));
      }
      sseStream?.write(sseMessage({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });

  const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
  let mcp: ReturnType<typeof createMcpRuntimeAdapter> | undefined;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "legacy-sse",
        transport: "sse",
        url: `http://127.0.0.1:${address.port}/rpc`,
        sseUrl: `http://127.0.0.1:${address.port}/sse`,
      }],
      host: {
        onNotification(notification) {
          notifications.push({ method: notification.method, params: notification.params });
        },
      },
    });

    const listed = await mcp.listTools?.({ serverId: "legacy-sse" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "legacy_sse_echo");
    assert.deepEqual(notifications, [{
      method: "notifications/progress",
      params: { progressToken: "legacy-sse-list", progress: 1, total: 1 },
    }]);
    assert.deepEqual(seen, [
      { method: "GET", url: "/sse" },
      { method: "initialize", url: "/sse-rpc" },
      { method: "notifications/initialized", url: "/sse-rpc" },
      { method: "tools/list", url: "/sse-rpc" },
    ]);
  } finally {
    await mcp?.shutdown?.({});
    sseStream?.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime HTTP adapter forwards paginated tools and resources cursors", async () => {
  const seen: Array<{ method?: string; params?: Record<string, unknown> }> = [];
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
      const payload = JSON.parse(body) as { id?: string | number; method?: string; params?: Record<string, unknown> };
      seen.push({ method: payload.method, params: payload.params });
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "paged_tool", inputSchema: { type: "object" } }], nextCursor: "tools-page-2" }
        : payload.method === "resources/list"
          ? { resources: [{ uri: "memory://paged", name: "paged" }], nextCursor: "resources-page-2" }
          : payload.method === "resources/templates/list"
            ? { resourceTemplates: [{ uriTemplate: "memory://{name}", name: "memory-template", description: "Memory template" }], nextCursor: "templates-page-2" }
          : { ok: true };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "paged-http",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
      }],
    });

    const tools = await mcp.listTools?.({ serverId: "paged-http", cursor: "tools-page-1" });
    assert.equal(tools?.ok, true);
    assert.equal(tools?.output.nextCursor, "tools-page-2");

    const resources = await mcp.listResources?.({ serverId: "paged-http", cursor: "resources-page-1" });
    assert.equal(resources?.ok, true);
    assert.equal(resources?.output.nextCursor, "resources-page-2");
    assert.equal(resources?.output.exhausted, false);

    const templates = await mcp.listResourceTemplates?.({ serverId: "paged-http", cursor: "templates-page-1" });
    assert.equal(templates?.ok, true);
    assert.equal(templates?.output.resourceTemplates[0]?.uriTemplate, "memory://{name}");
    assert.equal(templates?.output.nextCursor, "templates-page-2");
    assert.equal(templates?.output.exhausted, false);

    assert.deepEqual(seen.map((item) => ({ method: item.method, params: item.params })), [
      { method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "praxis-agentcore", version: "0.1.0" } } },
      { method: "notifications/initialized", params: {} },
      { method: "tools/list", params: { cursor: "tools-page-1" } },
      { method: "resources/list", params: { cursor: "resources-page-1" } },
      { method: "resources/templates/list", params: { cursor: "templates-page-1" } },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime HTTP adapter forwards resource subscription requests", async () => {
  const seen: Array<{ method?: string; params?: Record<string, unknown> }> = [];
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
      const payload = JSON.parse(body) as { id?: string | number; method?: string; params?: Record<string, unknown> };
      seen.push({ method: payload.method, params: payload.params });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { ok: true } }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "resource-events",
        transport: "http",
        url: `http://127.0.0.1:${address.port}/rpc`,
      }],
    });

    const subscribed = await mcp.subscribe?.({
      serverId: "resource-events",
      subjectType: "resource",
      subject: "memory://watched",
      eventKinds: ["changed"],
    });
    assert.equal(subscribed?.ok, true);
    assert.equal(subscribed?.output.uri, "memory://watched");
    assert.equal(subscribed?.output.providerMetadata.method, "resources/subscribe");

    const unsubscribed = await mcp.unsubscribe?.({
      serverId: "resource-events",
      subscriptionId: "resource-events:subscription:resource:memory://watched",
    });
    assert.equal(unsubscribed?.ok, true);
    assert.equal(unsubscribed?.output.uri, "memory://watched");
    assert.equal(unsubscribed?.output.providerMetadata.method, "resources/unsubscribe");

    assert.deepEqual(seen.map((item) => ({ method: item.method, params: item.params })), [
      { method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "praxis-agentcore", version: "0.1.0" } } },
      { method: "notifications/initialized", params: {} },
      { method: "resources/subscribe", params: { uri: "memory://watched" } },
      { method: "resources/unsubscribe", params: { uri: "memory://watched" } },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("MCP runtime stdio adapter sends initialized notification before tools/list", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-stdio-"));
  const serverPath = path.join(workspace, "stdio-mcp-server.mjs");
  await writeFile(serverPath, `
let buffer = "";
let initialized = false;
const seen = [];
function frame(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body, "utf8") + "\\r\\n\\r\\n" + body);
}
function readFrames() {
  while (true) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\\s*(\\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + Number(match[1]);
    if (buffer.length < bodyEnd) return;
    const payload = JSON.parse(buffer.slice(bodyStart, bodyEnd));
    buffer = buffer.slice(bodyEnd);
    seen.push(payload.method);
    if (payload.method === "initialize") {
      frame({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } } });
    } else if (payload.method === "notifications/initialized") {
      initialized = true;
    } else if (payload.method === "tools/list") {
      if (!initialized) {
        frame({ jsonrpc: "2.0", id: payload.id, error: { code: -32002, message: "not initialized" } });
      } else {
        frame({ jsonrpc: "2.0", id: payload.id, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } });
      }
    } else if (payload.method === "logging/setLevel") {
      frame({ jsonrpc: "2.0", id: payload.id, result: { accepted: true, level: payload.params.level } });
    } else if (payload.method === "notifications/cancelled") {
      // Notification: no response.
    } else if (payload.method === "debug/seen") {
      frame({ jsonrpc: "2.0", id: payload.id, result: { seen } });
    }
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  readFrames();
});
`, "utf8");

  try {
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-standard",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 1_000,
        framing: "content-length",
      }],
    });

    const listed = await mcp.listTools?.({ serverId: "stdio-standard" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "echo");

    const logging = await mcp.setLoggingLevel?.({ serverId: "stdio-standard", level: "warning" });
    assert.equal(logging?.ok, true);
    assert.equal(logging?.output.level, "warning");

    const cancelled = await mcp.cancelExecution?.({ serverId: "stdio-standard", executionId: "stdio-request-1", reason: "done" });
    assert.equal(cancelled?.ok, true);
    assert.equal(cancelled?.output.status, "cancelled");

    const seen = await mcp.nativeExecute?.({ serverId: "stdio-standard", method: "debug/seen", params: {} });
    assert.equal(seen?.ok, true);
    assert.deepEqual((seen?.ok ? (seen.output as { result?: { seen?: string[] } }).result?.seen : undefined), [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "logging/setLevel",
      "notifications/cancelled",
      "debug/seen",
    ]);
    await mcp.disconnect?.({ serverId: "stdio-standard" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP runtime stdio adapter answers server roots requests and records notifications", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-roots-"));
  const serverPath = path.join(workspace, "roots-mcp-server.mjs");
  await writeFile(serverPath, `
let buffer = "";
let rootsRequestId;
let toolsListId;
function frame(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body, "utf8") + "\\r\\n\\r\\n" + body);
}
function readFrames() {
  while (true) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\\s*(\\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + Number(match[1]);
    if (buffer.length < bodyEnd) return;
    const payload = JSON.parse(buffer.slice(bodyStart, bodyEnd));
    buffer = buffer.slice(bodyEnd);
    if (payload.method === "initialize") {
      const hasRoots = payload.params?.capabilities?.roots?.listChanged === true;
      frame({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "roots", version: "1" }, hasRoots } });
    } else if (payload.method === "tools/list") {
      toolsListId = payload.id;
      rootsRequestId = "roots-" + payload.id;
      frame({ jsonrpc: "2.0", id: rootsRequestId, method: "roots/list", params: {} });
      frame({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "scan", progress: 1, total: 2, message: "scanning roots" } });
    } else if (payload.id === rootsRequestId) {
      const roots = payload.result?.roots ?? [];
      frame({ jsonrpc: "2.0", id: toolsListId, result: { tools: [{ name: roots[0]?.name ?? "missing_root", description: roots[0]?.uri ?? "missing", inputSchema: { type: "object" } }] } });
    }
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  readFrames();
});
`, "utf8");

  const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
  let mcp: ReturnType<typeof createMcpRuntimeAdapter> | undefined;
  try {
    mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-roots",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 1_000,
        framing: "content-length",
      }],
      host: {
        onNotification(notification) {
          notifications.push({ method: notification.method, params: notification.params });
        },
      },
    });

    const registered = await mcp.setRoots?.({
      serverId: "stdio-roots",
      roots: [{ uri: `file://${workspace}`, name: "workspace-root" }],
    });
    assert.equal(registered?.ok, true);
    if (registered?.ok) assert.equal(registered.output.roots[0]?.name, "workspace-root");

    const listed = await mcp.listTools?.({ serverId: "stdio-roots" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) {
      assert.equal(listed.output.tools[0]?.name, "workspace-root");
      assert.equal(listed.output.tools[0]?.description, `file://${workspace}`);
    }

    assert.deepEqual(notifications, [{
      method: "notifications/progress",
      params: { progressToken: "scan", progress: 1, total: 2, message: "scanning roots" },
    }]);
    await mcp.disconnect?.({ serverId: "stdio-roots" });
  } finally {
    await mcp?.shutdown?.({});
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP runtime stdio adapter uses host hooks for sampling and elicitation requests", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-host-hooks-"));
  const serverPath = path.join(workspace, "hooks-mcp-server.mjs");
  await writeFile(serverPath, `
let buffer = "";
let pendingToolsListId;
let samplingDone = false;
let elicitationDone = false;
let hooksDeclared = false;
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}
function maybeFinish() {
  if (pendingToolsListId !== undefined && samplingDone && elicitationDone) {
    send({ jsonrpc: "2.0", id: pendingToolsListId, result: { tools: [{ name: "hooked", description: "Hooked", inputSchema: { type: "object" } }] } });
    pendingToolsListId = undefined;
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const line of chunk.split("\\n")) {
    if (line.trim().length === 0) continue;
    const payload = JSON.parse(line);
    if (payload.method === "initialize") {
      hooksDeclared = payload.params?.capabilities?.sampling !== undefined && payload.params?.capabilities?.elicitation?.form !== undefined && payload.params?.capabilities?.elicitation?.url !== undefined;
      send({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hooks", version: "1" } } });
    } else if (payload.method === "tools/list") {
      if (!hooksDeclared) {
        send({ jsonrpc: "2.0", id: payload.id, error: { code: -32002, message: "host hooks were not declared" } });
        continue;
      }
      pendingToolsListId = payload.id;
      send({ jsonrpc: "2.0", id: "sampling-1", method: "sampling/createMessage", params: { messages: [{ role: "user", content: { type: "text", text: "summarize" } }], maxTokens: 16 } });
      send({ jsonrpc: "2.0", id: "elicit-1", method: "elicitation/create", params: { mode: "form", message: "Need confirmation", requestedSchema: { type: "object", properties: { ok: { type: "boolean" } } } } });
    } else if (payload.id === "sampling-1") {
      if (payload.result?.model === "praxis-test-model") samplingDone = true;
      maybeFinish();
    } else if (payload.id === "elicit-1") {
      if (payload.result?.action === "decline") elicitationDone = true;
      maybeFinish();
    }
  }
});
`, "utf8");

  const requested: string[] = [];
  let mcp: ReturnType<typeof createMcpRuntimeAdapter> | undefined;
  try {
    mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-host-hooks",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 1_000,
      }],
      host: {
        createSamplingMessage(request) {
          requested.push(request.method);
          return { role: "assistant", content: { type: "text", text: "sampled" }, model: "praxis-test-model", stopReason: "endTurn" };
        },
        elicit(request) {
          requested.push(request.method);
          return { action: "decline" };
        },
      },
    });

    const listed = await mcp.listTools?.({ serverId: "stdio-host-hooks" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "hooked");
    assert.deepEqual(requested, ["sampling/createMessage", "elicitation/create"]);
    await mcp.disconnect?.({ serverId: "stdio-host-hooks" });
  } finally {
    await mcp?.shutdown?.({});
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP runtime stdio adapter defaults to line-json framing", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-line-json-"));
  const serverPath = path.join(workspace, "line-json-mcp-server.mjs");
  await writeFile(serverPath, `
let initialized = false;
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const line of chunk.split("\\n")) {
    if (line.trim().length === 0) continue;
    const payload = JSON.parse(line);
    if (payload.method === "initialize") {
      send({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "line", version: "1" } } });
    } else if (payload.method === "notifications/initialized") {
      initialized = true;
    } else if (payload.method === "tools/list") {
      send(initialized
        ? { jsonrpc: "2.0", id: payload.id, result: { tools: [{ name: "line_echo", description: "Echo", inputSchema: { type: "object" } }] } }
        : { jsonrpc: "2.0", id: payload.id, error: { code: -32002, message: "not initialized" } });
    }
  }
});
`, "utf8");

  try {
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-line-json-default",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 1_000,
      }],
    });

    const listed = await mcp.listTools?.({ serverId: "stdio-line-json-default" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "line_echo");
    await mcp.disconnect?.({ serverId: "stdio-line-json-default" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP runtime stdio adapter reconnects after a child exits", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-reconnect-"));
  const serverPath = path.join(workspace, "reconnect-mcp-server.mjs");
  await writeFile(serverPath, `
let initialized = false;
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const line of chunk.split("\\n")) {
    if (line.trim().length === 0) continue;
    const payload = JSON.parse(line);
    if (payload.method === "initialize") {
      send({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "reconnect", version: "1" } } });
    } else if (payload.method === "notifications/initialized") {
      initialized = true;
    } else if (payload.method === "tools/list") {
      send(initialized
        ? { jsonrpc: "2.0", id: payload.id, result: { tools: [{ name: "reconnect_echo", description: "Echo", inputSchema: { type: "object" } }] } }
        : { jsonrpc: "2.0", id: payload.id, error: { code: -32002, message: "not initialized" } });
      process.exit(0);
    }
  }
});
`, "utf8");

  try {
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-reconnect",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 250,
      }],
    });

    const first = await mcp.listTools?.({ serverId: "stdio-reconnect" });
    assert.equal(first?.ok, true);
    await sleep(25);
    const second = await mcp.listTools?.({ serverId: "stdio-reconnect" });
    assert.equal(second?.ok, true);
    if (second?.ok) assert.equal(second.output.tools[0]?.name, "reconnect_echo");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP runtime stdio adapter shutdown terminates child connections", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "praxis-mcp-shutdown-"));
  const serverPath = path.join(workspace, "shutdown-mcp-server.mjs");
  const markerPath = path.join(workspace, "terminated.txt");
  await writeFile(serverPath, `
import { writeFileSync } from "node:fs";
const markerPath = ${JSON.stringify(markerPath)};
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}
process.on("SIGTERM", () => {
  writeFileSync(markerPath, "terminated", "utf8");
  process.exit(0);
});
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const line of chunk.split("\\n")) {
    if (line.trim().length === 0) continue;
    const payload = JSON.parse(line);
    if (payload.method === "initialize") {
      send({ jsonrpc: "2.0", id: payload.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "shutdown", version: "1" } } });
    } else if (payload.method === "tools/list") {
      send({ jsonrpc: "2.0", id: payload.id, result: { tools: [{ name: "shutdown_echo", description: "Echo", inputSchema: { type: "object" } }] } });
    }
  }
});
`, "utf8");

  try {
    const mcp = createMcpRuntimeAdapter({
      servers: [{
        serverId: "stdio-shutdown",
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        timeoutMs: 1_000,
      }],
    });

    const listed = await mcp.listTools?.({ serverId: "stdio-shutdown" });
    assert.equal(listed?.ok, true);
    const shutdown = await mcp.shutdown?.({});
    assert.equal(shutdown?.ok, true);
    assert.equal(shutdown?.output.closedConnections, 1);
    for (let attempt = 0; attempt < 20 && !existsSync(markerPath); attempt += 1) {
      await sleep(25);
    }
    assert.equal(existsSync(markerPath), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
