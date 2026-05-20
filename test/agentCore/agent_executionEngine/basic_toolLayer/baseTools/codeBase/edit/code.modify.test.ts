import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeModifyDescriptor,
  planCodeModify,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.modify.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.modify.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.modify.md",
  testFileUrl: import.meta.url,
});

test("planCodeModify creates a bounded dry-run patch plan", () => {
  const result = planCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    searchText: "const value = 1;",
    replacementText: "const value = 2;",
    occurrence: "all",
    maxReplacements: 3,
    requestedScopes: ["tool:code:edit"],
    allowedScopes: ["tool:code:edit"],
  });

  assert.equal(result.ok, true);
  assert.equal(codeModifyDescriptor.requiresTapApproval, true);
  assert.equal(result.plan.tool, "code.modify");
  assert.equal(result.plan.targetPath, "src/app.ts");
  assert.equal(result.plan.occurrence, "all");
  assert.equal(result.plan.maxReplacements, 3);
  assert.equal(result.plan.searchTextBytes, 16);
  assert.equal(result.plan.replacementTextBytes, 16);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planCodeModify rejects unbounded or unsafe modify requests", () => {
  const missingSearch = planCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    replacementText: "new",
  });
  assert.equal(missingSearch.ok, false);
  assert.equal(missingSearch.error.code, "MISSING_SEARCH_TEXT");
  assert.equal(missingSearch.error.boundary, "input");

  const invalidLimit = planCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    searchText: "old",
    replacementText: "new",
    maxReplacements: 0,
  });
  assert.equal(invalidLimit.ok, false);
  assert.equal(invalidLimit.error.code, "INVALID_REPLACEMENT_LIMIT");
  assert.equal(invalidLimit.error.boundary, "input");

  const realSideEffect = planCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/app.ts",
    searchText: "old",
    replacementText: "new",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
