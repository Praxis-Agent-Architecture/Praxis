import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeOverwriteDescriptor,
  planCodeOverwrite,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.overwrite.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.overwrite.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.overwrite.md",
  testFileUrl: import.meta.url,
});

test("planCodeOverwrite creates a size-audited dry-run overwrite plan", () => {
  const result = planCodeOverwrite({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    content: "export const value = 1;\n",
    expectedExistingHash: "sha256:old",
    maxBytes: 128,
    requestedScopes: ["tool:code:edit"],
    allowedScopes: ["tool:code:edit"],
  });

  assert.equal(result.ok, true);
  assert.equal(codeOverwriteDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "code.overwrite");
  assert.equal(result.plan.targetPath, "src/app.ts");
  assert.equal(result.plan.contentBytes, 24);
  assert.equal(result.plan.expectedExistingHash, "sha256:old");
  assert.equal(result.plan.maxBytes, 128);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldOverwrite, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planCodeOverwrite rejects missing content, oversized writes, and real side effects", () => {
  const missingContent = planCodeOverwrite({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
  });
  assert.equal(missingContent.ok, false);
  assert.equal(missingContent.error.code, "MISSING_CONTENT");
  assert.equal(missingContent.error.boundary, "input");

  const tooLarge = planCodeOverwrite({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    content: "abcdef",
    maxBytes: 5,
  });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.error.code, "CONTENT_TOO_LARGE");
  assert.equal(tooLarge.error.boundary, "resource");

  const realSideEffect = planCodeOverwrite({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    content: "safe",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
