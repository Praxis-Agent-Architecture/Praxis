import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitResetStagingOrCommitDescriptor,
  planGitStagingOrCommitReset,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitStagingOrCommitReset returns a guarded dry-run staging reset plan", () => {
  const result = planGitStagingOrCommitReset({
    target: {
      repositoryPath: "/workspace/praxis",
      action: "staging",
      pathspecs: ["src/index.ts"],
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(gitResetStagingOrCommitDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected staging reset dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.resetStagingOrCommit");
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/workspace/praxis", "reset", "--", "src/index.ts"]);
});

test("planGitStagingOrCommitReset returns a guarded dry-run commit reset plan", () => {
  const result = planGitStagingOrCommitReset({
    target: {
      repositoryPath: "/workspace/praxis",
      action: "commit",
      targetRef: "HEAD~1",
      mode: "soft",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected commit reset dry-run plan");
  }

  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/workspace/praxis", "reset", "--soft", "HEAD~1"]);
  assert.equal(result.output.target.mode, "soft");
});

test("planGitStagingOrCommitReset rejects missing action, missing ref, and real execution", () => {
  const missingAction = planGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis" },
  });

  assert.equal(missingAction.ok, false);
  if (!missingAction.ok) {
    assert.equal(missingAction.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingAction.error.boundary, "input");
  }

  const missingRef = planGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "commit" },
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_TARGET_REF");
    assert.equal(missingRef.error.boundary, "input");
  }

  const realExecution = planGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "staging", pathspecs: ["src/index.ts"] },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
