import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRestoreWorkingTree } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.md",
  testFileUrl: import.meta.url,
});

test("planGitRestoreWorkingTree creates a guarded dry-run restore envelope", () => {
  const result = planGitRestoreWorkingTree({
    target: {
      repositoryPath: "/repo/project",
      paths: [" src/a.ts ", "src/a.ts", "README.md"],
      sourceRef: "HEAD~1",
    },
    context: {
      invocationId: "restore-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.restoreWorkingTree");
  assert.deepEqual(result.output.target.paths, ["src/a.ts", "README.md"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "restore",
    "--source",
    "HEAD~1",
    "--worktree",
    "--",
    "src/a.ts",
    "README.md",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "restore-1");
});

test("planGitRestoreWorkingTree rejects missing paths and permission gaps", () => {
  const missingPath = planGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: [" "] },
  });

  assert.equal(missingPath.ok, false);
  if (!missingPath.ok) {
    assert.equal(missingPath.error.code, "MISSING_TARGET_PATH");
    assert.equal(missingPath.error.boundary, "input");
  }

  const missingPermission = planGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"] },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("planGitRestoreWorkingTree blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitRestoreWorkingTree({
    target: { repositoryPath: "/other/project", paths: ["src/a.ts"] },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"] },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
