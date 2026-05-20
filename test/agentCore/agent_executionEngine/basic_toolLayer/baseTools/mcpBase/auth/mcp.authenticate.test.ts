import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpAuthenticate } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authenticate.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authenticate.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authenticate.md",
  testFileUrl: import.meta.url,
});

test("planMcpAuthenticate creates a dry-run authentication envelope without raw secrets", () => {
  const result = planMcpAuthenticate({
    target: {
      serverId: " filesystem ",
      authStrategy: "oauth",
      credentialRef: " secret://mcp/filesystem/oauth ",
      requestedScopes: [" resources:read ", "tools:call", "tools:call"],
    },
    context: {
      invocationId: "mcp-auth-1",
      allowedServerIds: ["filesystem"],
      grantedPermissions: ["mcp:connect", "mcp:auth"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.authenticate");
  assert.equal(result.output.target.serverId, "filesystem");
  assert.equal(result.output.credentialMaterialAccepted, false);
  assert.equal(result.output.tokenIssued, false);
  assert.deepEqual(result.output.authEnvelope.requestedScopes, ["resources:read", "tools:call"]);
  assert.equal(result.audit[0]?.invocationId, "mcp-auth-1");
});

test("planMcpAuthenticate rejects missing input, scope gaps, permission gaps, and real execution", () => {
  const missing = planMcpAuthenticate();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const missingCredential = planMcpAuthenticate({
    target: { serverId: "filesystem", authStrategy: "api-key" },
  });

  assert.equal(missingCredential.ok, false);
  if (!missingCredential.ok) {
    assert.equal(missingCredential.error.code, "MISSING_CREDENTIAL_REF");
  }

  const scoped = planMcpAuthenticate({
    target: { serverId: "browser", authStrategy: "custom", credentialRef: "secret://browser" },
    context: { allowedServerIds: ["filesystem"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = planMcpAuthenticate({
    target: { serverId: "filesystem", authStrategy: "bearer-token", credentialRef: "secret://token" },
    context: { grantedPermissions: ["mcp:connect"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpAuthenticate({
    target: { serverId: "filesystem", authStrategy: "oauth", credentialRef: "secret://oauth" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
