import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  locateProblemCommitDescriptor,
  planLocateProblemCommit,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.md",
  testFileUrl: import.meta.url,
});

test("planLocateProblemCommit creates a dry-run bisect plan", () => {
  const result = planLocateProblemCommit({
    runtimeId: "runtime-1",
    repositoryPath: "./repo",
    knownGoodRef: "v1.0.0",
    knownBadRef: "HEAD",
    verificationCommand: "npm test",
    maxSteps: 32,
    requestedScopes: ["tool:git:history"],
    allowedScopes: ["tool:git:history"],
  });

  assert.equal(locateProblemCommitDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected locate problem commit dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.locateProblemCommit");
  assert.equal(result.plan.repositoryPath, "repo");
  assert.equal(result.plan.strategy, "bisect-plan");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldRunGitBisect, false);
  assert.equal(result.plan.wouldExecuteVerificationCommand, false);
  assert.deepEqual(result.plan.requiredPermissions, [
    "git:history:read",
    "git:bisect:dry-run",
    "shell:execute:dry-run",
  ]);
});

test("planLocateProblemCommit rejects unsafe refs, escaped paths, and real bisect", () => {
  const escaped = planLocateProblemCommit({
    runtimeId: "runtime-1",
    repositoryPath: "../repo",
    knownGoodRef: "main",
    knownBadRef: "HEAD",
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "REPOSITORY_PATH_OUTSIDE_SCOPE");
    assert.equal(escaped.error.boundary, "scope");
  }

  const sameRefs = planLocateProblemCommit({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    knownGoodRef: "HEAD",
    knownBadRef: "HEAD",
  });

  assert.equal(sameRefs.ok, false);
  if (!sameRefs.ok) {
    assert.equal(sameRefs.error.code, "REFS_MUST_DIFFER");
    assert.equal(sameRefs.error.boundary, "input");
  }

  const realBisect = planLocateProblemCommit({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    knownGoodRef: "main",
    knownBadRef: "HEAD",
    dryRun: false,
  });

  assert.equal(realBisect.ok, false);
  if (!realBisect.ok) {
    assert.equal(realBisect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realBisect.error.boundary, "governance");
  }
});
