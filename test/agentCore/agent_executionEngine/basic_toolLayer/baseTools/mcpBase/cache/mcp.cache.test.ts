import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpCache } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.cache.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.cache.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/cache/mcp.cache.md",
  testFileUrl: import.meta.url,
});

test("planMcpCache creates a dry-run cache write envelope", () => {
  const result = planMcpCache({
    target: {
      serverId: "filesystem",
      cacheKey: " resources:/workspace ",
      valueRef: " envelope://mcp/resources/workspace ",
      ttlSeconds: 300,
      tags: [" resources ", "resources", "workspace"],
    },
    context: {
      invocationId: "mcp-cache-1",
      allowedServerIds: ["filesystem"],
      grantedPermissions: ["mcp:read", "mcp:write", "cache:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.cache");
  assert.equal(result.output.writesCache, false);
  assert.equal(result.output.cachePlan.cacheKey, "resources:/workspace");
  assert.equal(result.output.cachePlan.valueRef, "envelope://mcp/resources/workspace");
  assert.deepEqual(result.output.cachePlan.tags, ["resources", "workspace"]);
  assert.equal(result.audit[0]?.invocationId, "mcp-cache-1");
});

test("planMcpCache rejects missing cache input, invalid ttl, permission gaps, and real execution", () => {
  const missingKey = planMcpCache({
    target: { serverId: "filesystem", valueRef: "envelope://value" },
  });

  assert.equal(missingKey.ok, false);
  if (!missingKey.ok) {
    assert.equal(missingKey.error.code, "MISSING_CACHE_KEY");
  }

  const missingValue = planMcpCache({
    target: { serverId: "filesystem", cacheKey: "resources:/workspace" },
  });

  assert.equal(missingValue.ok, false);
  if (!missingValue.ok) {
    assert.equal(missingValue.error.code, "MISSING_CACHE_VALUE_REF");
  }

  const invalidTtl = planMcpCache({
    target: {
      serverId: "filesystem",
      cacheKey: "resources:/workspace",
      valueRef: "envelope://value",
      ttlSeconds: 0,
    },
  });

  assert.equal(invalidTtl.ok, false);
  if (!invalidTtl.ok) {
    assert.equal(invalidTtl.error.code, "INVALID_CACHE_TTL");
  }

  const missingPermission = planMcpCache({
    target: { serverId: "filesystem", cacheKey: "resources:/workspace", valueRef: "envelope://value" },
    context: { grantedPermissions: ["mcp:read", "mcp:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpCache({
    target: { serverId: "filesystem", cacheKey: "resources:/workspace", valueRef: "envelope://value" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
