import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpUpdateResourceDescriptor,
  planMcpResourceUpdate,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.updateResource.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.updateResource.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.updateResource.md",
  testFileUrl: import.meta.url,
});

test("planMcpResourceUpdate creates a guarded dry-run mutation envelope", () => {
  const result = planMcpResourceUpdate({
    target: {
      serverId: "docs",
      resourceUri: "file:///repo/README.md",
      expectedRevision: "rev-1",
      content: {
        mimeType: "text/markdown",
        text: "# Updated",
      },
    },
    context: {
      invocationId: "update-1",
      requestedScopes: ["mcp:docs"],
      allowedScopes: ["mcp:docs"],
      grantedPermissions: ["mcp:resource:write"],
    },
  });

  assert.equal(mcpUpdateResourceDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.updateResource");
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.mutationEnvelope.contentKind, "text");
  assert.equal(result.output.mutationEnvelope.committed, false);
  assert.equal(result.output.mutationEnvelope.expectedRevision, "rev-1");
  assert.equal(result.audit[0]?.invocationId, "update-1");
});

test("planMcpResourceUpdate rejects missing target and empty content", () => {
  const missingServer = planMcpResourceUpdate({
    target: {
      resourceUri: "file:///repo/README.md",
      content: { text: "body" },
    },
  });

  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) {
    assert.equal(missingServer.error.code, "MISSING_SERVER_ID");
  }

  const missingContent = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md" },
  });

  assert.equal(missingContent.ok, false);
  if (!missingContent.ok) {
    assert.equal(missingContent.error.code, "MISSING_CONTENT");
  }

  const emptyContent = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", content: { text: " " } },
  });

  assert.equal(emptyContent.ok, false);
  if (!emptyContent.ok) {
    assert.equal(emptyContent.error.code, "INVALID_CONTENT");
    assert.equal(emptyContent.error.boundary, "input");
  }
});

test("planMcpResourceUpdate blocks denied scope, missing permission, governance rejection, and real execution", () => {
  const scoped = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", content: { text: "body" } },
    context: { requestedScopes: ["mcp:private"], allowedScopes: ["mcp:docs"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_DENIED");
  }

  const permission = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", content: { text: "body" } },
    context: { grantedPermissions: ["mcp:resource:read" as "mcp:resource:write"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const governance = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", content: { text: "body" } },
    context: { governance: { accepted: false, reason: "approval required" } },
  });

  assert.equal(governance.ok, false);
  if (!governance.ok) {
    assert.equal(governance.error.code, "GOVERNANCE_REJECTED");
  }

  const real = planMcpResourceUpdate({
    target: { serverId: "docs", resourceUri: "file:///repo/README.md", content: { text: "body" } },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
