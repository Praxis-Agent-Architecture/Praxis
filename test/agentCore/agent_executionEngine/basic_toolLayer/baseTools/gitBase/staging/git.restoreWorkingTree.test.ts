import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  executeGitRestoreWorkingTree,
  gitRestoreWorkingTreeDescriptor,
  parseGitRestoreWorkingTreeResult,
  planGitRestoreWorkingTree,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.restoreWorkingTree.md",
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
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.restoreWorkingTree");
  assert.equal(gitRestoreWorkingTreeDescriptor.operationRisk, "workspace-mutation");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesWorkingTree, true);
  assert.equal(result.output.providerCalled, false);
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
    context: { grantedPermissions: ["git:read", "git:write", "filesystem:read"] },
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

  assert.equal(real.ok, true);
  if (real.ok) {
    assert.equal(real.output.providerCalled, false);
    assert.equal(real.output.executionBlocked, true);
  }
});

test("executeGitRestoreWorkingTree gates provider dispatch and calls fake runtime with fixed argv", async () => {
  let called = 0;
  const dryRun = await executeGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"] },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"] },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"] },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitRestoreWorkingTree({
    target: { repositoryPath: "/repo/project", paths: ["src/a.ts"], sourceRef: "HEAD" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, ["restore", "--source", "HEAD", "--worktree", "--", "src/a.ts"]);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.executionBlocked, false);
    assert.equal(executed.output.resultEnvelope.paths[0], "src/a.ts");
  }

  const failed = await executeGitRestoreWorkingTree({
    target: { repositoryPath: "/secret/repo", paths: ["src/a.ts"] },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("leaked /secret/repo git restore");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|git restore/u);
  }
});

test("parseGitRestoreWorkingTreeResult summarizes provider output safely", () => {
  const parsed = parseGitRestoreWorkingTreeResult(
    { exitCode: 0, stdout: "restored\n", stderr: "warn\n" },
    { repositoryPath: "/repo/project", paths: ["src/a.ts"], sourceRef: "HEAD" },
  );
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.stdoutLineCount, 2);
  assert.equal(parsed.stderrLineCount, 2);
  assert.equal(parsed.sourceRef, "HEAD");
});
