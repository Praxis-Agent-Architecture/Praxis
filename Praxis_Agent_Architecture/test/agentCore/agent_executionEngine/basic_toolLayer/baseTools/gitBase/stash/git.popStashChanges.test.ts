import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitPopStashChanges } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.md",
  testFileUrl: import.meta.url,
});

test("planGitPopStashChanges creates a guarded dry-run stash pop envelope", () => {
  const result = planGitPopStashChanges({
    target: {
      repositoryPath: "/repo/project",
      stashRef: " stash@{3} ",
      reinstateIndex: true,
    },
    context: {
      invocationId: "pop-stash-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.popStashChanges");
  assert.equal(result.output.target.stashRef, "stash@{3}");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "pop",
    "--index",
    "stash@{3}",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.dropsStashOnSuccess, true);
  assert.equal(result.audit[0]?.invocationId, "pop-stash-1");
});

test("planGitPopStashChanges defaults to the latest stash and rejects permission gaps", () => {
  const defaultRef = planGitPopStashChanges({
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
      "pop",
      "stash@{0}",
    ]);
  }

  const missingPermission = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{1}" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitPopStashChanges blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitPopStashChanges({
    target: { repositoryPath: "/other/project" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
