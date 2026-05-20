import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpConnect } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.connect.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.connect.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.connect.md",
  testFileUrl: import.meta.url,
});

test("planMcpConnect creates a guarded dry-run network connection plan", () => {
  const result = planMcpConnect({
    target: {
      serverId: "docs-server",
      transport: "http",
      endpoint: " https://mcp.example.test ",
      timeoutMs: 10_000,
    },
    context: {
      invocationId: "connect-1",
      allowedServerIds: ["docs-server"],
      grantedPermissions: ["mcp:connect", "network:connect"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.connect");
  assert.equal(result.output.target.endpoint, "https://mcp.example.test");
  assert.equal(result.output.operationPreview.connectionState, "planned");
  assert.deepEqual(result.output.permissionsRequired, ["mcp:connect", "network:connect"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "connect-1");
});

test("planMcpConnect validates missing transport and stdio command", () => {
  const missingTransport = planMcpConnect({
    target: { serverId: "local-server" },
  });

  assert.equal(missingTransport.ok, false);
  if (!missingTransport.ok) {
    assert.equal(missingTransport.error.code, "MISSING_TRANSPORT");
    assert.equal(missingTransport.error.boundary, "input");
  }

  const missingCommand = planMcpConnect({
    target: { serverId: "local-server", transport: "stdio" },
  });

  assert.equal(missingCommand.ok, false);
  if (!missingCommand.ok) {
    assert.equal(missingCommand.error.code, "MISSING_COMMAND");
  }
});

test("planMcpConnect rejects malformed network endpoints", () => {
  const malformed = planMcpConnect({
    target: { serverId: "docs-server", transport: "http", endpoint: "https://" },
  });

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_ENDPOINT");
    assert.equal(malformed.error.boundary, "input");
  }
});

test("planMcpConnect blocks out-of-scope, missing permissions, and real execution", () => {
  const scoped = planMcpConnect({
    target: { serverId: "other-server", transport: "http", endpoint: "https://mcp.example.test" },
    context: { allowedServerIds: ["docs-server"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const permission = planMcpConnect({
    target: { serverId: "docs-server", transport: "http", endpoint: "https://mcp.example.test" },
    context: { grantedPermissions: ["mcp:connect"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpConnect({
    target: { serverId: "docs-server", transport: "http", endpoint: "https://mcp.example.test" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
