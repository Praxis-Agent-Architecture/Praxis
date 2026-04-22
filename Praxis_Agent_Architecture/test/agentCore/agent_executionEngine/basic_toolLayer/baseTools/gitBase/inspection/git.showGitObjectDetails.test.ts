import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planShowGitObjectDetails,
  showGitObjectDetailsDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.md",
  testFileUrl: import.meta.url,
});

test("planShowGitObjectDetails creates a guarded dry-run object inspection plan", () => {
  const result = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    objectRef: "HEAD",
    format: "raw",
    requestedScopes: ["tool:git:object"],
    allowedScopes: ["tool:git:object"],
  });

  assert.equal(showGitObjectDetailsDescriptor.defaultDispatch, "dry-run");
  assert.equal(showGitObjectDetailsDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected show git object details dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.showGitObjectDetails");
  assert.equal(result.plan.format, "raw");
  assert.equal(result.plan.maxBytes, showGitObjectDetailsDescriptor.defaultMaxBytes);
  assert.deepEqual(result.plan.requiredPermissions, ["git:object:read"]);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "repo",
    "show",
    "--no-ext-diff",
    "--no-patch",
    "--pretty=raw",
    "HEAD",
  ]);
});

test("planShowGitObjectDetails rejects missing refs, unsafe refs, denied scopes, and real execution", () => {
  const missingRef = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_OBJECT_REF");
  }

  const unsafeRef = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    objectRef: "HEAD bad",
  });

  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "INVALID_OBJECT_REF");
    assert.equal(unsafeRef.error.boundary, "input");
  }

  const escapedRepository = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "/tmp/repo",
    objectRef: "HEAD",
  });

  assert.equal(escapedRepository.ok, false);
  if (!escapedRepository.ok) {
    assert.equal(escapedRepository.error.code, "REPOSITORY_PATH_OUTSIDE_SCOPE");
    assert.equal(escapedRepository.error.boundary, "scope");
  }

  const optionLikeRef = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    objectRef: "--help",
  });

  assert.equal(optionLikeRef.ok, false);
  if (!optionLikeRef.ok) {
    assert.equal(optionLikeRef.error.code, "INVALID_OBJECT_REF");
  }

  const denied = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    objectRef: "HEAD",
    requestedScopes: ["tool:git:object"],
    allowedScopes: ["tool:git:diff"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const realExecution = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    objectRef: "HEAD",
    dryRun: false,
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realExecution.error.boundary, "governance");
  }
});
