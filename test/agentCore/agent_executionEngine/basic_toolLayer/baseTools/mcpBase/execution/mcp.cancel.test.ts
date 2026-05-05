import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  mcpCancelDescriptor,
  planMcpCancel,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.cancel.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.cancel.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.cancel.md",
  testFileUrl: import.meta.url,
});

test("planMcpCancel returns a governed dry-run cancel envelope", () => {
  const result = planMcpCancel({
    target: {
      serverId: " fs-mcp ",
      executionId: " exec-1 ",
      reason: "user requested stop",
      force: true,
    },
    context: {
      invocationId: " invoke-1 ",
      allowedServerIds: ["fs-mcp"],
      grantedPermissions: ["mcp:cancel", "mcp:control"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.cancel");
  assert.equal(result.output.target.serverId, "fs-mcp");
  assert.equal(result.output.target.executionId, "exec-1");
  assert.equal(result.output.cancelEnvelope.force, true);
  assert.deepEqual(result.output.permissionsRequired, ["mcp:cancel", "mcp:control"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(mcpCancelDescriptor.unsafeSideEffects, true);
});

test("planMcpCancel rejects empty input with a public-safe error", () => {
  const result = planMcpCancel();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty MCP cancel input should fail");
  }

  assert.equal(result.error.code, "MISSING_SERVER_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("planMcpCancel rejects blank reasons, missing force permissions, and real execution", () => {
  const blankReason = planMcpCancel({
    target: { serverId: "fs-mcp", executionId: "exec-1", reason: " " },
  });

  assert.equal(blankReason.ok, false);
  if (blankReason.ok) {
    assert.fail("blank cancel reason should fail");
  }
  assert.equal(blankReason.error.code, "INVALID_REASON");

  const missingPermission = planMcpCancel({
    target: { serverId: "fs-mcp", executionId: "exec-1", force: true },
    context: { grantedPermissions: ["mcp:cancel"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("forced cancel should require mcp:control");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realExecution = planMcpCancel({
    target: { serverId: "fs-mcp", executionId: "exec-1" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real MCP cancel execution should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
});
