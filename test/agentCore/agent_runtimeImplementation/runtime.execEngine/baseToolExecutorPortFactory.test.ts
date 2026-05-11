import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { builtinBaseToolHandlers } from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { invokeMountedBaseTool } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.js";
import {
  baseToolExecutorPortFactoryDescriptor,
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import { sandbox } from "../../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";
import { prepareSandboxRuntime } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  baseToolSupportCatalogDescriptor,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  snapshotBaseToolSupportCatalog,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";

const execFileAsync = promisify(execFile);

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.md",
  testFileUrl: import.meta.url,
});

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.md",
  testFileUrl: import.meta.url,
});

async function makeWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-base-tool-runtime-"));
  await writeFile(path.join(workspace, "notes.txt"), "alpha\nbeta\nneedle\n", "utf8");
  return workspace;
}

async function firstExistingPath(paths: readonly string[]): Promise<string | undefined> {
  for (const candidate of paths) {
    const ok = await access(candidate).then(() => true).catch(() => false);
    if (ok) return candidate;
  }
  return undefined;
}

async function waitForFileText(filePath: string, expected: string): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    const text = await readFile(filePath, "utf8").catch(() => "");
    if (text.includes(expected)) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  const finalText = await readFile(filePath, "utf8").catch(() => "");
  assert.match(finalText, new RegExp(expected, "u"));
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

test("baseToolSupportCatalog covers the 175 builtin baseTool handlers without office TAP", () => {
  const catalog = createBaseToolSupportCatalog();
  const snapshot = snapshotBaseToolSupportCatalog();
  const catalogIds = new Set(catalog.map((entry) => entry.toolId));

  assert.equal(baseToolSupportCatalogDescriptor.toolCountTarget, 175);
  assert.equal(catalog.length, 175);
  assert.equal(snapshot.total, 175);
  assert.equal(snapshot.byFamily.office, 0);
  assert.equal(catalog.some((entry) => entry.storageFamily === "officeBase"), false);

  for (const handler of builtinBaseToolHandlers) {
    assert.equal(catalogIds.has(handler.definition.toolId), true, handler.definition.toolId);
  }

  const shell = catalog.find((entry) => entry.toolId === "shell.commandExecution");
  assert.ok(shell);
  assert.equal(shell.family, "shell");
  assert.equal(shell.group, "shellExecution");
  assert.equal(shell.requiredSupports.some((support) => support.portPath === "shell.run"), true);

  const code = catalog.find((entry) => entry.toolId === "code.read");
  assert.ok(code);
  assert.equal(code.group, "explore");
  assert.equal(code.requiredSupports.some((support) => support.portPath === "filesystem.readText"), true);

  const search = catalog.find((entry) => entry.toolId === "search.fetch");
  assert.ok(search);
  assert.equal(search.group, "(flat)");
  assert.equal(search.requiredSupports.some((support) => support.portPath === "network.fetch"), true);
});

test("baseToolExecutorPortFactory exposes every support port required by the 175-tool catalog", () => {
  const catalog = createBaseToolSupportCatalog();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-port-shape",
    sessionId: "session-factory-port-shape",
  });
  const requiredPortPaths = [
    ...new Set(catalog.flatMap((entry) => entry.requiredSupports.map((support) => support.portPath).filter((portPath): portPath is string => portPath !== undefined))),
  ];

  for (const portPath of requiredPortPaths) {
    assert.equal(typeof lookupPortMethod(executor, portPath), "function", portPath);
  }
});

