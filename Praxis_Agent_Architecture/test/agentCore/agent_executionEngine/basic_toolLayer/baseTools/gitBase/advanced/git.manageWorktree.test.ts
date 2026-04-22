import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitWorktreeManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.md",
  testFileUrl: import.meta.url,
});

test("planGitWorktreeManagement creates a guarded dry-run add plan", () => {
  const result = planGitWorktreeManagement({
    target: {
      repositoryPath: "/repo/project",
      action: "add",
      worktreePath: "/repo/worktrees/feature",
      branchName: "feature/a",
      targetRef: "main",
    },
    context: {
      invocationId: "worktree-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageWorktree");
  assert.equal(result.output.target.worktreePath, "/repo/worktrees/feature");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "worktree",
    "add",
    "-b",
    "feature/a",
    "/repo/worktrees/feature",
    "main",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "worktree-1");
});

test("planGitWorktreeManagement rejects missing worktree inputs", () => {
  const missingPath = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "remove" },
  });

  assert.equal(missingPath.ok, false);
  if (!missingPath.ok) {
    assert.equal(missingPath.error.code, "MISSING_TARGET_PATH");
  }

  const missingRef = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "add", worktreePath: "/repo/wt/a" },
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_TARGET_REF");
  }
});

test("planGitWorktreeManagement blocks out-of-scope and real worktree mutations", () => {
  const scoped = planGitWorktreeManagement({
    target: { repositoryPath: "/elsewhere/project", action: "list" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "prune" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
