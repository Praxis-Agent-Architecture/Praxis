import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitLocalPush } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.md",
  testFileUrl: import.meta.url,
});

test("planGitLocalPush creates a guarded dry-run push plan", () => {
  const result = planGitLocalPush({
    target: {
      repositoryPath: "/repo/project",
      remoteName: " origin ",
      branchName: " feature/a ",
      setUpstream: true,
      forceWithLease: true,
    },
    context: {
      invocationId: "push-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.pushLocalChanges");
  assert.equal(result.output.target.remoteName, "origin");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "push",
    "--set-upstream",
    "--force-with-lease",
    "origin",
    "feature/a",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "push-1");
});

test("planGitLocalPush rejects incomplete push targets", () => {
  const missingRemote = planGitLocalPush({
    target: { repositoryPath: "/repo/project", branchName: "main" },
  });

  assert.equal(missingRemote.ok, false);
  if (!missingRemote.ok) {
    assert.equal(missingRemote.error.code, "MISSING_REQUIRED_FIELD");
  }

  const missingBranch = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin" },
  });

  assert.equal(missingBranch.ok, false);
  if (!missingBranch.ok) {
    assert.equal(missingBranch.error.code, "MISSING_BRANCH_NAME");
  }
});

test("planGitLocalPush supports tag push plans and blocks real side effects", () => {
  const tags = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin", pushTags: true },
  });

  assert.equal(tags.ok, true);
  if (tags.ok) {
    assert.deepEqual(tags.output.commandPreview, ["git", "-C", "/repo/project", "push", "origin", "--tags"]);
  }

  const real = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
