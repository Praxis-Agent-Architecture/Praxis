import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitTargetCheckout } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.md",
  testFileUrl: import.meta.url,
});

test("planGitTargetCheckout creates a dry-run checkout envelope", () => {
  const result = planGitTargetCheckout({
    target: { repositoryPath: "/repo/project", targetRef: " origin/main ", newBranchName: "work/main" },
    context: {
      invocationId: "checkout-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.checkoutTarget");
  assert.equal(result.output.target.targetRef, "origin/main");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "checkout",
    "-b",
    "work/main",
    "origin/main",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "checkout-1");
});

test("planGitTargetCheckout rejects missing target refs and permission gaps", () => {
  const missingTarget = planGitTargetCheckout({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.error.code, "MISSING_TARGET_REF");
  }

  const missingPermission = planGitTargetCheckout({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitTargetCheckout blocks real checkout side effects", () => {
  const result = planGitTargetCheckout({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
