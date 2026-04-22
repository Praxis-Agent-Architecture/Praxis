import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitLastCommitAmend } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitLastCommitAmend creates a guarded dry-run amend envelope", () => {
  const result = planGitLastCommitAmend({
    target: {
      repositoryPath: "/repo/project",
      commitMessage: "Refine agentCore git primitive",
      includeAllTracked: true,
      resetAuthor: true,
    },
    context: {
      invocationId: "amend-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.amendLastCommit");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "commit",
    "--amend",
    "--all",
    "--reset-author",
    "-m",
    "Refine agentCore git primitive",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "amend-1");
});

test("planGitLastCommitAmend supports no-edit and rejects missing amend intent", () => {
  const noEdit = planGitLastCommitAmend({
    target: { repositoryPath: "/repo/project", noEdit: true },
  });

  assert.equal(noEdit.ok, true);
  if (noEdit.ok) {
    assert.deepEqual(noEdit.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "commit",
      "--amend",
      "--no-edit",
    ]);
  }

  const missingMessage = planGitLastCommitAmend({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingMessage.error.boundary, "input");
  }
});

test("planGitLastCommitAmend blocks real amend side effects", () => {
  const result = planGitLastCommitAmend({
    target: { repositoryPath: "/repo/project", noEdit: true },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
