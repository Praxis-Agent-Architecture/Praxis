import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitInitializeRepositoryDescriptor,
  planGitRepositoryInitialization,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.md",
  testFileUrl: import.meta.url,
});

test("planGitRepositoryInitialization returns a guarded dry-run init plan", () => {
  const result = planGitRepositoryInitialization({
    target: {
      repositoryPath: "/workspace/new-repo",
      initialBranch: "main",
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:write", "filesystem:write"],
    },
  });

  assert.equal(gitInitializeRepositoryDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected init dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.initializeRepository");
  assert.equal(result.output.executionBlocked, true);
  assert.deepEqual(result.output.commandPreview, ["git", "init", "--initial-branch", "main", "/workspace/new-repo"]);
  assert.deepEqual(result.output.permissionsRequired, ["git:write", "filesystem:write"]);
});

test("planGitRepositoryInitialization rejects missing path, missing permission, and real execution", () => {
  const missingPath = planGitRepositoryInitialization();

  assert.equal(missingPath.ok, false);
  if (!missingPath.ok) {
    assert.equal(missingPath.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingPath.error.boundary, "input");
  }

  const permissionDenied = planGitRepositoryInitialization({
    target: { repositoryPath: "/workspace/new-repo" },
    context: { grantedPermissions: ["git:write"] },
  });

  assert.equal(permissionDenied.ok, false);
  if (!permissionDenied.ok) {
    assert.equal(permissionDenied.error.code, "PERMISSION_DENIED");
    assert.equal(permissionDenied.error.boundary, "permission");
  }

  const realExecution = planGitRepositoryInitialization({
    target: { repositoryPath: "/workspace/new-repo" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