test("baseToolSupportCatalog preflight treats runtime-owned MCP adapters as governed host-ready ports", () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-preflight",
    sessionId: "session-factory-preflight",
  });

  const mcp = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.connect",
    executor,
    implementedPortPaths: baseToolExecutorPortFactoryDescriptor.implementedAdapters,
  });
  assert.equal(mcp.found, true);
  assert.equal(mcp.decision, "requiresApproval");
  assert.equal(mcp.blockingSupports.length, 0);
  assert.equal(mcp.approvalSupports.some((support) => support.supportKind === "permission"), true);

  const code = evaluateBaseToolRuntimeReadiness({
    toolId: "code.read",
    executor,
    implementedPortPaths: baseToolExecutorPortFactoryDescriptor.implementedAdapters,
  });
  assert.equal(code.found, true);
  assert.equal(code.blockingSupports.length, 0);
  assert.equal(code.decision, "requiresApproval");
  assert.equal(code.approvalSupports.some((support) => support.supportKind === "permission"), true);

  const withBackend = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.connect",
    executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths({
      adapters: {
        mcp: {
          async connect() {
            return { ok: true, output: { status: "connected" } };
          },
        },
      },
    }),
  });
  assert.equal(withBackend.found, true);
  assert.equal(withBackend.blockingSupports.length, 0);
  assert.equal(withBackend.decision, "requiresApproval");
});

test("baseToolExecutorPortFactory returns a complete port and stable unavailable fallbacks", async () => {
  const workspace = await makeWorkspace();
  const events: string[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-1",
    sessionId: "session-factory-1",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
    emitEvent: (event) => events.push(event.type),
  });

  assert.ok(baseToolExecutorPortFactoryDescriptor.implementedAdapters.includes("filesystem.readText"));
  assert.ok(baseToolExecutorPortFactoryDescriptor.implementedAdapters.includes("mcp.ping"));
  assert.ok(baseToolExecutorPortFactoryDescriptor.implementedAdapters.includes("computeruse.captureScreenshot"));
  assert.ok(baseToolExecutorPortFactoryDescriptor.implementedAdapters.includes("omni.transformMedia"));
  assert.equal(typeof executor.filesystem?.readText, "function");
  assert.equal(typeof executor.shell?.run, "function");
  assert.equal(typeof executor.git?.runGit, "function");
  assert.equal(typeof executor.mcp?.ping, "function");

  const mcpPing = await executor.mcp?.ping?.({ serverId: "local", timeoutMs: 1 });
  assert.equal(mcpPing?.ok, true);

  const read = await executor.filesystem?.readText?.({ path: "notes.txt" });
  assert.equal(read?.ok, true);
  assert.ok(events.includes("runtime.execEngine.baseToolExecutorPort.filesystem.readText"));
});

test("baseToolExecutorPortFactory delegates injected backend adapters before unavailable fallback", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-delegated",
    sessionId: "session-factory-delegated",
    adapters: {
      mcp: {
        async ping(request) {
          return {
            ok: true,
            output: {
              healthy: true,
              status: "delegated",
              latencyMs: request.timeoutMs ?? 0,
            },
          };
        },
      },
    },
  });

  const delegated = await executor.mcp?.ping?.({ serverId: "local", timeoutMs: 7 });
  assert.equal(delegated?.ok, true);
  if (delegated?.ok) {
    assert.equal(delegated.output.status, "delegated");
    assert.equal(delegated.output.latencyMs, 7);
  }
});

