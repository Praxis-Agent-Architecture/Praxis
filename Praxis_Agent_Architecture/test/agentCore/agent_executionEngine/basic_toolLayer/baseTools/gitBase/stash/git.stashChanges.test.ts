import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitStashChanges } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.md",
  testFileUrl: import.meta.url,
});

test("planGitStashChanges creates a guarded dry-run stash push envelope", () => {
  const result = planGitStashChanges({
    target: {
      repositoryPath: "/repo/project",
      message: " checkpoint before refactor ",
      includeUntracked: true,
      keepIndex: true,
      pathspecs: [" src/index.ts ", "src/index.ts", " test/index.test.ts "],
    },
    context: {
      invocationId: "stash-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.stashChanges");
  assert.equal(result.output.target.message, "checkpoint before refactor");
  assert.deepEqual(result.output.target.pathspecs, ["src/index.ts", "test/index.test.ts"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "push",
    "--include-untracked",
    "--keep-index",
    "-m",
    "checkpoint before refactor",
    "--",
    "src/index.ts",
    "test/index.test.ts",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.createsStashEntry, true);
  assert.equal(result.audit[0]?.invocationId, "stash-1");
});

test("planGitStashChanges rejects missing repository, permission gaps, and real execution", () => {
  const missing = planGitStashChanges();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const missingPermission = planGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }

  const real = planGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
