import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeFormatDescriptor,
  planCodeFormat,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.format.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.format.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.format.md",
  testFileUrl: import.meta.url,
});

test("planCodeFormat creates a formatter dry-run plan without invoking a formatter", () => {
  const result = planCodeFormat({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    languageHint: "typescript",
    formatterId: "prettier",
    range: { startLine: 1, endLine: 12 },
    requestedScopes: ["tool:code:edit"],
    allowedScopes: ["tool:code:edit"],
  });

  assert.equal(result.ok, true);
  assert.equal(codeFormatDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.plan.tool, "code.format");
  assert.equal(result.plan.targetPath, "src/app.ts");
  assert.equal(result.plan.languageHint, "typescript");
  assert.equal(result.plan.formatterId, "prettier");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldFormat, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planCodeFormat rejects invalid scope, range, and real side effects", () => {
  const invalidRange = planCodeFormat({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    range: { startLine: 7, endLine: 2 },
  });
  assert.equal(invalidRange.ok, false);
  assert.equal(invalidRange.error.code, "INVALID_FORMAT_RANGE");
  assert.equal(invalidRange.error.boundary, "input");

  const denied = planCodeFormat({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    requestedScopes: ["tool:code:edit"],
    allowedScopes: ["tool:code:read"],
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const realSideEffect = planCodeFormat({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
