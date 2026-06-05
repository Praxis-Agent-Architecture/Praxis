import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { invokeMountedBaseTool } from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.js";
import {
  baseToolExecutorPortFactoryDescriptor,
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  baseToolSupportCatalogDescriptor,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  snapshotBaseToolSupportCatalog,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.md",
  testFileUrl: import.meta.url,
});

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.md",
  testFileUrl: import.meta.url,
});

async function makeWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-semantic-basetool-"));
  await writeFile(path.join(workspace, "notes.txt"), "alpha\nbeta\nneedle\n", "utf8");
  return workspace;
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function lookupPortMethod(executor: unknown, portPath: string): unknown {
  const [namespace, method] = portPath.split(".");
  if (namespace === undefined || method === undefined) {
    throw new Error(`invalid port path: ${portPath}`);
  }
  const namespaceValue = asRecord(executor)[namespace];
  assert.equal(typeof namespaceValue, "object", portPath);
  assert.notEqual(namespaceValue, null, portPath);
  return asRecord(namespaceValue)[method];
}

test("baseToolSupportCatalog covers the semantic basetool catalog without work TAP plugins", () => {
  const catalog = createBaseToolSupportCatalog();
  const snapshot = snapshotBaseToolSupportCatalog();

  assert.equal(baseToolSupportCatalogDescriptor.semanticCatalog, true);
  assert.equal(catalog.length, 26);
  assert.equal(snapshot.total, 26);
  assert.equal(snapshot.byFamily.work ?? 0, 0);
  assert.equal(catalog.some((entry) => entry.storageFamily === "workBase"), false);

  const shell = catalog.find((entry) => entry.toolId === "shell.run");
  assert.ok(shell);
  assert.equal(shell.family, "core");
  assert.equal(shell.group, "shell");
  assert.equal(shell.requiredSupports.some((support) => support.portPath === "shell.run"), true);

  const prompts = catalog.find((entry) => entry.toolId === "mcp.prompts");
  assert.ok(prompts);
  assert.deepEqual(prompts.requiredSupports.map((support) => support.portPath), ["mcp.listPrompts", "mcp.getPrompt"]);

  const file = catalog.find((entry) => entry.toolId === "file.read");
  assert.ok(file);
  assert.equal(file.group, "filesystem");
  assert.equal(file.requiredSupports.some((support) => support.portPath === "filesystem.readText"), true);

  const web = catalog.find((entry) => entry.toolId === "web.fetch");
  assert.ok(web);
  assert.equal(web.group, "web");
  assert.equal(web.requiredSupports.some((support) => support.portPath === "network.fetch"), true);
});

test("baseToolExecutorPortFactory exposes only real built-in support ports as implemented", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-port-shape",
    sessionId: "session-factory-port-shape",
  });

  for (const portPath of baseToolExecutorPortFactoryDescriptor.implementedAdapters) {
    assert.equal(typeof lookupPortMethod(executor, portPath), "function", portPath);
  }

  const implemented = listRuntimeBaseToolImplementedPortPaths();
  assert.equal(implemented.includes("network.search"), false);
  assert.equal(implemented.includes("context.load"), false);
  assert.equal(implemented.includes("skill.load"), false);
  assert.equal(implemented.includes("agent.spawn"), false);
  assert.equal(implemented.includes("mcp.call"), false);
  assert.equal(implemented.includes("userInteraction.ask"), false);
});

test("baseToolSupportCatalog preflight blocks adapter-required semantic tools until an adapter is mounted", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-preflight",
    sessionId: "session-factory-preflight",
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths();

  const fileRead = evaluateBaseToolRuntimeReadiness({
    toolId: "file.read",
    executor,
    implementedPortPaths,
  });
  assert.equal(fileRead.found, true);
  assert.equal(fileRead.decision, "allowed");

  const webSearch = evaluateBaseToolRuntimeReadiness({
    toolId: "web.search",
    executor,
    implementedPortPaths,
  });
  assert.equal(webSearch.found, true);
  assert.equal(webSearch.decision, "blocked");
  assert.deepEqual(webSearch.blockingSupports.map((support) => support.portPath), ["network.search"]);

  const skillLoad = evaluateBaseToolRuntimeReadiness({
    toolId: "skill.load",
    executor,
    implementedPortPaths,
  });
  assert.equal(skillLoad.found, true);
  assert.equal(skillLoad.decision, "blocked");
  assert.deepEqual(skillLoad.blockingSupports.map((support) => support.portPath), ["skill.load"]);

  const withSkillAdapter = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-skill-adapter",
    sessionId: "session-factory-skill-adapter",
    adapters: {
      skill: {
        async load() {
          return { ok: true, output: { loaded: true } };
        },
      },
    },
  });
  const adapterReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "skill.load",
    executor: withSkillAdapter,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths({
      adapters: withSkillAdapter,
    }),
  });
  assert.equal(adapterReadiness.decision, "allowed");
});

