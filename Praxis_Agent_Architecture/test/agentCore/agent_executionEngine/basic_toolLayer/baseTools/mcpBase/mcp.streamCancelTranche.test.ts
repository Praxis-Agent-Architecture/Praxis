import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpCancel,
  mcpCancelHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.cancel.js";
import {
  executeMcpStream,
  mcpStreamHandler,
  planMcpStream,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.stream.js";

type StreamCancelTool = {
  toolId: "mcp.stream" | "mcp.cancel";
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
    requestedScopes: ["mcp:fs"],
    allowedScopes: ["mcp:fs"],
    grantedPermissions: ["mcp:stream", "mcp:call", "mcp:cancel", "mcp:control"],
    ...extra,
  };
}

function makeTools(): StreamCancelTool[] {
  let streamCalls = 0;
  let cancelCalls = 0;

  return [
    {
      toolId: "mcp.stream",
      input: {
        target: { serverId: "fs-mcp", name: "read_file", channel: "chunks", arguments: { path: "README.md" }, maxEvents: 2 },
        context: acceptedContext({ grantedPermissions: ["mcp:stream", "mcp:call"] }),
      },
      badInput: { target: { serverId: "fs-mcp", name: "read_file", arguments: [] } },
      permissionGapInput: {
        target: { serverId: "fs-mcp", name: "read_file" },
        context: acceptedContext({ grantedPermissions: ["mcp:stream"] }),
      },
      execute: executeMcpStream,
      handler: mcpStreamHandler,
      executor: {
        mcp: {
          async streamTool(request) {
            streamCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            assert.equal(request.name, "read_file");
            return {
              ok: true,
              output: {
                executionId: "exec-stream",
                streamId: "stream-read-file",
                status: "completed",
                channel: request.channel ?? "chunks",
                chunks: ["chunk-1"],
                providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.streamTool" },
              },
            };
          },
        },
      },
      providerOutput: { executionId: "exec-stream", streamId: "stream-read-file", status: "completed", channel: "chunks", chunks: ["chunk-1"] },
      providerCalled: (output) => output.providerCalled === true && (output.streamEnvelope as { state?: string }).state === "completed",
      runtimeWasCalled: () => streamCalls > 0,
    },
    {
      toolId: "mcp.cancel",
      input: {
        target: { serverId: "fs-mcp", executionId: "exec-stream", reason: "test cleanup", force: true },
        context: acceptedContext(),
      },
      badInput: { target: { serverId: "fs-mcp", executionId: 1 } },
      permissionGapInput: {
        target: { serverId: "fs-mcp", executionId: "exec-stream", force: true },
        context: acceptedContext({ grantedPermissions: ["mcp:cancel"] }),
      },
      execute: executeMcpCancel,
      handler: mcpCancelHandler,
      executor: {
        mcp: {
          async cancelExecution(request) {
            cancelCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            assert.equal(request.executionId, "exec-stream");
            return {
              ok: true,
              output: { executionId: request.executionId, status: "cancelled", serverId: request.serverId, providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.cancelExecution" } },
            };
          },
        },
      },
      providerOutput: { executionId: "exec-stream", status: "cancelled", serverId: "fs-mcp" },
      providerCalled: (output) => output.providerCalled === true && (output.cancelEnvelope as { state?: string }).state === "cancelled",
      runtimeWasCalled: () => cancelCalls > 0,
    },
  ];
}

test("mcp.stream keeps legacy dry-run preview behavior", () => {
  const result = planMcpStream({
    target: { serverId: "fs-mcp", name: "tail_log", channel: "chunks", arguments: { path: "agent.log" }, maxEvents: 5 },
    context: { invocationId: "stream-1", grantedPermissions: ["mcp:stream", "mcp:call"] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.streamEnvelope.state, "planned");
  assert.equal(result.output.streamEnvelope.name, "tail_log");
});

test("MCP stream/cancel keep dry-run provider-free and require governance", async () => {
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

test("MCP stream/cancel call fake providers and hide provider failures", async () => {
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
    assert.equal(thrown.error?.message.includes("private detail"), false);
  }
});

test("MCP stream/cancel report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP stream/cancel handlers invoke runtime MCP executor ports", async () => {
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

test("MCP stream/cancel tools resolve through the baseTool registry", async () => {
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
