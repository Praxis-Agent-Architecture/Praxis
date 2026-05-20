import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpConnect,
  mcpConnectHandler,
  planMcpConnect,
} from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.connect.js";
import {
  executeMcpDisconnect,
  mcpDisconnectHandler,
} from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.disconnect.js";

type LifecycleTool = {
  toolId: "mcp.connect" | "mcp.disconnect";
  input: Record<string, unknown>;
  badInput: Record<string, unknown>;
  permissionGapInput: Record<string, unknown>;
  execute: (request: unknown, provider?: (request: unknown, context: Readonly<Record<string, unknown>>) => unknown | Promise<unknown>) => Promise<{
    ok: boolean;
    toolId: string;
    output?: Record<string, unknown>;
    error?: { code: string; message: string; publicSafe: true };
  }>;
  handler: BaseToolHandler;
  executor: BaseToolExecutorPort;
  providerOutput: unknown;
  providerCalled: (output: Record<string, unknown>) => boolean;
  runtimeWasCalled: () => boolean;
};

function acceptedContext(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dryRun: false,
    guard: { accepted: true },
    allowedServerIds: ["fs-mcp"],
    grantedPermissions: ["mcp:connect", "mcp:disconnect"],
    ...extra,
  };
}

function makeTools(): LifecycleTool[] {
  let connectCalls = 0;
  let disconnectCalls = 0;

  return [
    {
      toolId: "mcp.connect",
      input: { target: { serverId: "fs-mcp", transportHint: "stdio", timeoutMs: 1_000 }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", timeoutMs: 0 } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:disconnect"] }) },
      execute: executeMcpConnect,
      handler: mcpConnectHandler,
      executor: {
        mcp: {
          async connect(request) {
            connectCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { connectionId: request.connectionId ?? "conn-fs", status: "connected", serverId: request.serverId } };
          },
        },
      },
      providerOutput: { connectionId: "conn-fs", status: "connected", serverId: "fs-mcp" },
      providerCalled: (output) => output.providerCalled === true && (output.operationPreview as { connectionState?: string }).connectionState === "connected",
      runtimeWasCalled: () => connectCalls > 0,
    },
    {
      toolId: "mcp.disconnect",
      input: { target: { serverId: "fs-mcp", connectionId: "conn-fs", reason: "test cleanup" }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", reason: "x".repeat(257) } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:connect"] }) },
      execute: executeMcpDisconnect,
      handler: mcpDisconnectHandler,
      executor: {
        mcp: {
          async disconnect(request) {
            disconnectCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { connectionId: request.connectionId ?? "conn-fs", status: "disconnected", serverId: request.serverId } };
          },
        },
      },
      providerOutput: { connectionId: "conn-fs", status: "disconnected", serverId: "fs-mcp" },
      providerCalled: (output) => output.providerCalled === true && (output.operationPreview as { connectionState?: string }).connectionState === "disconnected",
      runtimeWasCalled: () => disconnectCalls > 0,
    },
  ];
}

test("mcp.connect keeps legacy dry-run transport preview behavior", () => {
  const result = planMcpConnect({
    target: { serverId: "fs-mcp", transport: "http", endpoint: "https://mcp.example.test", timeoutMs: 1_000 },
    context: { allowedServerIds: ["fs-mcp"], grantedPermissions: ["mcp:connect", "network:connect"] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.permissionsRequired, ["mcp:connect", "network:connect"]);
  assert.equal(result.output.operationPreview.connectionState, "planned");
});

test("MCP connection lifecycle tools keep dry-run provider-free and require governance", async () => {
  for (const tool of makeTools()) {
    let calls = 0;
    const dryRun = await tool.execute({
      ...(tool.input as { target: unknown }),
      context: { ...acceptedContext(), dryRun: true },
      provider: async () => {
        calls += 1;
        return tool.providerOutput;
      },
    });

    assert.equal(dryRun.ok, true, `${tool.toolId} dry-run should pass`);
    assert.equal(calls, 0, `${tool.toolId} dry-run should not call provider`);
    if (!dryRun.ok) continue;
    assert.equal(dryRun.output?.providerCalled, false);

    const unguarded = await tool.execute({ ...(tool.input as { target: unknown }), context: { ...acceptedContext(), guard: undefined } });
    assert.equal(unguarded.ok, false, `${tool.toolId} without guard should fail`);
    if (unguarded.ok) continue;
    assert.equal(unguarded.error?.code, "GOVERNANCE_REJECTED");
  }
});

test("MCP connection lifecycle tools call fake providers and hide provider failures", async () => {
  for (const tool of makeTools()) {
    let calls = 0;
    const success = await tool.execute({
      ...tool.input,
      provider: async () => {
        calls += 1;
        return tool.providerOutput;
      },
    });

    assert.equal(success.ok, true, `${tool.toolId} provider success should pass`);
    assert.equal(calls, 1, `${tool.toolId} provider should be called once`);
    if (!success.ok) continue;
    assert.equal(tool.providerCalled(success.output ?? {}), true, `${tool.toolId} output should reflect provider call`);

    const missing = await tool.execute(tool.input);
    assert.equal(missing.ok, false, `${tool.toolId} missing provider should fail`);
    if (missing.ok) continue;
    assert.equal(missing.error?.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missing.error?.publicSafe, true);

    const thrown = await tool.execute({
      ...tool.input,
      provider: async () => {
        throw new TypeError("raw runtime failure with private detail");
      },
    });
    assert.equal(thrown.ok, false, `${tool.toolId} thrown provider should fail safely`);
    if (thrown.ok) continue;
    assert.equal(thrown.error?.code, "PROVIDER_REJECTED");
    assert.equal(thrown.error?.publicSafe, true);
    assert.equal(thrown.error?.message.includes("private detail"), false);
  }
});

test("MCP connection lifecycle tools report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP connection lifecycle handlers invoke runtime MCP executor ports", async () => {
  for (const tool of makeTools()) {
    const result = await tool.handler.invoke({
      toolCallId: `call-${tool.toolId}`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: tool.input,
      executor: tool.executor,
    });

    assert.equal(result.ok, true, `${tool.toolId} handler should pass`);
    assert.equal(tool.runtimeWasCalled(), true, `${tool.toolId} should call runtime executor`);
  }
});

test("MCP connection lifecycle tools resolve through the baseTool registry", async () => {
  const registry = createBaseToolRegistry();

  for (const tool of makeTools()) {
    const lookup = registry.lookupHandler(tool.toolId);
    assert.equal(lookup.ok, true, `${tool.toolId} handler should resolve`);
    if (!lookup.ok) continue;

    const result = await lookup.handler.invoke({
      toolCallId: `registry-${tool.toolId}`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: tool.input,
      executor: tool.executor,
      metadata: { mountedVia: "createBaseToolRegistry.lookupHandler" },
    });

    assert.equal(result.ok, true, `${tool.toolId} registry invoke should pass`);
    assert.equal(result.toolId, tool.toolId);
  }
});