test("baseToolExecutorPortFactory drives configured MCP HTTP/SSE runtime provider through semantic aliases", async () => {
  const seenMethods: string[] = [];
  const seenReadResourceParams: Array<Record<string, unknown> | undefined> = [];
  const seenSseHeaders: Array<{ protocolVersion?: string; accept?: string }> = [];
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
      seenSseHeaders.push({
        protocolVersion: typeof request.headers["mcp-protocol-version"] === "string"
          ? request.headers["mcp-protocol-version"]
          : undefined,
        accept: typeof request.headers.accept === "string" ? request.headers.accept : undefined,
      });
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "close",
      });
      response.end("event: ready\ndata: {}\n\n");
      return;
    }
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
      if (payload.method === "resources/read") seenReadResourceParams.push(payload.params);
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "echo", description: "HTTP MCP echo", inputSchema: { type: "object" } }] }
        : payload.method === "tools/call"
          ? { content: [{ type: "text", text: `echo:${String((payload.params?.arguments as Record<string, unknown> | undefined)?.message ?? "")}` }] }
          : payload.method === "resources/list"
            ? { resources: [{ uri: "memory://hello", name: "hello" }] }
            : payload.method === "resources/read"
              ? { contents: [{ text: "resource-ok" }] }
              : { ok: true };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const executor = createRuntimeBaseToolExecutorPort({
      runtimeId: "runtime-factory-mcp-http-sse",
      sessionId: "session-factory-mcp-http-sse",
      mcpServers: [{
        serverId: "http-sse-mcp",
        transport: "sse",
        url: `${baseUrl}/rpc`,
        sseUrl: `${baseUrl}/sse`,
        timeoutMs: 3_000,
      }],
    });

    const implemented = listRuntimeBaseToolImplementedPortPaths({
      mcpServers: [{
        serverId: "http-sse-mcp",
        transport: "sse",
        url: `${baseUrl}/rpc`,
        sseUrl: `${baseUrl}/sse`,
        timeoutMs: 3_000,
      }],
    });
    assert.equal(implemented.includes("mcp.call"), true);
    assert.equal(implemented.includes("mcp.listResourceTemplates"), true);
    assert.equal(implemented.includes("mcp.subscribe"), true);
    assert.equal(implemented.includes("mcp.unsubscribe"), true);

    const connected = await executor.mcp?.connect?.({ serverId: "http-sse-mcp", transportHint: "sse" });
    assert.equal(connected?.ok, true);

    const called = await executor.mcp?.call?.({
      serverId: "http-sse-mcp",
      toolName: "echo",
      arguments: { message: "hello" },
    });
    assert.equal(called?.ok, true);
    if (called?.ok) assert.match(JSON.stringify(called.output), /echo:hello/u);

    const resources = await executor.mcp?.listResources?.({ serverId: "http-sse-mcp" });
    assert.equal(resources?.ok, true);
    if (resources?.ok) assert.equal(resources.output.resources[0]?.uri, "memory://hello");

    const readResource = await executor.mcp?.readResource?.({ serverId: "http-sse-mcp", uri: "memory://hello" });
    assert.equal(readResource?.ok, true);
    if (readResource?.ok) assert.match(JSON.stringify(readResource.output), /resource-ok/u);
    assert.deepEqual(seenReadResourceParams, [{ uri: "memory://hello" }]);

    assert.deepEqual(seenSseHeaders, [
      { protocolVersion: "2025-06-18", accept: "application/json, text/event-stream" },
    ]);

    assert.deepEqual(seenMethods, [
      "initialize",
      "notifications/initialized",
      "tools/call",
      "resources/list",
      "resources/read",
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("runtime factory preserves externally supplied MCP shutdown ownership", async () => {
  let externalShutdownCalled = false;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-mcp-external-shutdown",
    sessionId: "session-factory-mcp-external-shutdown",
    mcpServers: [{
      serverId: "configured-mcp",
      transport: "stdio",
      command: process.execPath,
      args: ["-e", "process.stdin.resume()"],
      timeoutMs: 1_000,
    }],
    adapters: {
      mcp: {
        async __praxisRuntimeOwnedShutdown() {
          externalShutdownCalled = true;
          return { ok: true as const, output: { status: "external-shutdown" } };
        },
      },
    },
  });

  const shutdown = await executor.mcp?.__praxisRuntimeOwnedShutdown?.({});
  assert.equal(externalShutdownCalled, true);
  assert.equal(shutdown?.ok, true);
  if (shutdown?.ok) assert.equal(shutdown.output.status, "external-shutdown");
});

