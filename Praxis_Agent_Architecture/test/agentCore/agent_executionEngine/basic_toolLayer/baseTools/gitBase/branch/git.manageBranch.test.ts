import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitBranchManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.md",
  testFileUrl: import.meta.url,
});

test("planGitBranchManagement creates a guarded dry-run branch plan", () => {
  const result = planGitBranchManagement({
    target: { repositoryPath: "/repo/project", action: "create", branchName: " feature/a ", startPoint: "main" },
    context: {
      invocationId: "branch-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageBranch");
  assert.equal(result.output.target.branchName, "feature/a");
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/repo/project", "branch", "feature/a", "main"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "branch-1");
});

test("planGitBranchManagement rejects missing branch names for write actions", () => {
  const result = planGitBranchManagement({
    target: { repositoryPath: "/repo/project", action: "delete" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_BRANCH_NAME");
    assert.equal(result.error.boundary, "input");
  }
});

test("planGitBranchManagement blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitBranchManagement({
    target: { repositoryPath: "/other/project", action: "list" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitBranchManagement({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
