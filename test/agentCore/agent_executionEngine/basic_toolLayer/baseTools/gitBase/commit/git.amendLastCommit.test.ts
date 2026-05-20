import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitAmendLastCommit,
  gitAmendLastCommitDescriptor,
  gitAmendLastCommitHandler,
  parseGitAmendLastCommitResult,
  planGitLastCommitAmend,
  type GitAmendLastCommitOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/commit/git.amendLastCommit.md",
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

test("planGitLastCommitAmend creates a fixed dry-run amend envelope without provider dispatch", () => {
  const result = planGitLastCommitAmend({
    target: {
      repositoryPath: "/repo/project",
      commitMessage: " Refine agentCore git primitive ",
      includeAllTracked: true,
      resetAuthor: true,
    },
    context: {
      invocationId: "amend-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitAmendLastCommitDescriptor.unsafeSideEffects, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.amendLastCommit");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.commitMessage, "Refine agentCore git primitive");
  assert.deepEqual(result.output.gitArgs, [
    "commit",
    "--amend",
    "--all",
    "--reset-author",
    "-m",
    "Refine agentCore git primitive",
  ]);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.output.risk.rewritesHistory, true);
  assert.equal(result.output.risk.amendsCommit, true);
  assert.equal(result.output.risk.mutatesRepository, true);
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "amend-1");
});

test("git.amendLastCommit supports no-edit and rejects malformed input without raw TypeError", async () => {
  const noEdit = planGitLastCommitAmend({
    target: { repositoryPath: "/repo/project", noEdit: true },
  });
  assert.equal(noEdit.ok, true);
  if (noEdit.ok) {
    assert.deepEqual(noEdit.output.gitArgs, ["commit", "--amend", "--no-edit"]);
  }

  const malformed = await executeGitAmendLastCommit(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", noEdit: true },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const missingRepository = await executeGitAmendLastCommit({
    target: { commitMessage: "Ship it" },
    context: governedContext(),
  });
  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
  }

  const missingMessage = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project" },
    context: governedContext(),
  });
  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_REQUIRED_FIELD");
  }

  const nulMessage = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "bad\0message" },
    context: governedContext(),
  });
  assert.equal(nulMessage.ok, false);
  if (!nulMessage.ok) {
    assert.equal(nulMessage.error.code, "INVALID_ARGUMENT");
  }
});

test("git.amendLastCommit enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitAmendLastCommit({
    target: { repositoryPath: "/tmp/project", noEdit: true },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", noEdit: true },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", noEdit: true },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", noEdit: true },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.amendLastCommit calls runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "[main def5678] Refined\n 2 files changed, 3 insertions(+), 1 deletion(-)\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", commitMessage: "Refined", includeAllTracked: true, resetAuthor: true },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:commit --amend --all --reset-author -m Refined"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.branchName, "main");
  assert.equal(result.output.resultEnvelope.commitHash, "def5678");
  assert.equal(result.output.resultEnvelope.subject, "Refined");
  assert.equal(result.output.resultEnvelope.filesChanged, 2);
  assert.equal(result.output.resultEnvelope.commitAmended, true);
});

test("git.amendLastCommit provider failures remain public-safe", async () => {
  const result = await executeGitAmendLastCommit({
    target: { repositoryPath: "/repo/project", noEdit: true },
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

test("git.amendLastCommit parser keeps safe fallback fields for malformed output", () => {
  const parsed = parseGitAmendLastCommitResult(
    { exitCode: 0, stdout: "Amended commit but odd output\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      commitMessage: "Refined",
      noEdit: false,
      includeAllTracked: false,
      resetAuthor: false,
    },
  );

  assert.equal(parsed.commitAmended, true);
  assert.equal(parsed.operationHint, "Amended commit but odd output");
  assert.equal(parsed.commitHash, undefined);
});

test("git.amendLastCommit handler is mounted in registry and keeps old planner name", async () => {
  const registryLookup = createBaseToolRegistry().lookupHandler("git.amendLastCommit");
  assert.equal(registryLookup.ok, true);
  assert.equal(gitAmendLastCommitHandler.definition.toolId, "git.amendLastCommit");

  const oldPlanner = planGitLastCommitAmend({
    target: { repositoryPath: "/repo/project", noEdit: true },
  });
  assert.equal(oldPlanner.ok, true);

  if (!registryLookup.ok) return;
  const result = await registryLookup.handler.invoke({
    toolCallId: "amend-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: { target: { repositoryPath: "/repo/project", noEdit: true } },
    executor: {},
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitAmendLastCommitOutput;
    assert.equal(output.providerCalled, false);
    assert.deepEqual(output.gitArgs, ["commit", "--amend", "--no-edit"]);
  }
});
