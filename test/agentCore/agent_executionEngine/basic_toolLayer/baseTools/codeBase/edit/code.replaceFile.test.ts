import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeReplaceFileDescriptor,
  planCodeReplaceFile,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.replaceFile.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.replaceFile.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.replaceFile.md",
  testFileUrl: import.meta.url,
});

test("planCodeReplaceFile creates an audited dry-run replacement plan", () => {
  const result = planCodeReplaceFile({
    toolCallId: "replace-1",
    targetPath: " src/index.ts ",
    newContent: "export const value = 1;\n",
    requestedScopes: ["code.write"],
    allowedScopes: ["code.write"],
    expectedCurrentHash: "abc123",
  });

  assert.equal(codeReplaceFileDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected replaceFile dry-run plan");
  }

  assert.equal(result.plan.targetPath, "src/index.ts");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.writesFileSystem, false);
  assert.equal(result.audit.toolCallId, "replace-1");
  assert.equal(result.audit.approvalRequired, true);
  assert.equal(result.audit.unsafeSideEffects, false);
});

test("planCodeReplaceFile rejects unsafe paths and non-dry-run wiring without approval", () => {
  const outside = planCodeReplaceFile({
    targetPath: "../secret.ts",
    newContent: "secret",
  });

  assert.equal(outside.ok, false);
  if (!outside.ok) {
    assert.equal(outside.error.code, "TARGET_PATH_OUTSIDE_SCOPE");
    assert.equal(outside.error.boundary, "scope");
  }

  const unapproved = planCodeReplaceFile({
    targetPath: "src/index.ts",
    newContent: "value",
    dryRun: false,
  });

  assert.equal(unapproved.ok, false);
  if (!unapproved.ok) {
    assert.equal(unapproved.error.code, "APPROVAL_REQUIRED");
    assert.equal(unapproved.error.boundary, "approval");
  }
});
