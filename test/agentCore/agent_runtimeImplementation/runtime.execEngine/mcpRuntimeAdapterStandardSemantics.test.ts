import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

    const prompts = await mcp.listPrompts?.({ serverId: "standard-mcp" });
    assert.equal(prompts?.ok, true);
    assert.equal(prompts?.output.prompts[0]?.name, "triage");

    const prompt = await mcp.getPrompt?.({ serverId: "standard-mcp", name: "triage", arguments: { topic: "repo" } });
    assert.equal(prompt?.ok, true);
    assert.match(JSON.stringify(prompt?.output), /Triage prompt/u);

    const progress = await mcp.reportProgress?.({ serverId: "standard-mcp", progressToken: "p1", progress: 1, total: 2 });
    assert.equal(progress?.ok, true);
    assert.equal(progress?.output.status, "reported");

    assert.deepEqual(seenMethods, ["initialize", "prompts/list", "prompts/get"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