test("baseToolExecutorPortFactory drives configured MCP HTTP/SSE runtime provider", async () => {
  const seenMethods: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
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
      const result = payload.method === "tools/list"
        ? { tools: [{ name: "echo", description: "HTTP MCP echo", inputSchema: { type: "object" } }] }
        : payload.method === "tools/call"
          ? { content: [{ type: "text", text: `echo:${String((payload.params?.arguments as Record<string, unknown> | undefined)?.message ?? "")}` }] }
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

    const connected = await executor.mcp?.connect?.({ serverId: "http-sse-mcp", transportHint: "sse" });
    assert.equal(connected?.ok, true);
    if (connected?.ok) assert.equal(connected.output.providerMetadata?.transport, "sse");

    const listed = await executor.mcp?.listTools?.({ serverId: "http-sse-mcp" });
    assert.equal(listed?.ok, true);
    if (listed?.ok) assert.equal(listed.output.tools[0]?.name, "echo");

    const called = await executor.mcp?.callTool?.({
      serverId: "http-sse-mcp",
      toolName: "echo",
      arguments: { message: "hello" },
    });
    assert.equal(called?.ok, true);
    if (called?.ok) assert.match(JSON.stringify(called.output), /echo:hello/u);
    assert.deepEqual(seenMethods, ["initialize", "tools/list", "tools/call"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("baseToolExecutorPortFactory blocks Linux desktop pointer and keyboard actions without injected provider", async () => {
  const waylandExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-wayland",
    sessionId: "session-factory-wayland",
    environment: {
      XDG_SESSION_TYPE: "wayland",
      WAYLAND_DISPLAY: "wayland-0",
      DISPLAY: ":0",
    },
  });
  const wayland = await waylandExecutor.computeruse?.pointerAction?.({
    action: "move",
    target: {
      x: 1,
      y: 2,
      coordinateSpace: "screen",
    },
  });
  assert.equal(wayland?.ok, false);
  if (wayland?.ok === false) {
    assert.equal(wayland.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(wayland.error.message, /ydotool/u);
    assert.match(wayland.error.message, /no pointer action was executed/u);
  }

  const x11Executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-x11",
    sessionId: "session-factory-x11",
    environment: {
      XDG_SESSION_TYPE: "x11",
      DISPLAY: ":1",
    },
  });
  const x11 = await x11Executor.computeruse?.keyboardAction?.({
    action: "press",
    keys: ["Escape"],
  });
  assert.equal(x11?.ok, false);
  if (x11?.ok === false) {
    assert.equal(x11.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(x11.error.message, /xdotool/u);
    assert.match(x11.error.message, /no keyboard input was executed/u);
  }
});

test("baseToolExecutorPortFactory requires explicit managed terminal session targets", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-managed-terminal",
    sessionId: "session-factory-managed-terminal",
    environment: {
      XDG_SESSION_TYPE: "wayland",
      WAYLAND_DISPLAY: "wayland-0",
      PRAXIS_ENABLE_DESKTOP_AUTOMATION: "1",
    },
  });

  const missingSession = await executor.computeruse?.keyboardAction?.({
    action: "type",
    text: "hello",
    metadata: { targetHint: "managed terminal" },
  });
  assert.equal(missingSession?.ok, false);
  if (missingSession?.ok === false) {
    assert.equal(missingSession.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(missingSession.error.message, /explicit tmux\/pty\/terminal session/u);
    assert.doesNotMatch(missingSession.error.message, /praxis-caonima-work/u);
  }
});

