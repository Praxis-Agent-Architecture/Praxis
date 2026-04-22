import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitRevertCommitDescriptor,
  planGitCommitRevert,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitCommitRevert creates a guarded dry-run revert plan", () => {
  const result = planGitCommitRevert({
    target: {
      repositoryPath: "/repo",
      commitRef: "deadbeef",
      noCommit: true,
      mainlineParent: 2,
    },
    context: {
      invocationId: "revert-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(gitRevertCommitDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected revert dry-run plan");
  }

  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo",
    "revert",
    "--no-commit",
    "--mainline",
    "2",
    "deadbeef",
  ]);
  assert.equal(result.audit[0]?.type, "agentCore.basicTool.git.revertCommit.dryRun");
});

test("planGitCommitRevert rejects empty input, invalid refs, and escaped scope", () => {
  const missingRepository = planGitCommitRevert();

  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingRepository.error.boundary, "input");
  }

  const missingRef = planGitCommitRevert({
    target: { repositoryPath: "/repo" },
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_TARGET_REF");
    assert.equal(missingRef.error.boundary, "input");
  }

  const escapedScope = planGitCommitRevert({
    target: { repositoryPath: "/outside", commitRef: "HEAD~1" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(escapedScope.ok, false);
  if (!escapedScope.ok) {
    assert.equal(escapedScope.error.code, "SCOPE_REJECTED");
    assert.equal(escapedScope.error.boundary, "scope");
  }
});
