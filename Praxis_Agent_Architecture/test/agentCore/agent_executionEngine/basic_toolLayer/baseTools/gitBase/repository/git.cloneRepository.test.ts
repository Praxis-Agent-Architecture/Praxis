import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitCloneRepositoryDescriptor,
  planGitRepositoryClone,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.md",
  testFileUrl: import.meta.url,
});

test("planGitRepositoryClone returns a guarded dry-run command preview", () => {
  const result = planGitRepositoryClone({
    target: {
      remoteUrl: "https://example.com/praxis.git",
      destinationPath: "/workspace/praxis",
      branch: "main",
      depth: 1,
      singleBranch: true,
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:read", "filesystem:write"],
      invocationId: "clone-1",
    },
  });

  assert.equal(gitCloneRepositoryDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected clone dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.cloneRepository");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.mayUseNetwork, true);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "clone",
    "--branch",
    "main",
    "--depth",
    "1",
    "--single-branch",
    "https://example.com/praxis.git",
    "/workspace/praxis",
  ]);
  assert.deepEqual(result.events, ["basicTool.git.cloneRepository.dryRun"]);
});

test("planGitRepositoryClone classifies missing input, scope, and real execution boundaries", () => {
  const missingRemote = planGitRepositoryClone({
    target: { destinationPath: "/workspace/praxis" },
  });

  assert.equal(missingRemote.ok, false);
  if (!missingRemote.ok) {
    assert.equal(missingRemote.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingRemote.error.boundary, "input");
  }

  const missingDestination = planGitRepositoryClone({
    target: { remoteUrl: "https://example.com/praxis.git" },
  });

  assert.equal(missingDestination.ok, false);
  if (!missingDestination.ok) {
    assert.equal(missingDestination.error.code, "MISSING_TARGET_PATH");
    assert.equal(missingDestination.error.message, "git.cloneRepository requires target.destinationPath");
  }

  const outOfScope = planGitRepositoryClone({
    target: { remoteUrl: "https://example.com/praxis.git", destinationPath: "/tmp/praxis" },
    context: { allowedRepositoryRoots: ["/workspace"] },
  });

  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
    assert.equal(outOfScope.error.boundary, "scope");
  }

  const realExecution = planGitRepositoryClone({
    target: { remoteUrl: "https://example.com/praxis.git", destinationPath: "/workspace/praxis" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
