import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpSubscribe,
  mcpSubscribeHandler,
  planMcpSubscribe,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.subscribe.js";
import {
  executeMcpUnsubscribe,
  mcpUnsubscribeHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.unsubscribe.js";

type SubscriptionTool = {
  toolId: "mcp.subscribe" | "mcp.unsubscribe";
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
    grantedPermissions: ["mcp:subscription:write"],
    ...extra,
  };
}

function makeTools(): SubscriptionTool[] {
  let subscribeCalls = 0;
  let unsubscribeCalls = 0;

  return [
    {
      toolId: "mcp.subscribe",
      input: {
        target: { serverId: "fs-mcp", subjectType: "resource", subject: "file:///workspace/README.md", eventKinds: ["changed"], replayPolicy: "latest" },
        context: acceptedContext(),
      },
      badInput: { target: { serverId: "fs-mcp", subjectType: "resource", subject: [], eventKinds: [null] } },
      permissionGapInput: {
        target: { serverId: "fs-mcp", subjectType: "resource", subject: "file:///workspace/README.md" },
        context: acceptedContext({ grantedPermissions: [] }),
      },
      execute: executeMcpSubscribe,
      handler: mcpSubscribeHandler,
      executor: {
        mcp: {
          async subscribe(request) {
            subscribeCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            assert.equal(request.subject, "file:///workspace/README.md");
            return {
              ok: true,
              output: { subscriptionId: "sub-fs", status: "subscribed", serverId: request.serverId, connectionId: request.connectionId },
            };
          },
        },
      },
      providerOutput: { subscriptionId: "sub-fs", status: "subscribed", serverId: "fs-mcp" },
      providerCalled: (output) => output.providerCalled === true && (output.subscriptionEnvelope as { state?: string }).state === "subscribed",
      runtimeWasCalled: () => subscribeCalls > 0,
    },
    {
      toolId: "mcp.unsubscribe",
      input: { target: { serverId: "fs-mcp", subscriptionId: "sub-fs", reason: "test cleanup" }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", subscriptionId: 1 } },
      permissionGapInput: { target: { serverId: "fs-mcp", subscriptionId: "sub-fs" }, context: acceptedContext({ grantedPermissions: [] }) },
      execute: executeMcpUnsubscribe,
      handler: mcpUnsubscribeHandler,
      executor: {
        mcp: {
          async unsubscribe(request) {
            unsubscribeCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            assert.equal(request.subscriptionId, "sub-fs");
            return { ok: true, output: { subscriptionId: request.subscriptionId, status: "unsubscribed", serverId: request.serverId } };
          },
        },
      },
      providerOutput: { subscriptionId: "sub-fs", status: "unsubscribed", serverId: "fs-mcp" },
      providerCalled: (output) => output.providerCalled === true && (output.unsubscribeEnvelope as { state?: string }).state === "unsubscribed",
      runtimeWasCalled: () => unsubscribeCalls > 0,
    },
  ];
}

test("mcp.subscribe keeps legacy dry-run subscription preview behavior", () => {
  const result = planMcpSubscribe({
    target: {
      serverId: "fs-mcp",
      subjectType: "resource",
      subject: "file:///workspace/README.md",
      eventKinds: ["changed", "changed", "deleted"],
      replayPolicy: "latest",
    },
    context: { invocationId: "subscribe-1", grantedPermissions: ["mcp:subscription:write"] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.target.eventKinds, ["changed", "deleted"]);
  assert.equal(result.output.subscriptionEnvelope.state, "planned");
});

test("MCP subscription tools keep dry-run provider-free and require governance", async () => {
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

test("MCP subscription tools call fake providers and hide provider failures", async () => {
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

test("MCP subscription tools report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP subscription handlers invoke runtime MCP executor ports", async () => {
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

test("MCP subscription tools resolve through the baseTool registry", async () => {
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
