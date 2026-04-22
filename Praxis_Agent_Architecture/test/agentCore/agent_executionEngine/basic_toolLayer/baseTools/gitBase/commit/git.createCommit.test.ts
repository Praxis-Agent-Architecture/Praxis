import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitCreateCommitDescriptor,
  planGitCommitCreation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitCommitCreation creates a guarded dry-run commit plan", () => {
  const result = planGitCommitCreation({
    target: {
      repositoryPath: "/repo",
      commitMessage: "Add agentCore git primitive",
      includeAllTracked: true,
      allowEmpty: true,
      signoff: true,
    },
    context: {
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(gitCreateCommitDescriptor.unsafeSideEffects, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected create commit dry-run plan");
  }

  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo",
    "commit",
    "--all",
    "--allow-empty",
    "--signoff",
    "-m",
    "Add agentCore git primitive",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
});

test("planGitCommitCreation rejects empty input, missing messages, and missing permissions", () => {
  const missingRepository = planGitCommitCreation();

  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingRepository.error.boundary, "input");
  }

  const missingMessage = planGitCommitCreation({
    target: { repositoryPath: "/repo", commitMessage: "  " },
  });

  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingMessage.error.boundary, "input");
  }

  const missingPermission = planGitCommitCreation({
    target: { repositoryPath: "/repo", commitMessage: "Ship it" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});
