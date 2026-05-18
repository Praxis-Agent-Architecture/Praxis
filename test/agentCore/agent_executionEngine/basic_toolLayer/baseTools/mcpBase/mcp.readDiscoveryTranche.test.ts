import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpPing,
  mcpPingHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.ping.js";
import {
  executeMcpHealthCheck,
  mcpHealthCheckHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/monitoring/mcp.healthCheck.js";
import {
  executeMcpListResources,
  mcpListResourcesHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.listResources.js";
import {
  executeMcpResourceRead,
  mcpReadResourceHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.readResource.js";
import {
  executeMcpToolsList,
  mcpListToolsHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.listTools.js";

type MappedTool = {
  toolId: "mcp.listTools" | "mcp.listResources" | "mcp.readResource" | "mcp.ping" | "mcp.healthCheck";
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
    grantedPermissions: ["mcp:tool:read", "mcp:connection:read", "mcp:resource:list", "mcp:resource:read", "mcp:ping", "mcp:monitor:read"],
    requestedScopes: ["mcp:fs"],
    allowedScopes: ["mcp:fs"],
    allowedUriPrefixes: ["file:///workspace/"],
    ...extra,
  };
}

function makeTools(): MappedTool[] {
  let listToolsCalls = 0;
  let listResourcesCalls = 0;
  let readResourceCalls = 0;
  let pingCalls = 0;
  let healthCalls = 0;

  return [
    {
      toolId: "mcp.listTools",
      input: { target: { serverId: "fs-mcp", namespace: "fs", limit: 5 }, context: acceptedContext() },
      badInput: { target: { serverId: 1 } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:resource:read"] }) },
      execute: executeMcpToolsList,
      handler: mcpListToolsHandler,
      executor: {
        mcp: {
          async listTools(request) {
            listToolsCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { tools: [{ name: "read_file", title: "Read file", namespace: "fs" }], nextCursor: "next" } };
          },
        },
      },
      providerOutput: { tools: [{ name: "read_file" }], nextCursor: "next" },
      providerCalled: (output) => output.providerCalled === true && Array.isArray(output.toolsPreview),
      runtimeWasCalled: () => listToolsCalls > 0,
    },
    {
      toolId: "mcp.listResources",
      input: { target: { serverId: "fs-mcp", uriPrefix: "file:///workspace/", limit: 5 }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", limit: 0 } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:resource:read"] }) },
      execute: executeMcpListResources,
      handler: mcpListResourcesHandler,
      executor: {
        mcp: {
          async listResources(request) {
            listResourcesCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { resources: [{ uri: "file:///workspace/README.md", name: "README" }], exhausted: true } };
          },
        },
      },
      providerOutput: { resources: [{ uri: "file:///workspace/README.md", name: "README" }], exhausted: true },
      providerCalled: (output) => output.providerCalled === true && (output.resourceEnvelope as { exhausted?: boolean }).exhausted === true,
      runtimeWasCalled: () => listResourcesCalls > 0,
    },
    {
      toolId: "mcp.readResource",
      input: { target: { serverId: "fs-mcp", resourceUri: "file:///workspace/README.md", acceptMimeTypes: ["text/markdown"] }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", resourceUri: "file:///workspace/README.md", maxBytes: 0 } },
      permissionGapInput: { target: { serverId: "fs-mcp", resourceUri: "file:///workspace/README.md" }, context: acceptedContext({ grantedPermissions: ["mcp:resource:list"] }) },
      execute: executeMcpResourceRead,
      handler: mcpReadResourceHandler,
      executor: {
        mcp: {
          async readResource(request) {
            readResourceCalls += 1;
            assert.equal(request.resourceUri, "file:///workspace/README.md");
            return { ok: true, output: { uri: request.resourceUri, contents: [{ mimeType: "text/markdown", text: "# README" }], truncated: false } };
          },
        },
      },
      providerOutput: { contents: [{ mimeType: "text/markdown", text: "# README" }], truncated: false },
      providerCalled: (output) => output.providerCalled === true && (output.resourceEnvelope as { source?: string }).source === "runtime-provider",
      runtimeWasCalled: () => readResourceCalls > 0,
    },
    {
      toolId: "mcp.ping",
      input: { target: { serverId: "fs-mcp", timeoutMs: 1_000 }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", timeoutMs: 0 } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:connection:read"] }) },
      execute: executeMcpPing,
      handler: mcpPingHandler,
      executor: {
        mcp: {
          async ping(request) {
            pingCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { healthy: true, status: "ok", latencyMs: 2 } };
          },
        },
      },
      providerOutput: { healthy: true, status: "ok", latencyMs: 2 },
      providerCalled: (output) => output.providerCalled === true && (output.operationPreview as { probeState?: string }).probeState === "probed",
      runtimeWasCalled: () => pingCalls > 0,
    },
    {
      toolId: "mcp.healthCheck",
      input: { target: { serverId: "fs-mcp", includeCapabilities: true }, context: acceptedContext() },
      badInput: { target: { serverId: "fs-mcp", timeoutMs: 0 } },
      permissionGapInput: { target: { serverId: "fs-mcp" }, context: acceptedContext({ grantedPermissions: ["mcp:connection:read"] }) },
      execute: executeMcpHealthCheck,
      handler: mcpHealthCheckHandler,
      executor: {
        mcp: {
          async checkHealth(request) {
            healthCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { status: "healthy", connection: "connected", latencyMs: 3, capabilities: ["tools", "resources"] } };
          },
        },
      },
      providerOutput: { status: "healthy", connection: "connected", latencyMs: 3, capabilities: ["tools", "resources"] },
      providerCalled: (output) => output.providerCalled === true && (output.probeEnvelope as { status?: string }).status === "healthy",
      runtimeWasCalled: () => healthCalls > 0,
    },
  ];
}

test("MCP read/discovery tools keep dry-run provider-free and require governance for real dispatch", async () => {
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

test("MCP read/discovery tools call fake providers and hide provider failures", async () => {
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

test("MCP read/discovery tools report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP read/discovery handlers invoke runtime MCP executor ports", async () => {
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

test("MCP read/discovery tools resolve through the baseTool registry", async () => {
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
