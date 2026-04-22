import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitCleanUntrackedFiles } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.md",
  testFileUrl: import.meta.url,
});

test("planGitCleanUntrackedFiles creates a guarded dry-run clean envelope", () => {
  const result = planGitCleanUntrackedFiles({
    target: {
      repositoryPath: "/repo/project",
      paths: [" tmp/a.log ", "tmp/a.log", "build"],
      ignoredMode: "tracked-ignored",
    },
    context: {
      invocationId: "clean-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.cleanUntrackedFiles");
  assert.deepEqual(result.output.target.paths, ["tmp/a.log", "build"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "clean",
    "--dry-run",
    "-f",
    "-d",
    "-x",
    "--",
    "tmp/a.log",
    "build",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "clean-1");
});

test("planGitCleanUntrackedFiles supports repository-wide dry-run preview and permission rejection", () => {
  const repositoryWide = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", includeDirectories: false, ignoredMode: "ignored-only" },
  });

  assert.equal(repositoryWide.ok, true);
  if (repositoryWide.ok) {
    assert.deepEqual(repositoryWide.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "clean",
      "--dry-run",
      "-f",
      "-X",
    ]);
  }

  const missingPermission = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitCleanUntrackedFiles blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/other/project" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