test("runtime factory executor can drive semantic core tools through mounted baseTools", async () => {
  const workspace = await makeWorkspace();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-semantic-tools",
    sessionId: "session-factory-semantic-tools",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowFilesystemWrite: true,
      allowRipgrep: true,
      allowShellExecution: true,
      allowNetworkFetch: true,
    },
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths();

  const read = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-semantic-tools",
    sessionId: "session-factory-semantic-tools",
    toolId: "file.read",
    toolCallId: "file-read-factory",
    input: { path: "notes.txt" },
    executor,
    implementedPortPaths,
    runtimeReady: true,
  });
  assert.equal(read.ok, true);
  if (!read.ok) throw new Error("expected file.read to dispatch");
  assert.equal(read.toolResult.ok, true);
  if (read.toolResult.ok) assert.match(String(read.toolResult.output.content), /needle/u);

  const search = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-semantic-tools",
    sessionId: "session-factory-semantic-tools",
    toolId: "file.search",
    toolCallId: "file-search-factory",
    input: { query: "needle", cwd: "." },
    executor,
    implementedPortPaths,
    runtimeReady: true,
  });
  assert.equal(search.ok, true);
  if (!search.ok) throw new Error("expected file.search to dispatch");
  assert.equal(search.toolResult.ok, true);
  if (search.toolResult.ok) assert.match(String(search.toolResult.output.stdout), /needle/u);

  const patch = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-semantic-tools",
    sessionId: "session-factory-semantic-tools",
    toolId: "patch.apply",
    toolCallId: "patch-apply-factory",
    input: {
      patch: [
        "*** Begin Patch",
        "*** Update File: notes.txt",
        "@@",
        "-alpha",
        "+omega",
        "*** End Patch",
        "",
      ].join("\n"),
      cwd: workspace,
    },
    executor,
    implementedPortPaths,
    runtimeReady: true,
  });
  assert.equal(patch.ok, true);
  if (!patch.ok) throw new Error("expected patch.apply to dispatch");
  assert.equal(patch.toolResult.ok, true);
  assert.match(await readFile(path.join(workspace, "notes.txt"), "utf8"), /omega/u);

  const shell = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-semantic-tools",
    sessionId: "session-factory-semantic-tools",
    toolId: "shell.run",
    toolCallId: "shell-run-factory",
    input: { command: "printf shell-ok", cwd: workspace },
    executor,
    implementedPortPaths,
    runtimeReady: true,
  });
  assert.equal(shell.ok, true);
  if (!shell.ok) throw new Error("expected shell.run to dispatch");
  assert.equal(shell.toolResult.ok, true);
  if (shell.toolResult.ok) assert.equal(shell.toolResult.output.stdout, "shell-ok");
});

test("runtime filesystem read returns public file-not-found errors", async () => {
  const workspace = await makeWorkspace();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-file-not-found",
    sessionId: "session-factory-file-not-found",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });

  const result = await executor.filesystem?.readText?.({ path: "missing.txt" });
  assert.equal(result?.ok, false);
  assert.equal(result?.error?.code, "FILE_NOT_FOUND");
});

test("runtime filesystem read lets policy profiles reach paths outside workspace roots", async () => {
  const workspace = await makeWorkspace();
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-semantic-outside-"));
  const outsidePath = path.join(outsideRoot, "outside.txt");
  await writeFile(outsidePath, "outside-ok", "utf8");

  const standardExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-standard-outside",
    sessionId: "session-factory-standard-outside",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
    policyProfile: "standard",
  });
  const standard = await standardExecutor.filesystem?.readText?.({ path: outsidePath });
  assert.equal(standard?.ok, true);
  if (standard?.ok) {
    assert.equal(standard.output.content, "outside-ok");
    assert.equal(standard.metadata?.workspaceOutsideAllowedRoots, true);
  }

  const baprExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-bapr-outside",
    sessionId: "session-factory-bapr-outside",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
    policyProfile: "bapr",
  });
  const bapr = await baprExecutor.filesystem?.readText?.({ path: outsidePath });
  assert.equal(bapr?.ok, true);
  if (bapr?.ok) assert.equal(bapr.output.content, "outside-ok");
});

test("runtime shell uses request timeout for attached commands", async () => {
  const workspace = await makeWorkspace();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-shell-timeout",
    sessionId: "session-factory-shell-timeout",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
    },
  });

  const startedAt = Date.now();
  const result = await executor.shell?.run?.({ command: "sleep 1", cwd: workspace, timeoutMs: 20 });
  assert.equal(result?.ok, false);
  assert.equal(result?.error?.code, "COMMAND_TIMEOUT");
  assert.ok(Date.now() - startedAt < 900);
});

test("network.fetch is real while network.search remains adapter-required", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hello-runtime-network");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address() as AddressInfo;
    const executor = createRuntimeBaseToolExecutorPort({
      runtimeId: "runtime-factory-network",
      sessionId: "session-factory-network",
      policy: { allowNetworkFetch: true },
      resourceLimits: { maxOutputBytes: 128 },
      policyProfile: "bapr",
    });

    const fetched = await executor.network?.fetch?.({ url: `http://127.0.0.1:${address.port}/`, maxBytes: 64 });
    assert.equal(fetched?.ok, true);
    if (fetched?.ok) {
      assert.equal(fetched.output.status, 200);
      assert.equal(fetched.output.body, "hello-runtime-network");
    }

    const searched = await executor.network?.search?.({ query: "Praxis" });
    assert.equal(searched?.ok, false);
    if (searched?.ok === false) assert.equal(searched.error.code, "PROVIDER_UNAVAILABLE");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
