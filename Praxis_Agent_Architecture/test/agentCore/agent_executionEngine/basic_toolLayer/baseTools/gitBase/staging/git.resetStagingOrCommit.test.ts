import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitStagingOrCommitReset,
  gitResetStagingOrCommitDescriptor,
  parseGitResetStagingOrCommitResult,
  planGitStagingOrCommitReset,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.resetStagingOrCommit.md",
  testFileUrl: import.meta.url,
});

test("planGitStagingOrCommitReset returns a runtime-shaped dry-run staging reset plan without calling provider", () => {
  let providerCalled = false;
  const result = planGitStagingOrCommitReset({
    target: {
      repositoryPath: "/workspace/praxis",
      action: "staging",
      pathspecs: ["src/index.ts"],
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(gitResetStagingOrCommitDescriptor.tapOwnsApproval, true);
  assert.equal(gitResetStagingOrCommitDescriptor.runtimeEntryPort, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected staging reset dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.resetStagingOrCommit");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(providerCalled, false);
  assert.deepEqual(result.output.gitArgs, ["reset", "--", "src/index.ts"]);
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
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.output.risk.mutatesIndex, true);
});

test("planGitStagingOrCommitReset rejects malformed input without raw TypeError", () => {
  const malformedContext = planGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "staging" },
    context: "not-json" as never,
  });

  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.equal(malformedContext.error.publicSafe, true);
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

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
});

test("executeGitStagingOrCommitReset enforces governance and provider availability", async () => {
  const noGuard = await executeGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "staging", pathspecs: ["src/index.ts"] },
    context: { dryRun: false },
  });

  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) {
    assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");
    assert.equal(noGuard.error.boundary, "governance");
  }

  const noProvider = await executeGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "staging", pathspecs: ["src/index.ts"] },
    context: { dryRun: false, guard: { allowed: true } },
  });

  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) {
    assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(noProvider.error.boundary, "provider");
  }
});

test("executeGitStagingOrCommitReset calls provider with fixed argv and parses public output", async () => {
  const calls: { repositoryPath: string; args: readonly string[]; timeoutMs?: number }[] = [];
  const result = await executeGitStagingOrCommitReset({
    target: { repositoryPath: "/workspace/praxis", action: "staging", pathspecs: ["src/index.ts"] },
    context: { dryRun: false, guard: { accepted: true } },
    timeoutMs: 1000,
    provider(request) {
      calls.push(request);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ repositoryPath: "/workspace/praxis", args: ["reset", "--", "src/index.ts"], timeoutMs: 1000 }]);
  if (!result.ok) {
    assert.fail("expected reset execution to succeed");
  }
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.action, "staging");
  assert.deepEqual(result.output.resultEnvelope.pathspecs, ["src/index.ts"]);
});

test("executeGitStagingOrCommitReset maps provider failure to a public-safe error", async () => {
  const result = await executeGitStagingOrCommitReset({
    target: { repositoryPath: "/private/workspace/praxis", action: "commit", targetRef: "HEAD~1", mode: "hard" },
    context: { dryRun: false, guard: { allowed: true } },
    provider() {
      throw new Error("fatal: /private/workspace/praxis git reset --hard HEAD~1 failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/private\/workspace/u);
    assert.doesNotMatch(result.error.message, /--hard HEAD~1/u);
  }
});

test("parseGitResetStagingOrCommitResult reports safe result envelope fields", () => {
  const envelope = parseGitResetStagingOrCommitResult(
    { exitCode: 0, stdout: "one\n", stderr: "warn" },
    { repositoryPath: "/workspace/praxis", action: "commit", pathspecs: [], targetRef: "HEAD~1", mode: "mixed" },
  );

  assert.equal(envelope.parser, "git-reset-exit-v1");
  assert.equal(envelope.action, "commit");
  assert.equal(envelope.targetRef, "HEAD~1");
  assert.equal(envelope.mode, "mixed");
  assert.equal(envelope.exitCode, 0);
  assert.equal(envelope.stdoutLineCount, 2);
  assert.equal(envelope.stderrLineCount, 1);
});
