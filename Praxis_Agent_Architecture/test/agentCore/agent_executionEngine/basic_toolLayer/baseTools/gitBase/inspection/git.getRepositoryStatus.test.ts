import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRepositoryStatusRead } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.md",
  testFileUrl: import.meta.url,
});

test("planGitRepositoryStatusRead creates a guarded dry-run status read plan", () => {
  const result = planGitRepositoryStatusRead({
    target: {
      repositoryPath: "/repo/project",
      includeBranch: true,
      includeUntracked: false,
      porcelainVersion: "v2",
    },
    context: {
      invocationId: "status-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.getRepositoryStatus");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=no",
  ]);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.entries, []);
  assert.equal(result.audit[0]?.invocationId, "status-1");
});

test("planGitRepositoryStatusRead rejects missing repository and invalid porcelain versions", () => {
  const missing = planGitRepositoryStatusRead();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const invalid = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project", porcelainVersion: "v3" as "v1" },
  });

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_PORCELAIN_VERSION");
  }
});

test("planGitRepositoryStatusRead blocks missing permissions and real execution", () => {
  const permission = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
