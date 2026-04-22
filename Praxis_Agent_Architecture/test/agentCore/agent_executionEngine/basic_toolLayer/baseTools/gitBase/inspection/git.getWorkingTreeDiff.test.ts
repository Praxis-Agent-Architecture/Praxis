import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkingTreeDiffDescriptor,
  planGetWorkingTreeDiff,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.md",
  testFileUrl: import.meta.url,
});

test("planGetWorkingTreeDiff creates a guarded dry-run diff plan", () => {
  const result = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: "./repo",
    mode: "combined",
    pathspecs: ["src/index.ts"],
    contextLines: 4,
    requestedScopes: ["tool:git:diff"],
    allowedScopes: ["tool:git:diff"],
  });

  assert.equal(getWorkingTreeDiffDescriptor.defaultDispatch, "dry-run");
  assert.equal(getWorkingTreeDiffDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected working tree diff dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.getWorkingTreeDiff");
  assert.equal(result.plan.mode, "combined");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldReadWorkingTree, true);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "repo",
    "diff",
    "--unified=4",
    "HEAD",
    "--",
    "src/index.ts",
  ]);
});

test("planGetWorkingTreeDiff rejects empty input, escaped pathspecs, denied scopes, and real execution", () => {
  const empty = planGetWorkingTreeDiff();

  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.error.code, "MISSING_RUNTIME_ID");
    assert.equal(empty.error.boundary, "input");
  }

  const escaped = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    pathspecs: ["../secret.txt"],
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "PATHSPEC_OUTSIDE_SCOPE");
    assert.equal(escaped.error.boundary, "scope");
  }

  const escapedRepository = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: "../repo",
  });

  assert.equal(escapedRepository.ok, false);
  if (!escapedRepository.ok) {
    assert.equal(escapedRepository.error.code, "REPOSITORY_PATH_OUTSIDE_SCOPE");
    assert.equal(escapedRepository.error.boundary, "scope");
  }

  const optionLikeRef = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    compareRef: "--output=/tmp/diff",
  });

  assert.equal(optionLikeRef.ok, false);
  if (!optionLikeRef.ok) {
    assert.equal(optionLikeRef.error.code, "INVALID_COMPARE_REF");
  }

  const denied = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    requestedScopes: ["tool:git:diff"],
    allowedScopes: ["tool:git:status"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const realExecution = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    dryRun: false,
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realExecution.error.boundary, "governance");
  }
});
