import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpCreateResource,
  mcpCreateResourceHandler,
  planMcpCreateResource,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.createResource.js";
import {
  executeMcpDeleteResource,
  mcpDeleteResourceHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.deleteResource.js";
import {
  executeMcpResourceUpdate,
  mcpUpdateResourceHandler,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.updateResource.js";

type ResourceMutationTool = {
  toolId: "mcp.createResource" | "mcp.updateResource" | "mcp.deleteResource";
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
    allowedUriPrefixes: ["file:///workspace/"],
    requestedScopes: ["mcp:fs"],
    allowedScopes: ["mcp:fs"],
    grantedPermissions: ["mcp:connection:read", "mcp:resource:create", "mcp:resource:write", "mcp:resource:delete"],
    ...extra,
  };
}

function makeTools(): ResourceMutationTool[] {
  let createCalls = 0;
  let updateCalls = 0;
  let deleteCalls = 0;

  return [
    {
      toolId: "mcp.createResource",
      input: {
        target: { serverId: "fs-mcp", uri: "file:///workspace/new-note.md", mimeType: "text/markdown" },
        initialContent: "# note",
        metadata: { owner: "test" },
        context: acceptedContext({ grantedPermissions: ["mcp:connection:read", "mcp:resource:create"] }),
      },
      badInput: { target: { serverId: "fs-mcp", uri: 1 } },
      permissionGapInput: { target: { serverId: "fs-mcp", uri: "file:///workspace/new-note.md" }, context: acceptedContext({ grantedPermissions: ["mcp:connection:read"] }) },
      execute: executeMcpCreateResource,
      handler: mcpCreateResourceHandler,
      executor: {
        mcp: {
          async createResource(request) {
            createCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { uri: request.uri, status: "created", revision: "rev-created", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.createResource" } } };
          },
        },
      },
      providerOutput: { uri: "file:///workspace/new-note.md", status: "created", revision: "rev-created" },
      providerCalled: (output) => output.providerCalled === true && (output.resourceEnvelope as { state?: string }).state === "created",
      runtimeWasCalled: () => createCalls > 0,
    },
    {
      toolId: "mcp.updateResource",
      input: {
        target: { serverId: "fs-mcp", resourceUri: "file:///workspace/new-note.md", content: { text: "# updated" } },
        context: acceptedContext({ grantedPermissions: ["mcp:resource:write"] }),
      },
      badInput: { target: { serverId: "fs-mcp", resourceUri: "file:///workspace/new-note.md", content: [] } },
      permissionGapInput: { target: { serverId: "fs-mcp", resourceUri: "file:///workspace/new-note.md", content: { text: "# updated" } }, context: acceptedContext({ grantedPermissions: [] }) },
      execute: executeMcpResourceUpdate,
      handler: mcpUpdateResourceHandler,
      executor: {
        mcp: {
          async updateResource(request) {
            updateCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { uri: request.resourceUri, status: "updated", revision: "rev-updated", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.updateResource" } } };
          },
        },
      },
      providerOutput: { uri: "file:///workspace/new-note.md", status: "updated", revision: "rev-updated" },
      providerCalled: (output) => output.providerCalled === true && (output.mutationEnvelope as { state?: string }).state === "updated",
      runtimeWasCalled: () => updateCalls > 0,
    },
    {
      toolId: "mcp.deleteResource",
      input: {
        target: { serverId: "fs-mcp", uri: "file:///workspace/new-note.md" },
        reason: "cleanup",
        context: acceptedContext({ grantedPermissions: ["mcp:connection:read", "mcp:resource:delete"] }),
      },
      badInput: { target: { serverId: "fs-mcp", uri: 1 } },
      permissionGapInput: { target: { serverId: "fs-mcp", uri: "file:///workspace/new-note.md" }, context: acceptedContext({ grantedPermissions: ["mcp:connection:read"] }) },
      execute: executeMcpDeleteResource,
      handler: mcpDeleteResourceHandler,
      executor: {
        mcp: {
          async deleteResource(request) {
            deleteCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { uri: request.uri, status: "deleted", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.deleteResource" } } };
          },
        },
      },
      providerOutput: { uri: "file:///workspace/new-note.md", status: "deleted" },
      providerCalled: (output) => output.providerCalled === true && (output.resourceEnvelope as { state?: string }).state === "deleted",
      runtimeWasCalled: () => deleteCalls > 0,
    },
  ];
}

test("mcp.createResource keeps legacy dry-run preview behavior", () => {
  const result = planMcpCreateResource({
    target: { serverId: "fs-mcp", uri: "file:///workspace/new-note.md", mimeType: "text/markdown" },
    initialContent: "# note",
    metadata: { owner: "test" },
    context: { invocationId: "create-1", grantedPermissions: ["mcp:connection:read", "mcp:resource:create"] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.resourceEnvelope.state, "planned");
  assert.deepEqual(result.output.resourceEnvelope.metadataKeys, ["owner"]);
});

test("MCP resource mutation tools keep dry-run provider-free and require governance", async () => {
  for (const tool of makeTools()) {
    let calls = 0;
    const dryRun = await tool.execute({ ...(tool.input as { target: unknown }), context: { ...acceptedContext(), dryRun: true }, provider: async () => { calls += 1; return tool.providerOutput; } });
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

test("MCP resource mutation tools call fake providers and hide provider failures", async () => {
  for (const tool of makeTools()) {
    let calls = 0;
    const success = await tool.execute({ ...tool.input, provider: async () => { calls += 1; return tool.providerOutput; } });
    assert.equal(success.ok, true, `${tool.toolId} provider success should pass`);
    assert.equal(calls, 1, `${tool.toolId} provider should be called once`);
    if (!success.ok) continue;
    assert.equal(tool.providerCalled(success.output ?? {}), true, `${tool.toolId} output should reflect provider call`);

    const missing = await tool.execute(tool.input);
    assert.equal(missing.ok, false, `${tool.toolId} missing provider should fail`);
    if (missing.ok) continue;
    assert.equal(missing.error?.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missing.error?.publicSafe, true);

    const thrown = await tool.execute({ ...tool.input, provider: async () => { throw new TypeError("raw private resource failure"); } });
    assert.equal(thrown.ok, false, `${tool.toolId} thrown provider should fail safely`);
    if (thrown.ok) continue;
    assert.equal(thrown.error?.code, "PROVIDER_REJECTED");
    assert.equal(thrown.error?.message.includes("private"), false);
  }
});

test("MCP resource mutation tools report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP resource mutation handlers invoke runtime MCP executor ports", async () => {
  for (const tool of makeTools()) {
    const result = await tool.handler.invoke({ toolCallId: `call-${tool.toolId}`, runtimeId: "runtime-1", sessionId: "session-1", input: tool.input, executor: tool.executor });
    assert.equal(result.ok, true, `${tool.toolId} handler should pass`);
    assert.equal(tool.runtimeWasCalled(), true, `${tool.toolId} should call runtime executor`);
  }
});

test("MCP resource mutation tools resolve through the baseTool registry", async () => {
  const registry = createBaseToolRegistry();
  for (const tool of makeTools()) {
    const lookup = registry.lookupHandler(tool.toolId);
    assert.equal(lookup.ok, true, `${tool.toolId} handler should resolve`);
    if (!lookup.ok) continue;
    const result = await lookup.handler.invoke({ toolCallId: `registry-${tool.toolId}`, runtimeId: "runtime-1", sessionId: "session-1", input: tool.input, executor: tool.executor, metadata: { mountedVia: "createBaseToolRegistry.lookupHandler" } });
    assert.equal(result.ok, true, `${tool.toolId} registry invoke should pass`);
    assert.equal(result.toolId, tool.toolId);
  }
});
