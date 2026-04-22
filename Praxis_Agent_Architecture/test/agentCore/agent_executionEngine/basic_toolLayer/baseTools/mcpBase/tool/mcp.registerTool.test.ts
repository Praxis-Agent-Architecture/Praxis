import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpToolRegistration } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.registerTool.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.registerTool.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/tool/mcp.registerTool.md",
  testFileUrl: import.meta.url,
});

test("planMcpToolRegistration creates a guarded dry-run registration envelope", () => {
  const result = planMcpToolRegistration({
    target: {
      serverId: "local-mcp",
      tool: {
        name: " fs.read ",
        description: " Read a resource ",
        inputSchema: { type: "object" },
      },
      replaceExisting: true,
    },
    context: {
      invocationId: "register-1",
      allowedServerIds: ["local-mcp"],
      grantedPermissions: ["mcp:tool:read", "mcp:tool:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.registerTool");
  assert.equal(result.output.target.serverId, "local-mcp");
  assert.equal(result.output.target.tool.name, "fs.read");
  assert.equal(result.output.target.tool.description, "Read a resource");
  assert.equal(result.output.target.replaceExisting, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "register-1");
});

test("planMcpToolRegistration rejects invalid input and permission gaps", () => {
  const missingTool = planMcpToolRegistration({
    target: { serverId: "local-mcp" },
  });

  assert.equal(missingTool.ok, false);
  if (!missingTool.ok) {
    assert.equal(missingTool.error.code, "MISSING_TOOL_DEFINITION");
  }

  const missingName = planMcpToolRegistration({
    target: { serverId: "local-mcp", tool: { description: "missing name" } },
  });

  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_TOOL_NAME");
  }

  const missingPermission = planMcpToolRegistration({
    target: { serverId: "local-mcp", tool: { name: "fs.read" } },
    context: { grantedPermissions: ["mcp:tool:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});

test("planMcpToolRegistration blocks real registration side effects", () => {
  const result = planMcpToolRegistration({
    target: { serverId: "local-mcp", tool: { name: "fs.read" } },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
