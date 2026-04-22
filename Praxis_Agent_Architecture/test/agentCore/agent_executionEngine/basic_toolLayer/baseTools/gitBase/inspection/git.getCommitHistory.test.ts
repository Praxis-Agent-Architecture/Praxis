import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitCommitHistoryRead } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.md",
  testFileUrl: import.meta.url,
});

test("planGitCommitHistoryRead creates a guarded dry-run history read plan", () => {
  const result = planGitCommitHistoryRead({
    target: {
      repositoryPath: "/repo/project",
      maxCount: 3,
      ref: "main",
      pathFilter: "src/index.ts",
    },
    context: {
      invocationId: "history-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.getCommitHistory");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "log",
    "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
    "--max-count",
    "3",
    "main",
    "--",
    "src/index.ts",
  ]);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.resultEnvelope.parser, "git-log-unit-separator-v1");
  assert.deepEqual(result.output.resultEnvelope.entries, []);
  assert.equal(result.audit[0]?.invocationId, "history-1");
});

test("planGitCommitHistoryRead rejects invalid count and unsafe path filters", () => {
  const invalidCount = planGitCommitHistoryRead({
    target: { repositoryPath: "/repo/project", maxCount: 0 },
  });

  assert.equal(invalidCount.ok, false);
  if (!invalidCount.ok) {
    assert.equal(invalidCount.error.code, "INVALID_MAX_COUNT");
    assert.equal(invalidCount.error.boundary, "input");
  }

  const unsafe = planGitCommitHistoryRead({
    target: { repositoryPath: "/repo/project", pathFilter: "../secret.ts" },
  });

  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_PATH_FILTER");
    assert.equal(unsafe.error.boundary, "scope");
  }

  const unsafeRef = planGitCommitHistoryRead({
    target: { repositoryPath: "/repo/project", ref: "--all" },
  });

  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "UNSAFE_REF");
    assert.equal(unsafeRef.error.boundary, "scope");
  }
});

test("planGitCommitHistoryRead blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitCommitHistoryRead({
    target: { repositoryPath: "/other/project" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitCommitHistoryRead({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
