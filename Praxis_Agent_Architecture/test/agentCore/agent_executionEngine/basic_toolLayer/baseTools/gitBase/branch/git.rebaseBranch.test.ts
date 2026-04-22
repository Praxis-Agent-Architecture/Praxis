import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitBranchRebase } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.md",
  testFileUrl: import.meta.url,
});

test("planGitBranchRebase creates a guarded dry-run rebase envelope", () => {
  const result = planGitBranchRebase({
    target: {
      repositoryPath: "/repo/project",
      upstreamRef: " origin/main ",
      branchName: "feature/a",
      ontoRef: "main",
      autosquash: true,
    },
    context: {
      invocationId: "rebase-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.rebaseBranch");
  assert.equal(result.output.target.upstreamRef, "origin/main");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "rebase",
    "--autosquash",
    "--onto",
    "main",
    "origin/main",
    "feature/a",
  ]);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "rebase-1");
});

test("planGitBranchRebase rejects missing upstream refs and scope violations", () => {
  const missingUpstream = planGitBranchRebase({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingUpstream.ok, false);
  if (!missingUpstream.ok) {
    assert.equal(missingUpstream.error.code, "MISSING_TARGET_REF");
    assert.equal(missingUpstream.error.boundary, "input");
  }

  const scoped = planGitBranchRebase({
    target: { repositoryPath: "/other/project", upstreamRef: "main" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }
});

test("planGitBranchRebase blocks real rebase side effects", () => {
  const result = planGitBranchRebase({
    target: { repositoryPath: "/repo/project", upstreamRef: "origin/main" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