test("baseToolExecutorPortFactory routes explicit tmux keyboard text and submit without focus or IME", async (t) => {
  const tmux = await firstExistingPath(["/usr/bin/tmux", "/usr/local/bin/tmux"]);
  if (tmux === undefined) {
    t.skip("tmux is not installed on this host");
    return;
  }
  const workspace = await makeWorkspace();
  const session = `praxis-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const markerPath = path.join(workspace, "keyboard-marker.txt");

  await execFileAsync(tmux, ["new-session", "-d", "-s", session, "-c", workspace]);
  try {
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    const executor = createRuntimeBaseToolExecutorPort({
      runtimeId: "runtime-factory-tmux-keyboard",
      sessionId: "session-factory-tmux-keyboard",
      policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
      environment: {
        XDG_SESSION_TYPE: "wayland",
        WAYLAND_DISPLAY: "wayland-0",
        PRAXIS_ENABLE_DESKTOP_AUTOMATION: "1",
      },
    });

    const typed = await executor.computeruse?.keyboardAction?.({
      action: "type",
      text: `printf PRAXIS_TMUX_INPUT_OK > ${markerPath}`,
      metadata: { targetHint: `tmux:${session}`, runtimeGuardAccepted: true },
    });
    assert.equal(typed?.ok, true);
    if (typed?.ok) {
      assert.equal(typed.output.metadata?.provider, "tmux");
      assert.equal(typed.output.metadata?.focusIndependent, true);
      assert.equal(typed.output.metadata?.imeBypassed, true);
    }

    const submitted = await executor.computeruse?.keyboardAction?.({
      action: "submit",
      keys: ["Enter"],
      metadata: { targetHint: `tmux:${session}`, runtimeGuardAccepted: true },
    });
    assert.equal(submitted?.ok, true);
    await waitForFileText(markerPath, "PRAXIS_TMUX_INPUT_OK");
  } finally {
    await execFileAsync(tmux, ["kill-session", "-t", session]).catch(() => undefined);
  }
});

test("baseToolExecutorPortFactory refuses non-ASCII desktop keyboard text without stable target", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-nonascii-keyboard",
    sessionId: "session-factory-nonascii-keyboard",
    environment: {
      XDG_SESSION_TYPE: "wayland",
      WAYLAND_DISPLAY: "wayland-0",
      PRAXIS_ENABLE_DESKTOP_AUTOMATION: "1",
    },
  });

  const result = await executor.computeruse?.keyboardAction?.({
    action: "type",
    text: "今天的金价是多少",
  });
  assert.equal(result?.ok, false);
  if (result?.ok === false) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(result.error.message, /explicit bound target/u);
    assert.match(result.error.message, /window:active/u);
    assert.match(result.error.message, /tmux:<session>/u);
  }
});

test("baseToolExecutorPortFactory refuses unapproved natural-language current-window keyboard targets", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-current-window-keyboard",
    sessionId: "session-factory-current-window-keyboard",
    environment: {
      XDG_SESSION_TYPE: "wayland",
      WAYLAND_DISPLAY: "wayland-0",
      PRAXIS_ENABLE_DESKTOP_AUTOMATION: "1",
    },
  });

  const result = await executor.computeruse?.keyboardAction?.({
    action: "type",
    text: "test: reply with OK only.",
    metadata: {
      targetHint: "current window (ghostty terminal)",
    },
  });
  assert.equal(result?.ok, false);
  if (result?.ok === false) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(result.error.message, /explicit bound target/u);
    assert.match(result.error.message, /managed terminal target/u);
  }
});

test("baseToolExecutorPortFactory resolves approved current Ghostty hints before provider selection", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-current-window-keyboard-approved",
    sessionId: "session-factory-current-window-keyboard-approved",
    environment: {
      XDG_SESSION_TYPE: "headless",
    },
  });

  const result = await executor.computeruse?.keyboardAction?.({
    action: "type",
    text: "test: reply with OK only.",
    metadata: {
      targetHint: "current window (ghostty terminal)",
      runtimeGuardAccepted: true,
    },
  });
  assert.equal(result?.ok, false);
  if (result?.ok === false) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.doesNotMatch(result.error.message, /explicit bound target/u);
    assert.match(result.error.message, /desktop automation provider/u);
  }
});

test("baseToolExecutorPortFactory resolves approved current browser address-bar hints before provider selection", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-current-browser-keyboard-approved",
    sessionId: "session-factory-current-browser-keyboard-approved",
    environment: {
      XDG_SESSION_TYPE: "headless",
    },
  });

  const result = await executor.computeruse?.keyboardAction?.({
    action: "shortcut",
    keys: ["Control", "L"],
    metadata: {
      targetHint: "当前 Edge 浏览器地址栏",
      runtimeGuardAccepted: true,
    },
  });
  assert.equal(result?.ok, false);
  if (result?.ok === false) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.doesNotMatch(result.error.message, /explicit bound target/u);
    assert.match(result.error.message, /desktop automation provider/u);
  }
});

test("baseToolExecutorPortFactory never grants computeruse device permission without interface/provider adapter", async () => {
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-device-permission",
    sessionId: "session-factory-device-permission",
  });

  const permission = await executor.computeruse?.requestPermission?.({
    resource: "camera",
    purpose: "capture a photo",
    deviceId: "camera-1",
  });
  assert.equal(permission?.ok, false);
  if (permission?.ok === false) {
    assert.equal(permission.error.code, "APPROVAL_REQUIRED");
    assert.match(permission.error.message, /external interface approval surface/u);
    assert.match(permission.error.message, /will not grant fake system permission/u);
  }
});

test("baseToolExecutorPortFactory provides governed network.fetch and shell guard adapters", async () => {
  const workspace = await makeWorkspace();
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
      policy: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        allowNetworkFetch: true,
      },
      resourceLimits: {
        maxOutputBytes: 128,
      },
    });

    const fetched = await executor.network?.fetch?.({ url: `http://127.0.0.1:${address.port}/`, maxBytes: 64 });
    assert.equal(fetched?.ok, true);
    if (fetched?.ok) {
      assert.equal(fetched.output.status, 200);
      assert.equal(fetched.output.body, "hello-runtime-network");
    }

    const blocked = await executor.shell?.validateCommand?.({ command: "rm -rf /", shell: "bash" });
    assert.equal(blocked?.ok, true);
    if (blocked?.ok) {
      assert.equal(blocked.output.verdict, "blocked");
      assert.equal(blocked.output.requiresTapApproval, true);
    }

    const sandbox = await executor.shell?.enforceSandbox?.({
      command: "cat /etc/passwd",
      workingDirectory: workspace,
      requestedPaths: ["/etc/passwd"],
      accessIntents: ["read"],
    });
    assert.equal(sandbox?.ok, true);
    if (sandbox?.ok) {
      assert.equal(sandbox.output.allowed, false);
      assert.equal(sandbox.output.enforced, false);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("runtime factory executor can drive code read, code search, and code edit through mounted baseTools", async () => {
  const workspace = await makeWorkspace();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-2",
    sessionId: "session-factory-2",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowFilesystemWrite: true,
      allowRipgrep: true,
    },
  });

  const read = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-2",
    sessionId: "session-factory-2",
    toolId: "code.read",
    toolCallId: "code-read-factory",
    input: {
      workspaceRoot: workspace,
      targetPath: "notes.txt",
      dryRun: false,
      context: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        dryRun: false,
      },
    },
    executor,
    runtimeReady: true,
  });
  assert.equal(read.ok, true);
  if (!read.ok) throw new Error("expected code.read to succeed");
  assert.equal(read.toolResult.ok, true);
  if (read.toolResult.ok) {
    const output = asRecord(read.toolResult.output);
    assert.equal(String(output.content).includes("needle"), true);
  }

  const search = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-2",
    sessionId: "session-factory-2",
    toolId: "code.search_Ripgrep",
    toolCallId: "code-search-factory",
    input: {
      workspaceRoot: workspace,
      query: "needle",
      directoryPath: ".",
      maxMatches: 5,
      literal: true,
      dryRun: false,
      context: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        dryRun: false,
      },
    },
    executor,
    runtimeReady: true,
  });
  assert.equal(search.ok, true);
  if (!search.ok) throw new Error("expected code.search_Ripgrep to succeed");
  assert.equal(search.toolResult.ok, true);
  if (search.toolResult.ok) {
    const output = asRecord(search.toolResult.output);
    assert.equal(Array.isArray(output.matches), true);
    assert.equal((output.matches as unknown[]).length, 1);
  }

  const edit = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-2",
    sessionId: "session-factory-2",
    toolId: "code.overwrite",
    toolCallId: "code-overwrite-factory",
    input: {
      workspaceRoot: workspace,
      targetPath: "notes.txt",
      content: "rewritten\n",
      dryRun: false,
      guard: { accepted: true },
      context: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        dryRun: false,
        guard: { accepted: true },
      },
    },
    executor,
    runtimeReady: true,
  });
  assert.equal(edit.ok, true);
  if (!edit.ok) throw new Error("expected code.overwrite to succeed");
  assert.equal(edit.toolResult.ok, true);
  assert.equal(await readFile(path.join(workspace, "notes.txt"), "utf8"), "rewritten\n");
});

