import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpToolUpdate } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.updateTool.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.updateTool.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.updateTool.md",
  testFileUrl: import.meta.url,
});

test("planMcpToolUpdate creates a guarded dry-run update envelope", () => {
  const result = planMcpToolUpdate({
    target: {
      serverId: "local-mcp",
      toolName: " fs.read ",
      patch: { description: " Read a file ", inputSchema: { type: "object" } },
    },
    context: {
      invocationId: "update-1",
      allowedServerIds: ["local-mcp"],
      grantedPermissions: ["mcp:tool:read", "mcp:tool:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.updateTool");
  assert.equal(result.output.target.serverId, "local-mcp");
  assert.equal(result.output.target.toolName, "fs.read");
  assert.equal(result.output.target.patch.description, "Read a file");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "update-1");
});

test("planMcpToolUpdate rejects missing patch data and permission gaps", () => {
  const missingPatch = planMcpToolUpdate({
    target: { serverId: "local-mcp", toolName: "fs.read" },
  });

  assert.equal(missingPatch.ok, false);
  if (!missingPatch.ok) {
    assert.equal(missingPatch.error.code, "MISSING_UPDATE_PATCH");
  }

  const missingPermission = planMcpToolUpdate({
    target: { serverId: "local-mcp", toolName: "fs.read", patch: { description: "Read" } },
    context: { grantedPermissions: ["mcp:tool:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});

test("planMcpToolUpdate blocks real update side effects", () => {
  const result = planMcpToolUpdate({
    target: { serverId: "local-mcp", toolName: "fs.read", patch: { description: "Read" } },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
