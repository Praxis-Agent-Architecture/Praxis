import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitCherryPickCommit,
  gitCherryPickCommitDescriptor,
  gitCherryPickCommitHandler,
  parseGitCherryPickCommitResult,
  planGitCommitCherryPick,
  type GitCherryPickCommitOutput,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.cherryPickCommit.md",
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

test("planGitCommitCherryPick creates a fixed dry-run cherry-pick envelope without provider dispatch", () => {
  const result = planGitCommitCherryPick({
    target: {
      repositoryPath: "/repo/project",
      commitRef: "abc123",
      noCommit: true,
      mainlineParent: 1,
      signoff: true,
    },
    context: {
      invocationId: "cherry-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitCherryPickCommitDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.deepEqual(result.output.gitArgs, ["cherry-pick", "--no-commit", "--signoff", "--mainline", "1", "abc123"]);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.output.risk.appliesCommit, true);
  assert.equal(result.output.risk.mayCreateCommit, false);
  assert.equal(result.output.risk.mayCreateConflicts, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "cherry-1");
});

test("git.cherryPickCommit rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitCherryPickCommit(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.doesNotMatch(malformed.error.message, /TypeError/u);

  const malformedContext = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const missingRepository = await executeGitCherryPickCommit({
    target: { commitRef: "abc123" },
    context: governedContext(),
  });
  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");

  const missingRef = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project" },
    context: governedContext(),
  });
  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) assert.equal(missingRef.error.code, "MISSING_TARGET_REF");

  const unsafeRef = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "--upload-pack=bad" },
    context: governedContext(),
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) assert.equal(unsafeRef.error.code, "INVALID_ARGUMENT");
});

test("git.cherryPickCommit enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitCherryPickCommit({
    target: { repositoryPath: "/tmp/project", commitRef: "abc123" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const missingPermission = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const missingGuard = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.cherryPickCommit calls runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "[main cafe123] Pick feature\n 1 file changed, 2 insertions(+)\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123", signoff: true },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:cherry-pick --signoff abc123"]);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.resultEnvelope.branchName, "main");
  assert.equal(result.output.resultEnvelope.commitHash, "cafe123");
  assert.equal(result.output.resultEnvelope.subject, "Pick feature");
  assert.equal(result.output.resultEnvelope.filesChanged, 1);
  assert.equal(result.output.resultEnvelope.cherryPickCompleted, true);
});

test("git.cherryPickCommit provider failures remain public-safe", async () => {
  const result = await executeGitCherryPickCommit({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/CHERRY_PICK_HEAD failed");
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

test("git.cherryPickCommit parser keeps safe fallback fields for malformed output", () => {
  const parsed = parseGitCherryPickCommitResult(
    { exitCode: 0, stdout: "Applied oddly\n", stderr: "" },
    { repositoryPath: "/repo/project", commitRef: "abc123", noCommit: false, signoff: false },
  );

  assert.equal(parsed.cherryPickCompleted, true);
  assert.equal(parsed.operationHint, "Applied oddly");
  assert.equal(parsed.commitHash, undefined);
});

test("git.cherryPickCommit handler is mounted in registry and keeps old planner name", async () => {
  const registryLookup = createBaseToolRegistry().lookupHandler("git.cherryPickCommit");
  assert.equal(registryLookup.ok, true);
  assert.equal(gitCherryPickCommitHandler.definition.toolId, "git.cherryPickCommit");

  const oldPlanner = planGitCommitCherryPick({
    target: { repositoryPath: "/repo/project", commitRef: "abc123" },
  });
  assert.equal(oldPlanner.ok, true);

  if (!registryLookup.ok) return;
  const result = await registryLookup.handler.invoke({
    toolCallId: "cherry-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: { target: { repositoryPath: "/repo/project", commitRef: "abc123" } },
    executor: {},
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitCherryPickCommitOutput;
    assert.deepEqual(output.gitArgs, ["cherry-pick", "abc123"]);
    assert.equal(output.providerCalled, false);
  }
});
