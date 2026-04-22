import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitBranchMerge } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.md",
  testFileUrl: import.meta.url,
});

test("planGitBranchMerge creates a guarded dry-run merge envelope", () => {
  const result = planGitBranchMerge({
    target: {
      repositoryPath: "/repo/project",
      sourceBranch: " feature/a ",
      mode: "no-ff",
      commitMessage: "Merge feature/a",
    },
    context: {
      invocationId: "merge-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.mergeBranch");
  assert.equal(result.output.target.sourceBranch, "feature/a");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "merge",
    "--no-ff",
    "-m",
    "Merge feature/a",
    "feature/a",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "merge-1");
});

test("planGitBranchMerge rejects missing branches and permission gaps", () => {
  const missingBranch = planGitBranchMerge({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingBranch.ok, false);
  if (!missingBranch.ok) {
    assert.equal(missingBranch.error.code, "MISSING_BRANCH_NAME");
    assert.equal(missingBranch.error.boundary, "input");
  }

  const missingPermission = planGitBranchMerge({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitBranchMerge blocks real merge side effects", () => {
  const result = planGitBranchMerge({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
