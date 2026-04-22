import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeReadDescriptor,
  planCodeRead,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.md",
  testFileUrl: import.meta.url,
});

test("planCodeRead creates a governed dry-run read plan", async () => {
  const result = await planCodeRead({
    toolCallId: "read-1",
    targetPath: " src/index.ts ",
    range: { startLine: 1, endLine: 3 },
    requestedScopes: ["code.read"],
    allowedScopes: ["code.read"],
  });

  assert.equal(codeReadDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected read dry-run plan");
  }

  assert.equal(result.plan.targetPath, "src/index.ts");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.readsFileSystemDirectly, false);
  assert.equal(result.output, undefined);
  assert.equal(result.audit.unsafeSideEffects, false);
});

test("planCodeRead can use an injected reader envelope without direct fs access", async () => {
  const result = await planCodeRead({
    targetPath: "src/index.ts",
    dryRun: false,
    maxBytes: 32,
    reader: ({ targetPath }) => ({
      content: `read:${targetPath}`,
      encoding: "utf8",
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected read result");
  }

  assert.equal(result.plan.dispatch, "injected-reader");
  assert.equal(result.output?.content, "read:src/index.ts");
  assert.equal(result.output?.unsafeSideEffects, false);
});

test("planCodeRead rejects invalid ranges and missing injected readers", async () => {
  const invalidRange = await planCodeRead({
    targetPath: "src/index.ts",
    range: { startLine: 5, endLine: 4 },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_RANGE");
  }

  const noReader = await planCodeRead({
    targetPath: "src/index.ts",
    dryRun: false,
  });

  assert.equal(noReader.ok, false);
  if (!noReader.ok) {
    assert.equal(noReader.error.code, "READER_NOT_INJECTED");
    assert.equal(noReader.error.boundary, "execution");
  }
});
