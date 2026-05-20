import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpCreateResource } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.createResource.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.createResource.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.createResource.md",
  testFileUrl: import.meta.url,
});

test("planMcpCreateResource creates a guarded dry-run resource creation envelope", () => {
  const result = planMcpCreateResource({
    target: {
      serverId: "filesystem-mcp",
      uri: "file:///workspace/new-note.md",
      resourceType: "document",
      mimeType: "text/markdown",
    },
    initialContent: "# note",
    metadata: { owner: "tap" },
    context: {
      invocationId: "create-1",
      allowedServerIds: ["filesystem-mcp"],
      allowedUriPrefixes: ["file:///workspace/"],
      grantedPermissions: ["mcp:connection:read", "mcp:resource:create"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.createResource");
  assert.equal(result.output.target.uri, "file:///workspace/new-note.md");
  assert.equal(result.output.resourceEnvelope.created, false);
  assert.equal(result.output.resourceEnvelope.contentAccepted, true);
  assert.deepEqual(result.output.resourceEnvelope.metadataKeys, ["owner"]);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "create-1");
});

test("planMcpCreateResource rejects missing uri, missing permission, and real execution", () => {
  const missingUri = planMcpCreateResource({ target: { serverId: "filesystem-mcp" } });

  assert.equal(missingUri.ok, false);
  if (!missingUri.ok) {
    assert.equal(missingUri.error.code, "MISSING_RESOURCE_URI");
    assert.equal(missingUri.error.boundary, "input");
  }

  const permission = planMcpCreateResource({
    target: { serverId: "filesystem-mcp", uri: "file:///workspace/new-note.md" },
    context: { grantedPermissions: ["mcp:connection:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const real = planMcpCreateResource({
    target: { serverId: "filesystem-mcp", uri: "file:///workspace/new-note.md" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planMcpCreateResource rejects resource uri outside allowed prefixes", () => {
  const result = planMcpCreateResource({
    target: { serverId: "filesystem-mcp", uri: "file:///outside/new-note.md" },
    context: { allowedUriPrefixes: ["file:///workspace/"] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});

test("planMcpCreateResource does not allow sibling uri prefixes", () => {
  const result = planMcpCreateResource({
    target: { serverId: "filesystem-mcp", uri: "file:///workspace-evil/new-note.md" },
    context: { allowedUriPrefixes: ["file:///workspace"] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});
