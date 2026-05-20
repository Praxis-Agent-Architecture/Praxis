import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpToolsList } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.listTools.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.listTools.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.listTools.md",
  testFileUrl: import.meta.url,
});

test("planMcpToolsList creates a guarded dry-run list envelope", () => {
  const result = planMcpToolsList({
    target: { serverId: " local-mcp ", namespace: "fs", includeDisabled: true },
    context: {
      invocationId: "list-1",
      allowedServerIds: ["local-mcp"],
      grantedPermissions: ["mcp:tool:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.listTools");
  assert.equal(result.output.target.serverId, "local-mcp");
  assert.equal(result.output.target.namespace, "fs");
  assert.deepEqual(result.output.toolsPreview, []);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "list-1");
});

test("planMcpToolsList rejects missing server ids, scope misses, and permission gaps", () => {
  const missingServer = planMcpToolsList();

  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) {
    assert.equal(missingServer.error.code, "MISSING_SERVER_ID");
  }

  const scopedOut = planMcpToolsList({
    target: { serverId: "remote-mcp" },
    context: { allowedServerIds: ["local-mcp"] },
  });

  assert.equal(scopedOut.ok, false);
  if (!scopedOut.ok) {
    assert.equal(scopedOut.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = planMcpToolsList({
    target: { serverId: "local-mcp" },
    context: { grantedPermissions: ["mcp:tool:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});
