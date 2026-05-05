import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpToolUnregistration } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.unregisterTool.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.unregisterTool.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.unregisterTool.md",
  testFileUrl: import.meta.url,
});

test("planMcpToolUnregistration creates a guarded dry-run unregister envelope", () => {
  const result = planMcpToolUnregistration({
    target: { serverId: "local-mcp", toolName: " fs.read ", keepAuditRecord: false },
    context: {
      invocationId: "unregister-1",
      allowedServerIds: ["local-mcp"],
      grantedPermissions: ["mcp:tool:read", "mcp:tool:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.unregisterTool");
  assert.equal(result.output.target.serverId, "local-mcp");
  assert.equal(result.output.target.toolName, "fs.read");
  assert.equal(result.output.target.keepAuditRecord, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "unregister-1");
});

test("planMcpToolUnregistration rejects missing tool names and permission gaps", () => {
  const missingToolName = planMcpToolUnregistration({
    target: { serverId: "local-mcp" },
  });

  assert.equal(missingToolName.ok, false);
  if (!missingToolName.ok) {
    assert.equal(missingToolName.error.code, "MISSING_TOOL_NAME");
  }

  const missingPermission = planMcpToolUnregistration({
    target: { serverId: "local-mcp", toolName: "fs.read" },
    context: { grantedPermissions: ["mcp:tool:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});

test("planMcpToolUnregistration blocks real unregister side effects", () => {
  const result = planMcpToolUnregistration({
    target: { serverId: "local-mcp", toolName: "fs.read" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
