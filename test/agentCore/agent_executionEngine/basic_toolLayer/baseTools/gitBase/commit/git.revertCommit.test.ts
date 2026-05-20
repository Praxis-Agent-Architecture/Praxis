import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitRevertCommit,
  gitRevertCommitDescriptor,
  gitRevertCommitHandler,
  parseGitRevertCommitResult,
  planGitCommitRevert,
  type GitRevertCommitOutput,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.revertCommit.md",
  testFileUrl: import.meta.url,
});

function governedContext() {
  return {
    dryRun: false,
    guard: { allowed: true, accepted: true },
    allowedRepositoryRoots: ["/repo"],
    grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
  };
}

test("planGitCommitRevert creates a fixed dry-run revert envelope without provider dispatch", () => {
  const result = planGitCommitRevert({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef", noCommit: true, mainlineParent: 2 },
    context: {
      invocationId: "revert-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitRevertCommitDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.deepEqual(result.output.gitArgs, ["revert", "--no-commit", "--mainline", "2", "deadbeef"]);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.output.risk.revertsCommit, true);
  assert.equal(result.output.risk.mayCreateCommit, false);
  assert.equal(result.output.risk.mayCreateConflicts, true);
  assert.equal(result.audit[0]?.invocationId, "revert-1");
});

test("git.revertCommit rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitRevertCommit(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.doesNotMatch(malformed.error.message, /TypeError/u);

  const malformedContext = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const missingRepository = await executeGitRevertCommit({
    target: { commitRef: "deadbeef" },
    context: governedContext(),
  });
  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");

  const missingRef = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project" },
    context: governedContext(),
  });
  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) assert.equal(missingRef.error.code, "MISSING_TARGET_REF");

  const unsafeRef = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "HEAD bad" },
    context: governedContext(),
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) assert.equal(unsafeRef.error.code, "INVALID_ARGUMENT");
});

test("git.revertCommit enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitRevertCommit({
    target: { repositoryPath: "/tmp/project", commitRef: "deadbeef" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const missingPermission = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const missingGuard = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.revertCommit calls runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "[main beef456] Revert \"Pick feature\"\n 1 file changed, 1 deletion(-)\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:revert deadbeef"]);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.resultEnvelope.branchName, "main");
  assert.equal(result.output.resultEnvelope.commitHash, "beef456");
  assert.equal(result.output.resultEnvelope.subject, 'Revert "Pick feature"');
  assert.equal(result.output.resultEnvelope.filesChanged, 1);
  assert.equal(result.output.resultEnvelope.revertCompleted, true);
});

test("git.revertCommit provider failures remain public-safe", async () => {
  const result = await executeGitRevertCommit({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/REVERT_HEAD failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /\/repo\/project/u);
    assert.doesNotMatch(result.error.message, /\.git/u);
  }
});

test("git.revertCommit parser keeps safe fallback fields for malformed output", () => {
  const parsed = parseGitRevertCommitResult(
    { exitCode: 0, stdout: "Reverted oddly\n", stderr: "" },
    { repositoryPath: "/repo/project", commitRef: "deadbeef", noCommit: false },
  );

  assert.equal(parsed.revertCompleted, true);
  assert.equal(parsed.operationHint, "Reverted oddly");
  assert.equal(parsed.commitHash, undefined);
});

test("git.revertCommit handler is mounted in registry and keeps old planner name", async () => {
  const registryLookup = createBaseToolRegistry().lookupHandler("git.revertCommit");
  assert.equal(registryLookup.ok, true);
  assert.equal(gitRevertCommitHandler.definition.toolId, "git.revertCommit");

  const oldPlanner = planGitCommitRevert({
    target: { repositoryPath: "/repo/project", commitRef: "deadbeef" },
  });
  assert.equal(oldPlanner.ok, true);

  if (!registryLookup.ok) return;
  const result = await registryLookup.handler.invoke({
    toolCallId: "revert-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: { target: { repositoryPath: "/repo/project", commitRef: "deadbeef" } },
    executor: {},
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitRevertCommitOutput;
    assert.deepEqual(output.gitArgs, ["revert", "deadbeef"]);
    assert.equal(output.providerCalled, false);
  }
});
