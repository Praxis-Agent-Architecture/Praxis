import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitCherryPickCommitDescriptor,
  planGitCommitCherryPick,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitCommitCherryPick creates a guarded dry-run cherry-pick plan", () => {
  const result = planGitCommitCherryPick({
    target: {
      repositoryPath: "/repo",
      commitRef: "abc123",
      noCommit: true,
      mainlineParent: 1,
      signoff: true,
    },
    context: {
      invocationId: "invoke-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(gitCherryPickCommitDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected cherry-pick dry-run plan");
  }

  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo",
    "cherry-pick",
    "--no-commit",
    "--signoff",
    "--mainline",
    "1",
    "abc123",
  ]);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "invoke-1");
});

test("planGitCommitCherryPick rejects empty input, missing refs, and real execution", () => {
  const missingRepository = planGitCommitCherryPick();

  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingRepository.error.boundary, "input");
  }

  const missingRef = planGitCommitCherryPick({
    target: { repositoryPath: "/repo" },
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_TARGET_REF");
    assert.equal(missingRef.error.boundary, "input");
  }

  const realExecution = planGitCommitCherryPick({
    target: { repositoryPath: "/repo", commitRef: "abc123" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