test("runtime factory executor can drive git inspection through mounted baseTools", async () => {
  const workspace = await makeWorkspace();
  const setupExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-3",
    sessionId: "session-factory-3",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowGitExecution: true,
      allowProcessExecution: true,
    },
  });
  const init = await setupExecutor.git?.runGit?.({ repositoryPath: workspace, args: ["init"] });
  assert.equal(init?.ok, true);

  const status = await invokeMountedBaseTool({
    runtimeId: "runtime-factory-3",
    sessionId: "session-factory-3",
    toolId: "git.getRepositoryStatus",
    toolCallId: "git-status-factory",
    input: {
      target: {
        repositoryPath: workspace,
        includeUntracked: true,
      },
      context: {
        dryRun: false,
        guard: { accepted: true },
        allowedRepositoryRoots: [workspace],
        grantedPermissions: ["git:read", "filesystem:read"],
      },
    },
    executor: setupExecutor,
    runtimeReady: true,
  });

  assert.equal(status.ok, true);
  if (!status.ok) throw new Error("expected git.getRepositoryStatus to succeed");
  assert.equal(status.toolResult.ok, true);
  if (status.toolResult.ok) {
    const output = asRecord(status.toolResult.output);
    assert.equal(output.providerCalled, true);
    assert.equal(output.dryRun, false);
  }
});

