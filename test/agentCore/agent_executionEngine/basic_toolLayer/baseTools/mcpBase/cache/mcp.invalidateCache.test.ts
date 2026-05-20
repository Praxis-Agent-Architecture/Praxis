import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpCacheInvalidation } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.invalidateCache.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.invalidateCache.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.invalidateCache.md",
  testFileUrl: import.meta.url,
});

test("planMcpCacheInvalidation creates a guarded dry-run cache invalidation plan", () => {
  const result = planMcpCacheInvalidation({
    target: {
      serverId: "docs-server",
      scope: "resources",
      cacheKey: "resource:list",
      reason: "resource metadata changed",
    },
    context: {
      invocationId: "invalidate-1",
      allowedServerIds: ["docs-server"],
      grantedPermissions: ["mcp:cache:invalidate"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.invalidateCache");
  assert.equal(result.output.operationPreview.invalidationState, "planned");
  assert.equal(result.output.operationPreview.cacheKey, "resource:list");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "invalidate-1");
});

test("planMcpCacheInvalidation rejects missing server and invalid scope", () => {
  const missing = planMcpCacheInvalidation();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidScope = planMcpCacheInvalidation({
    target: { serverId: "docs-server", scope: "subscriptions" as "tools" },
  });

  assert.equal(invalidScope.ok, false);
  if (!invalidScope.ok) {
    assert.equal(invalidScope.error.code, "INVALID_SCOPE");
  }
});

test("planMcpCacheInvalidation blocks out-of-scope, missing permissions, and real execution", () => {
  const scoped = planMcpCacheInvalidation({
    target: { serverId: "other-server", scope: "all" },
    context: { allowedServerIds: ["docs-server"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const permission = planMcpCacheInvalidation({
    target: { serverId: "docs-server", scope: "all" },
    context: { grantedPermissions: ["mcp:ping" as "mcp:cache:invalidate"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpCacheInvalidation({
    target: { serverId: "docs-server", scope: "all" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
