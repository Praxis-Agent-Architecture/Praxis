import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRepositoryArchive } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.md",
  testFileUrl: import.meta.url,
});

test("planGitRepositoryArchive creates a guarded dry-run archive plan", () => {
  const result = planGitRepositoryArchive({
    target: {
      repositoryPath: "/repo/project",
      outputPath: "/tmp/project.zip",
      ref: " v1.0.0 ",
      format: "zip",
      pathspecs: [" src ", "docs", "src"],
      prefix: "project/",
    },
    context: {
      invocationId: "archive-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.archiveRepository");
  assert.equal(result.output.target.ref, "v1.0.0");
  assert.deepEqual(result.output.target.pathspecs, ["src", "docs"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "archive",
    "--format=zip",
    "--output",
    "/tmp/project.zip",
    "--prefix=project/",
    "v1.0.0",
    "src",
    "docs",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "archive-1");
});

test("planGitRepositoryArchive rejects missing output paths and permission gaps", () => {
  const missingOutput = planGitRepositoryArchive({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingOutput.ok, false);
  if (!missingOutput.ok) {
    assert.equal(missingOutput.error.code, "MISSING_TARGET_PATH");
  }

  const missingPermission = planGitRepositoryArchive({
    target: { repositoryPath: "/repo/project", outputPath: "/tmp/project.tar" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});

test("planGitRepositoryArchive blocks out-of-scope and real archive writes", () => {
  const scoped = planGitRepositoryArchive({
    target: { repositoryPath: "/elsewhere/project", outputPath: "/tmp/project.tar" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitRepositoryArchive({
    target: { repositoryPath: "/repo/project", outputPath: "/tmp/project.tar" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
