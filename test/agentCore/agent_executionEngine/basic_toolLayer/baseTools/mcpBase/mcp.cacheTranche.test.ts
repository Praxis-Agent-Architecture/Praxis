import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpCache,
  mcpCacheHandler,
  planMcpCache,
} from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.cache.js";
import {
  executeMcpCacheInvalidation,
  mcpInvalidateCacheHandler,
  planMcpCacheInvalidation,
} from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.invalidateCache.js";

type CacheTool = {
  toolId: "mcp.cache" | "mcp.invalidateCache";
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
    grantedPermissions: ["mcp:read", "mcp:write", "cache:write", "mcp:cache:invalidate"],
    ...extra,
  };
}

function makeTools(): CacheTool[] {
  let cacheCalls = 0;
  let invalidateCalls = 0;

  return [
    {
      toolId: "mcp.cache",
      input: {
        target: {
          serverId: "fs-mcp",
          cacheKey: "resource:file:///workspace/README.md",
          valueRef: "envelope://mcp/read/README",
          ttlSeconds: 300,
          tags: ["resource", "readme"],
        },
        context: acceptedContext({ grantedPermissions: ["mcp:read", "mcp:write", "cache:write"] }),
      },
      badInput: { target: { serverId: "fs-mcp", cacheKey: [], valueRef: "envelope://value" } },
      permissionGapInput: {
        target: { serverId: "fs-mcp", cacheKey: "resource:file:///workspace/README.md", valueRef: "envelope://value" },
        context: acceptedContext({ grantedPermissions: ["mcp:read", "mcp:write"] }),
      },
      execute: executeMcpCache,
      handler: mcpCacheHandler,
      executor: {
        mcp: {
          async cache(request) {
            cacheCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { cacheKey: request.cacheKey, status: "cached", expiresAt: "2026-04-27T00:00:00.000Z", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.cache" } } };
          },
        },
      },
      providerOutput: { cacheKey: "resource:file:///workspace/README.md", status: "cached", expiresAt: "2026-04-27T00:00:00.000Z" },
      providerCalled: (output) => output.providerCalled === true && (output.cacheEnvelope as { state?: string }).state === "cached",
      runtimeWasCalled: () => cacheCalls > 0,
    },
    {
      toolId: "mcp.invalidateCache",
      input: {
        target: {
          serverId: "fs-mcp",
          scope: "resources",
          cacheKey: "resource:file:///workspace/README.md",
          reason: "resource changed",
        },
        context: acceptedContext({ grantedPermissions: ["mcp:cache:invalidate"] }),
      },
      badInput: { target: { serverId: "fs-mcp", scope: "subscriptions" } },
      permissionGapInput: {
        target: { serverId: "fs-mcp", scope: "resources" },
        context: acceptedContext({ grantedPermissions: [] }),
      },
      execute: executeMcpCacheInvalidation,
      handler: mcpInvalidateCacheHandler,
      executor: {
        mcp: {
          async invalidateCache(request) {
            invalidateCalls += 1;
            assert.equal(request.serverId, "fs-mcp");
            return { ok: true, output: { scope: request.scope, cacheKey: request.cacheKey, status: "invalidated", invalidatedCount: 1, providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.invalidateCache" } } };
          },
        },
      },
      providerOutput: { scope: "resources", cacheKey: "resource:file:///workspace/README.md", status: "invalidated", invalidatedCount: 1 },
      providerCalled: (output) => output.providerCalled === true && (output.operationPreview as { state?: string }).state === "invalidated",
      runtimeWasCalled: () => invalidateCalls > 0,
    },
  ];
}

test("mcp cache tools keep legacy dry-run preview behavior", () => {
  const cache = planMcpCache({
    target: { serverId: "fs-mcp", cacheKey: "resource:file:///workspace/README.md", valueRef: "envelope://value", ttlSeconds: 300, tags: [" resource ", "resource"] },
    context: { invocationId: "cache-1", grantedPermissions: ["mcp:read", "mcp:write", "cache:write"] },
  });
  assert.equal(cache.ok, true);
  if (cache.ok) {
    assert.equal(cache.output.providerCalled, false);
    assert.equal(cache.output.cacheEnvelope.state, "planned");
    assert.deepEqual(cache.output.cachePlan.tags, ["resource"]);
  }

  const invalidation = planMcpCacheInvalidation({
    target: { serverId: "fs-mcp", scope: "resources", cacheKey: "resource:file:///workspace/README.md" },
    context: { invocationId: "invalidate-1", grantedPermissions: ["mcp:cache:invalidate"] },
  });
  assert.equal(invalidation.ok, true);
  if (invalidation.ok) {
    assert.equal(invalidation.output.providerCalled, false);
    assert.equal(invalidation.output.operationPreview.state, "planned");
  }
});

test("MCP cache tools keep dry-run provider-free and require governance", async () => {
  for (const tool of makeTools()) {
    let calls = 0;
    const dryRun = await tool.execute({ ...(tool.input as { target: unknown }), context: { ...acceptedContext(), dryRun: true }, provider: async () => { calls += 1; return tool.providerOutput; } });
    assert.equal(dryRun.ok, true, `${tool.toolId} dry-run should pass`);
    assert.equal(calls, 0, `${tool.toolId} dry-run should not call provider`);
    if (!dryRun.ok) continue;
    assert.equal(dryRun.output?.providerCalled, false);

    const unguarded = await tool.execute({ ...tool.input, context: { ...acceptedContext(), guard: undefined } });
    assert.equal(unguarded.ok, false, `${tool.toolId} without guard should fail`);
    if (unguarded.ok) continue;
    assert.equal(unguarded.error?.code, "GOVERNANCE_REJECTED");
  }
});

test("MCP cache tools call fake providers and hide provider failures", async () => {
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

    const thrown = await tool.execute({ ...tool.input, provider: async () => { throw new TypeError("raw private cache failure"); } });
    assert.equal(thrown.ok, false, `${tool.toolId} thrown provider should fail safely`);
    if (thrown.ok) continue;
    assert.equal(thrown.error?.code, "PROVIDER_REJECTED");
    assert.equal(thrown.error?.message.includes("private"), false);
  }
});

test("MCP cache tools report malformed JSON and permission gaps as public-safe errors", async () => {
  for (const tool of makeTools()) {
    for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, { context: { grantedPermissions: [null] } }, tool.badInput, tool.permissionGapInput]) {
      const result = await tool.execute(input);
      assert.equal(result.ok, false, `${tool.toolId} malformed input should fail`);
      if (result.ok) continue;
      assert.equal(result.error?.publicSafe, true);
    }
  }
});

test("MCP cache handlers invoke runtime MCP executor ports", async () => {
  for (const tool of makeTools()) {
    const result = await tool.handler.invoke({ toolCallId: `call-${tool.toolId}`, runtimeId: "runtime-1", sessionId: "session-1", input: tool.input, executor: tool.executor });
    assert.equal(result.ok, true, `${tool.toolId} handler should pass`);
    assert.equal(tool.runtimeWasCalled(), true, `${tool.toolId} should call runtime executor`);
  }
});

test("MCP cache tools resolve through the baseTool registry", async () => {
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
