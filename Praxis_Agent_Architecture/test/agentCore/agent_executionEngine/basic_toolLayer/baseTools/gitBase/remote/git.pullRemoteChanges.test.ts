import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRemotePull } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.md",
  testFileUrl: import.meta.url,
});

test("planGitRemotePull creates a guarded dry-run pull plan", () => {
  const result = planGitRemotePull({
    target: {
      repositoryPath: "/repo/project",
      remoteName: " origin ",
      branchName: " main ",
      integrationMode: "rebase",
      autostash: true,
      prune: true,
    },
    context: {
      invocationId: "pull-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.pullRemoteChanges");
  assert.equal(result.output.target.remoteName, "origin");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "pull",
    "--prune",
    "--autostash",
    "--rebase",
    "origin",
    "main",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "pull-1");
});

test("planGitRemotePull rejects partial remote branch coordinates", () => {
  const result = planGitRemotePull({
    target: { repositoryPath: "/repo/project", remoteName: "origin" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(result.error.boundary, "input");
  }
});

test("planGitRemotePull blocks scope, permission gaps, and real pull side effects", () => {
  const scoped = planGitRemotePull({
    target: { repositoryPath: "/elsewhere/project" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = planGitRemotePull({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const real = planGitRemotePull({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
