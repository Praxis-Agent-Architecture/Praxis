import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpReadResourceDescriptor,
  planMcpResourceRead,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.readResource.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.readResource.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.readResource.md",
  testFileUrl: import.meta.url,
});

test("planMcpResourceRead creates a guarded dry-run resource read envelope", () => {
  const result = planMcpResourceRead({
    target: {
      serverId: "docs",
      resourceUri: "file:///repo/README.md",
      acceptMimeTypes: ["text/markdown", "text/markdown"],
      maxBytes: 4096,
    },
    context: {
      invocationId: "read-1",
      requestedScopes: ["mcp:docs"],
      allowedScopes: ["mcp:docs"],
      grantedPermissions: ["mcp:resource:read"],
    },
  });

  assert.equal(mcpReadResourceDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.readResource");
  assert.equal(result.output.target.serverId, "docs");
  assert.deepEqual(result.output.target.acceptMimeTypes, ["text/markdown"]);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resourceEnvelope.contents, []);
  assert.equal(result.output.resourceEnvelope.source, "mockable-envelope");
  assert.equal(result.audit[0]?.invocationId, "read-1");
});

test("planMcpResourceRead rejects missing targets and invalid maxBytes", () => {
  const missingServer = planMcpResourceRead({
    target: { resourceUri: "file:///repo/README.md" },
  });

  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) {
    assert.equal(missingServer.error.code, "MISSING_SERVER_ID");
    assert.equal(missingServer.error.boundary, "input");
  }

  const missingUri = planMcpResourceRead({
    target: { serverId: "docs" },
  });

  assert.equal(missingUri.ok, false);
  if (!missingUri.ok) {
    assert.equal(missingUri.error.code, "MISSING_RESOURCE_URI");
  }

  const invalidLimit = planMcpResourceRead({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", maxBytes: 0 },
  });

  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) {
    assert.equal(invalidLimit.error.code, "INVALID_MAX_BYTES");
  }
});

test("planMcpResourceRead blocks denied scope, missing permission, and real execution", () => {
  const scoped = planMcpResourceRead({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md" },
    context: { requestedScopes: ["mcp:private"], allowedScopes: ["mcp:docs"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_DENIED");
  }

  const deniedPermission = planMcpResourceRead({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md" },
    context: { grantedPermissions: ["mcp:resource:write" as "mcp:resource:read"] },
  });

  assert.equal(deniedPermission.ok, false);
  if (!deniedPermission.ok) {
    assert.equal(deniedPermission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpResourceRead({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
