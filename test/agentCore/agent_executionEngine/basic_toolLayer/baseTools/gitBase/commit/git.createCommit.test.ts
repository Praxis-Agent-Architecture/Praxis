import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitCreateCommit,
  gitCreateCommitDescriptor,
  gitCreateCommitHandler,
  parseGitCreateCommitResult,
  planGitCommitCreation,
  type GitCreateCommitOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.createCommit.md",
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

test("planGitCommitCreation creates a fixed dry-run commit envelope without provider dispatch", () => {
  const result = planGitCommitCreation({
    target: {
      repositoryPath: "/repo/project",
      commitMessage: " Add agentCore git primitive ",
      includeAllTracked: true,
      allowEmpty: true,
      signoff: true,
    },
    context: {
      invocationId: "commit-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitCreateCommitDescriptor.unsafeSideEffects, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.createCommit");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.commitMessage, "Add agentCore git primitive");
  assert.deepEqual(result.output.gitArgs, [
    "commit",
    "--all",
    "--allow-empty",
    "--signoff",
    "-m",
    "Add agentCore git primitive",
  ]);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.output.risk.mutatesRepository, true);
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "commit-1");
});

test("git.createCommit rejects malformed input and bad message without raw TypeError", async () => {
  const malformed = await executeGitCreateCommit(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const missingRepository = await executeGitCreateCommit({
    target: { commitMessage: "Ship it" },
    context: governedContext(),
  });
  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
  }

  const missingMessage = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "  " },
    context: governedContext(),
  });
  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_REQUIRED_FIELD");
  }

  const nulMessage = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "bad\0message" },
    context: governedContext(),
  });
  assert.equal(nulMessage.ok, false);
  if (!nulMessage.ok) {
    assert.equal(nulMessage.error.code, "INVALID_ARGUMENT");
  }
});

test("git.createCommit enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitCreateCommit({
    target: { repositoryPath: "/tmp/project", commitMessage: "Ship it" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.createCommit calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "[main abc1234] Ship it\n 1 file changed, 1 insertion(+)\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it", includeAllTracked: true, signoff: true },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:commit --all --signoff -m Ship it"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.branchName, "main");
  assert.equal(result.output.resultEnvelope.commitHash, "abc1234");
  assert.equal(result.output.resultEnvelope.subject, "Ship it");
  assert.equal(result.output.resultEnvelope.filesChanged, 1);
  assert.equal(result.output.resultEnvelope.commitCreated, true);
});

test("git.createCommit provider failures remain public-safe", async () => {
  const result = await executeGitCreateCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Ship it" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/index.lock failed with private detail");
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

test("git.createCommit parser keeps safe fallback fields for malformed output", () => {
  const parsed = parseGitCreateCommitResult(
    { exitCode: 0, stdout: "Created commit but odd output\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      commitMessage: "Ship it",
      includeAllTracked: false,
      allowEmpty: false,
      signoff: false,
    },
  );

  assert.equal(parsed.commitCreated, true);
  assert.equal(parsed.operationHint, "Created commit but odd output");
  assert.equal(parsed.commitHash, undefined);
});

test("git.createCommit handler is mounted in registry and keeps old planner name", async () => {
  const registryLookup = createBaseToolRegistry().lookupHandler("git.createCommit");
  assert.equal(registryLookup.ok, true);
  assert.equal(gitCreateCommitHandler.definition.toolId, "git.createCommit");

  if (!registryLookup.ok) return;
  const result = await registryLookup.handler.invoke({
    toolCallId: "commit-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: { target: { repositoryPath: "/repo/project", commitMessage: "Ship it" } },
    executor: {},
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitCreateCommitOutput;
    assert.equal(output.providerCalled, false);
    assert.deepEqual(output.gitArgs, ["commit", "-m", "Ship it"]);
  }
});
