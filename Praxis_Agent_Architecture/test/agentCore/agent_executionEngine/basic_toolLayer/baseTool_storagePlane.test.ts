import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  baseToolStoragePlaneDescriptor,
  planBaseToolStorageWrite,
} from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.md",
  testFileUrl: import.meta.url,
});

test("planBaseToolStorageWrite plans dry-run storage for tool material, result, audit, and reuse records", () => {
  const result = planBaseToolStorageWrite({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    invocationId: " invoke-1 ",
    requestedScopes: ["tool:storage"],
    allowedScopes: ["tool:storage"],
    records: [
      {
        id: " record-1 ",
        kind: "audit-trace",
        toolName: "code.debugRun",
        payload: { status: "planned" },
        reuseKey: "debug-run:unit",
        tags: [" debug ", "audit", "debug"],
      },
    ],
  });

  assert.equal(baseToolStoragePlaneDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid storage request must be accepted");
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.invocationId, "invoke-1");
  assert.equal(result.plan.audit.dryRun, true);
  assert.equal(result.plan.audit.persisted, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.records[0]?.id, "record-1");
  assert.deepEqual(result.plan.records[0]?.tags, ["debug", "audit"]);
  assert.deepEqual(result.plan.reuseIndex["debug-run:unit"], ["record-1"]);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:storage"]);
});

test("planBaseToolStorageWrite rejects empty input and attempts to persist for real", () => {
  const empty = planBaseToolStorageWrite();
  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty input must be rejected");
  }
  assert.equal(empty.error.code, "MISSING_RUNTIME_ID");
  assert.equal(empty.error.boundary, "input");

  const realWrite = planBaseToolStorageWrite({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    dryRun: false,
    records: [
      {
        id: "record-1",
        kind: "result-state",
        toolName: "code.debugRun",
      },
    ],
  });
  assert.equal(realWrite.ok, false);
  if (realWrite.ok) {
    assert.fail("real storage must be rejected in the first round");
  }
  assert.equal(realWrite.error.code, "REAL_STORAGE_NOT_ALLOWED");
  assert.equal(realWrite.error.boundary, "governance");
});

test("planBaseToolStorageWrite classifies invalid records and scope denial", () => {
  const invalidRecord = planBaseToolStorageWrite({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    records: [
      {
        id: "record-1",
        toolName: "code.debugRun",
      },
    ],
  });
  assert.equal(invalidRecord.ok, false);
  if (invalidRecord.ok) {
    assert.fail("record without kind must be rejected");
  }
  assert.equal(invalidRecord.error.code, "MISSING_RECORD_KIND");

  const denied = planBaseToolStorageWrite({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    requestedScopes: ["tool:storage"],
    allowedScopes: [],
    records: [
      {
        id: "record-1",
        kind: "audit-trace",
        toolName: "code.debugRun",
      },
    ],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
