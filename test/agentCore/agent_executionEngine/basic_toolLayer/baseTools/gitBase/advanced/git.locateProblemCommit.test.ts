import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitLocateProblemCommit,
  locateProblemCommitDescriptor,
  parseGitLocateProblemCommitResult,
  planGitLocateProblemCommit,
  planLocateProblemCommit,
  type GitLocateProblemCommitContext,
  type GitLocateProblemCommitOutput,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "filesystem:read"],
} satisfies GitLocateProblemCommitContext;

test("planLocateProblemCommit creates a dry-run fixed rev-list plan without provider calls", () => {
  let providerCalled = false;
  const result = planLocateProblemCommit({
    target: {
      repositoryPath: "/repo/project",
      knownGoodRef: "v1.0.0",
      knownBadRef: "HEAD",
      verificationCommand: "npm test",
      maxSteps: 32,
    },
    context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(locateProblemCommitDescriptor.unsafeSideEffects, false);
  assert.equal(providerCalled, false);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected locate problem commit dry-run plan");
  assert.equal(result.plan.toolKind, "git.locateProblemCommit");
  assert.equal(result.plan.strategy, "rev-list-bisect-candidate-read");
  assert.deepEqual(result.plan.gitArgs, ["rev-list", "--bisect-all", "v1.0.0..HEAD"]);
  assert.equal(result.plan.wouldRunGitBisect, false);
  assert.equal(result.plan.wouldExecuteVerificationCommand, false);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.verificationCommandExecuted, false);
  assert.deepEqual(result.output.permissionsRequired, ["git:read", "filesystem:read"]);
});

test("planGitLocateProblemCommit keeps the legacy planner name compatible", () => {
  const result = planGitLocateProblemCommit({
    repositoryPath: "/repo/project",
    knownGoodRef: "main~1",
    knownBadRef: "HEAD",
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected alias planner to work");
  assert.deepEqual(result.plan.gitArgs, ["rev-list", "--bisect-all", "main~1..HEAD"]);
});

test("executeGitLocateProblemCommit rejects malformed input without raw TypeError", async () => {
  const malformed = await executeGitLocateProblemCommit({ context: "bad" as never });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_CONTEXT");
    assert.equal(malformed.error.internalDetailExposed, false);
    assert.doesNotMatch(malformed.error.message, /TypeError|undefined/u);
  }

  const missingRef = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main" },
  });
  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) assert.equal(missingRef.error.code, "MISSING_KNOWN_BAD_REF");

  const unsafeRef = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "--all", knownBadRef: "HEAD" },
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) assert.equal(unsafeRef.error.code, "INVALID_ARGUMENT");

  const sameRefs = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "HEAD", knownBadRef: "HEAD" },
  });
  assert.equal(sameRefs.ok, false);
  if (!sameRefs.ok) assert.equal(sameRefs.error.code, "REFS_MUST_DIFFER");

  const badCommand = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD", verificationCommand: "npm\0test" },
  });
  assert.equal(badCommand.ok, false);
  if (!badCommand.ok) assert.equal(badCommand.error.code, "INVALID_ARGUMENT");

  const badSteps = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD", maxSteps: 0 },
  });
  assert.equal(badSteps.ok, false);
  if (!badSteps.ok) assert.equal(badSteps.error.code, "INVALID_MAX_STEPS");
});

test("executeGitLocateProblemCommit enforces scope, permissions, governance, and provider availability", async () => {
  const scope = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/outside/project", knownGoodRef: "main", knownBadRef: "HEAD" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD" },
    context: { ...governedContext, grantedPermissions: ["git:read"] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const governance = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD" },
    context: { ...governedContext, guard: {} },
  });
  assert.equal(governance.ok, false);
  if (!governance.ok) assert.equal(governance.error.code, "GOVERNANCE_REJECTED");

  const unavailable = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD" },
    context: governedContext,
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitLocateProblemCommit calls runtime git provider with exact argv and parses candidates", async () => {
  const calls: string[] = [];
  const result = await executeGitLocateProblemCommit({
    target: {
      repositoryPath: "/repo/project",
      knownGoodRef: "v1.0.0",
      knownBadRef: "HEAD",
      verificationCommand: "npm test",
      maxSteps: 8,
    },
    context: governedContext,
    provider: (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "abcdef1234567890 (dist=1)\n1111111111111111 (dist=2)\n",
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:rev-list --bisect-all v1.0.0..HEAD"]);
  if (!result.ok) assert.fail("expected provider-backed locate result");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.verificationCommandExecuted, false);
  assert.equal(result.output.resultEnvelope.bestCandidate, "abcdef1234567890");
  assert.equal(result.output.resultEnvelope.candidateCount, 2);
  assert.equal(result.output.resultEnvelope.verificationCommandExecuted, false);
});

test("executeGitLocateProblemCommit maps provider failures to public-safe errors", async () => {
  const result = await executeGitLocateProblemCommit({
    target: { repositoryPath: "/repo/project", knownGoodRef: "main", knownBadRef: "HEAD" },
    context: governedContext,
    provider: () => {
      throw new Error("secret /home/proview/private repo command failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /private|\/home\/proview/u);
  }
});

test("parseGitLocateProblemCommitResult keeps malformed candidate lines as safe fallback", () => {
  const envelope = parseGitLocateProblemCommitResult(
    { exitCode: 0, stdout: "not-a-commit\nabcdef1234567890 (dist=3)\n", stderr: "" },
    { repositoryPath: "/repo/project", knownGoodRef: "main~2", knownBadRef: "HEAD", maxSteps: 64 },
  );

  assert.equal(envelope.candidateCount, 2);
  assert.equal(envelope.candidates[0]?.raw, "not-a-commit");
  assert.equal(envelope.candidates[1]?.commit, "abcdef1234567890");
  assert.equal(envelope.candidates[1]?.distance, 3);
});

test("registry handler invokes git.locateProblemCommit through BaseToolExecutorPort.git.runGit", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("git.locateProblemCommit");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) assert.fail("expected git.locateProblemCommit handler");

  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "abcdef1234567890 (dist=1)\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { repositoryPath: "/repo/project", knownGoodRef: "main~3", knownBadRef: "HEAD" },
      context: governedContext,
    },
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:rev-list --bisect-all main~3..HEAD"]);
  if (!result.ok) assert.fail("expected handler result");
  const output = result.output as GitLocateProblemCommitOutput;
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(output.resultEnvelope.bestCandidate, "abcdef1234567890");
});
