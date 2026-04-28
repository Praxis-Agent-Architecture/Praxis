import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitCheckoutTarget,
  gitCheckoutTargetHandler,
  parseGitCheckoutTargetResult,
  planGitTargetCheckout,
  type GitCheckoutTargetOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.checkoutTarget.md",
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

test("planGitTargetCheckout creates a fixed dry-run checkout envelope without provider dispatch", () => {
  const result = planGitTargetCheckout({
    target: { repositoryPath: "/repo/project", targetRef: " origin/main ", newBranchName: "work/main" },
    context: {
      invocationId: "checkout-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.checkoutTarget");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.targetRef, "origin/main");
  assert.deepEqual(result.output.gitArgs, ["checkout", "-b", "work/main", "origin/main"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "checkout",
    "-b",
    "work/main",
    "origin/main",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "checkout-1");
});

test("git.checkoutTarget rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitCheckoutTarget(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const unsafeRef = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "--upload-pack=bad" },
    context: governedContext(),
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "UNSAFE_REF");
  }

  const unsafeBranch = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "origin/main", newBranchName: "bad branch" },
    context: governedContext(),
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) {
    assert.equal(unsafeBranch.error.code, "UNSAFE_REF");
  }
});

test("git.checkoutTarget enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitCheckoutTarget({
    target: { repositoryPath: "/tmp/project", targetRef: "main" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: { ...governedContext(), grantedPermissions: ["git:read"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.checkoutTarget calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "Switched to a new branch 'work/main'\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "origin/main", newBranchName: "work/main" },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:checkout -b work/main origin/main"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.createdBranch, true);
  assert.equal(result.output.resultEnvelope.checkoutHint, "Switched to a new branch 'work/main'");
});

test("git.checkoutTarget provider failures remain public-safe", async () => {
  const result = await executeGitCheckoutTarget({
    target: { repositoryPath: "/repo/project", targetRef: "main" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/HEAD failed with private detail");
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

test("git.checkoutTarget parser handles dry-run and provider output", () => {
  const dryRun = parseGitCheckoutTargetResult(undefined, {
    repositoryPath: "/repo/project",
    targetRef: "HEAD",
    detach: true,
    force: false,
  });
  assert.equal(dryRun.stdoutLineCount, 0);
  assert.equal(dryRun.checkoutHint, undefined);

  const parsed = parseGitCheckoutTargetResult(
    { exitCode: 0, stdout: "", stderr: "HEAD is now at abc123 initial\n" },
    {
      repositoryPath: "/repo/project",
      targetRef: "HEAD",
      detach: true,
      force: false,
    },
  );
  assert.equal(parsed.checkoutHint, "HEAD is now at abc123 initial");
  assert.equal(parsed.detach, true);
});

test("git.checkoutTarget registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.checkoutTarget");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;
  assert.equal(lookup.handler.definition.toolId, "git.checkoutTarget");

  const result = await lookup.handler.invoke({
    toolCallId: "checkout-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", targetRef: "main" },
      context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitCheckoutTargetOutput;
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.providerCalled, false);
  }

  assert.equal(gitCheckoutTargetHandler.definition.toolId, "git.checkoutTarget");
});
