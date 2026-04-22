import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planTraceLineOwnership,
  traceLineOwnershipDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.md",
  testFileUrl: import.meta.url,
});

test("planTraceLineOwnership creates a guarded dry-run blame plan", () => {
  const result = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "src/index.ts",
    range: { startLine: 3, endLine: 8 },
    revision: "HEAD",
    requestedScopes: ["tool:git:blame"],
    allowedScopes: ["tool:git:blame"],
  });

  assert.equal(traceLineOwnershipDescriptor.defaultDispatch, "dry-run");
  assert.equal(traceLineOwnershipDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected trace line ownership dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.traceLineOwnership");
  assert.equal(result.plan.filePath, "src/index.ts");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldReadBlameMetadata, true);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "repo",
    "blame",
    "--line-porcelain",
    "-L",
    "3,8",
    "HEAD",
    "--",
    "src/index.ts",
  ]);
});

test("planTraceLineOwnership rejects invalid file/range input, denied scopes, and real execution", () => {
  const missingRange = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "src/index.ts",
  });

  assert.equal(missingRange.ok, false);
  if (!missingRange.ok) {
    assert.equal(missingRange.error.code, "INVALID_LINE_RANGE");
    assert.equal(missingRange.error.boundary, "input");
  }

  const escapedFile = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "../index.ts",
    range: { startLine: 1, endLine: 1 },
  });

  assert.equal(escapedFile.ok, false);
  if (!escapedFile.ok) {
    assert.equal(escapedFile.error.code, "FILE_PATH_OUTSIDE_SCOPE");
    assert.equal(escapedFile.error.boundary, "scope");
  }

  const escapedRepository = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "../repo",
    filePath: "src/index.ts",
    range: { startLine: 1, endLine: 1 },
  });

  assert.equal(escapedRepository.ok, false);
  if (!escapedRepository.ok) {
    assert.equal(escapedRepository.error.code, "REPOSITORY_PATH_OUTSIDE_SCOPE");
    assert.equal(escapedRepository.error.boundary, "scope");
  }

  const optionLikeRevision = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "src/index.ts",
    range: { startLine: 1, endLine: 1 },
    revision: "--contents=/tmp/file",
  });

  assert.equal(optionLikeRevision.ok, false);
  if (!optionLikeRevision.ok) {
    assert.equal(optionLikeRevision.error.code, "INVALID_REVISION");
  }

  const denied = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "src/index.ts",
    range: { startLine: 1, endLine: 1 },
    requestedScopes: ["tool:git:blame"],
    allowedScopes: ["tool:git:diff"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const realExecution = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "repo",
    filePath: "src/index.ts",
    range: { startLine: 1, endLine: 1 },
    dryRun: false,
  });

  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realExecution.error.boundary, "governance");
  }
});
