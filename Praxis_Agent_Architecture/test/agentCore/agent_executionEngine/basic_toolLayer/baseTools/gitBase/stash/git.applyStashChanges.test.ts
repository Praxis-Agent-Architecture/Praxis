import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitApplyStashChanges } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.md",
  testFileUrl: import.meta.url,
});

test("planGitApplyStashChanges creates a guarded dry-run stash apply envelope", () => {
  const result = planGitApplyStashChanges({
    target: {
      repositoryPath: "/repo/project",
      stashRef: " stash@{2} ",
      reinstateIndex: true,
    },
    context: {
      invocationId: "apply-stash-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.applyStashChanges");
  assert.equal(result.output.target.stashRef, "stash@{2}");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "apply",
    "--index",
    "stash@{2}",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "apply-stash-1");
});

test("planGitApplyStashChanges defaults to the latest stash and rejects permission gaps", () => {
  const defaultRef = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(defaultRef.ok, true);
  if (defaultRef.ok) {
    assert.equal(defaultRef.output.target.stashRef, "stash@{0}");
    assert.deepEqual(defaultRef.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "stash",
      "apply",
      "stash@{0}",
    ]);
  }

  const missingPermission = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{1}" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitApplyStashChanges blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitApplyStashChanges({
    target: { repositoryPath: "/other/project" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
