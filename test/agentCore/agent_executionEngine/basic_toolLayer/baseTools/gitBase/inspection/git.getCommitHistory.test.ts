import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  executeGitCommitHistory,
  parseGitCommitHistory,
  planGitCommitHistoryRead,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getCommitHistory.md",
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
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.providerCalled, false);
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

  assert.equal(real.ok, true);
  if (real.ok) {
    assert.equal(real.output.providerCalled, false);
    assert.equal(real.output.dryRun, true);
  }
});

test("executeGitCommitHistory gates provider dispatch and parses fake runtime output", async () => {
  let called = 0;
  const dryRun = await executeGitCommitHistory({
    target: { repositoryPath: "/repo/project", maxCount: 2 },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitCommitHistory({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitCommitHistory({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitCommitHistory({
    target: { repositoryPath: "/repo/project", maxCount: 2, ref: "main", pathFilter: "src/index.ts" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, [
        "log",
        "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
        "--max-count",
        "2",
        "main",
        "--",
        "src/index.ts",
      ]);
      return {
        exitCode: 0,
        stdout: "abcdef123456\x1fabcdef1\x1fAda\x1fada@example.com\x1f2026-04-27T00:00:00+00:00\x1fInitial commit\n",
        stderr: "",
      };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.resultEnvelope.entries[0]?.shortHash, "abcdef1");
    assert.equal(executed.output.resultEnvelope.entries[0]?.subject, "Initial commit");
  }
});

test("parseGitCommitHistory ignores malformed lines without raw errors", () => {
  const parsed = parseGitCommitHistory("bad\n123456789\x1f1234567\x1fDev\x1fdev@example.com\x1f2026-04-27T00:00:00+00:00\x1fSubject\n");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.authorName, "Dev");
});