test("runtime factory executor runs process-backed ports through linux bubblewrap when prepared", async () => {
  const workspace = await makeWorkspace();
  const prepared = await prepareSandboxRuntime(sandbox.linuxBubblewrap({
    resourceLimits: { timeoutMs: 5_000, maxOutputBytes: 16_000 },
  }), {
    cwd: workspace,
    runSmoke: true,
  });
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-sandbox",
    sessionId: "session-factory-sandbox",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
      allowProcessExecution: true,
    },
    sandbox: prepared,
  });

  const shellResult = await executor.shell?.run?.({ command: "pwd", cwd: workspace });
  if (!prepared.ready) {
    assert.equal(shellResult?.ok, false);
    if (shellResult?.ok === false) {
      assert.equal(shellResult.error.code, "SANDBOX_UNAVAILABLE");
    }
    return;
  }

  assert.equal(shellResult?.ok, true);
  if (shellResult?.ok) {
    assert.equal(shellResult.output.stdout.trim(), "/workspace");
    assert.equal(asRecord(shellResult.metadata).sandbox !== undefined, true);
    assert.equal(asRecord(asRecord(shellResult.metadata).sandbox).applied, true);
    assert.equal(asRecord(asRecord(shellResult.metadata).sandbox).providerFamily, "linux-bubblewrap");
  }

  const processResult = await executor.process?.run?.({ command: "pwd", cwd: workspace });
  assert.equal(processResult?.ok, true);
  if (processResult?.ok) {
    assert.equal(processResult.output.stdout.trim(), "/workspace");
    assert.equal(asRecord(asRecord(processResult.metadata).sandbox).applied, true);
  }
});

test("linux bubblewrap defaults writes to sandbox storage until five-mode policy relaxes workspace writes", async () => {
  const workspace = await makeWorkspace();
  const prepared = await prepareSandboxRuntime(sandbox.linuxBubblewrap({
    resourceLimits: { timeoutMs: 5_000, maxOutputBytes: 16_000 },
  }), {
    cwd: workspace,
    runSmoke: true,
  });

  const defaultExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-sandbox-default-write",
    sessionId: "session-factory-sandbox-default-write",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
      allowProcessExecution: true,
    },
    sandbox: prepared,
  });

  const defaultWrite = await defaultExecutor.shell?.run?.({
    command: "touch /workspace/should-not-write && touch /artifacts/should-write",
    cwd: workspace,
  });
  if (!prepared.ready) {
    assert.equal(defaultWrite?.ok, false);
    if (defaultWrite?.ok === false) assert.equal(defaultWrite.error.code, "SANDBOX_UNAVAILABLE");
    return;
  }

  assert.equal(defaultWrite?.ok, true);
  assert.notEqual(defaultWrite?.output.exitCode, 0);

  const yoloExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-factory-sandbox-yolo-write",
    sessionId: "session-factory-sandbox-yolo-write",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
      allowProcessExecution: true,
    },
    sandbox: {
      ...prepared,
      policyProfile: "yolo",
    },
  });
  const yoloWrite = await yoloExecutor.shell?.run?.({
    command: "touch /workspace/yolo-write-ok && test -f /workspace/yolo-write-ok",
    cwd: workspace,
  });

  assert.equal(yoloWrite?.ok, true);
  assert.equal(yoloWrite?.output.exitCode, 0);
  if (yoloWrite?.ok) {
    assert.equal(asRecord(asRecord(yoloWrite.metadata).sandbox).policyProfile, "yolo");
  }
});
