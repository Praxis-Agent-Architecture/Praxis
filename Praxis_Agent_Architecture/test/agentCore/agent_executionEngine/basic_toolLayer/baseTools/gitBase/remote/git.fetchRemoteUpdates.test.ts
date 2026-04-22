import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchRemoteUpdatesDescriptor,
  planFetchRemoteUpdates,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.md",
  testFileUrl: import.meta.url,
});

test("planFetchRemoteUpdates creates a guarded dry-run fetch plan", () => {
  const result = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "origin",
    refspecs: ["main"],
    prune: true,
    tagsMode: "no-tags",
    requestedScopes: ["tool:git:remote"],
    allowedScopes: ["tool:git:remote"],
  });

  assert.equal(fetchRemoteUpdatesDescriptor.defaultDispatch, "dry-run");
  assert.equal(fetchRemoteUpdatesDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected fetch remote updates dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.fetchRemoteUpdates");
  assert.equal(result.plan.networkAccessBlocked, true);
  assert.equal(result.plan.wouldUpdateRemoteTrackingRefs, false);
  assert.deepEqual(result.plan.requiredPermissions, [
    "git:remote:read",
    "git:remote:write:dry-run",
    "network:egress:dry-run",
  ]);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "repo",
    "fetch",
    "--dry-run",
    "--prune",
    "--no-tags",
    "origin",
    "main",
  ]);
});

test("planFetchRemoteUpdates rejects unsafe remote input, denied scopes, and real network execution", () => {
  const unsafeRemote = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "origin main",
  });

  assert.equal(unsafeRemote.ok, false);
  if (!unsafeRemote.ok) {
    assert.equal(unsafeRemote.error.code, "INVALID_REMOTE");
    assert.equal(unsafeRemote.error.boundary, "input");
  }

  const escapedRepository = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "/tmp/repo",
    remote: "origin",
  });

  assert.equal(escapedRepository.ok, false);
  if (!escapedRepository.ok) {
    assert.equal(escapedRepository.error.code, "REPOSITORY_PATH_OUTSIDE_SCOPE");
    assert.equal(escapedRepository.error.boundary, "scope");
  }

  const optionLikeRemote = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "--upload-pack=/tmp/fake",
  });

  assert.equal(optionLikeRemote.ok, false);
  if (!optionLikeRemote.ok) {
    assert.equal(optionLikeRemote.error.code, "INVALID_REMOTE");
  }

  const unsafeRefspec = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "origin",
    refspecs: ["main dev"],
  });

  assert.equal(unsafeRefspec.ok, false);
  if (!unsafeRefspec.ok) {
    assert.equal(unsafeRefspec.error.code, "INVALID_REFSPEC");
  }

  const denied = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "origin",
    requestedScopes: ["tool:git:remote"],
    allowedScopes: ["tool:git:diff"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const realExecution = planFetchRemoteUpdates({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    remote: "origin",
    dryRun: false,
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realExecution.error.boundary, "governance");
  }
});
