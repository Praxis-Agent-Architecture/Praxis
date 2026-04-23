import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  basicToolStorageLogicDescriptor,
  planBaseToolStorageWrite,
  planBasicToolStorageOperation,
  type BasicToolStorageRecord,
} from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/storageLogic.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/storageLogic.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/storageLogic.md",
  testFileUrl: import.meta.url,
});

test("planBasicToolStorageOperation creates an isolated dry-run put plan", () => {
  const result = planBasicToolStorageOperation({
    operation: "put",
    scope: { runtimeId: " runtime-1 ", sessionId: " session-1 ", tenantId: " tenant-a " },
    key: " tool-output-1 ",
    material: { stdout: "ok" },
    nowMs: 100,
    ttlMs: 50,
    reusable: true,
    metadata: { source: "shell.commandExecution" },
  });

  assert.equal(result.ok, true);
  assert.equal(basicToolStorageLogicDescriptor.defaultDryRun, true);
  if (!result.ok) {
    assert.fail("storage put planning should succeed");
  }

  assert.equal(result.plan.kind, "agentCore.basicTool.storagePlan");
  assert.equal(result.plan.operation, "put");
  assert.equal(result.plan.key, "tool-output-1");
  assert.equal(result.plan.scope.runtimeId, "runtime-1");
  assert.equal(result.plan.scope.sessionId, "session-1");
  assert.equal(result.plan.scope.tenantId, "tenant-a");
  assert.equal(result.plan.record?.expiresAtMs, 150);
  assert.equal(result.plan.reusable, true);
  assert.equal(result.plan.wouldMutateStorage, true);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planBaseToolStorageWrite plans base tool records for the storage pool", () => {
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

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected base tool storage write plan");
  }

  assert.equal(result.plan.kind, "agentCore.basicTool.storageLogic.writePlan");
  assert.equal(result.plan.pool, "storagePool.baseToolStorage");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.invocationId, "invoke-1");
  assert.equal(result.plan.logic.persisted, false);
  assert.equal(result.plan.logic.isolation, "runtime-session");
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.records[0]?.id, "record-1");
  assert.deepEqual(result.plan.records[0]?.tags, ["debug", "audit"]);
  assert.deepEqual(result.plan.reuseIndex["debug-run:unit"], ["record-1"]);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:storage"]);
});

test("planBasicToolStorageOperation reuses non-expired records inside the same isolation scope", () => {
  const existingRecord: BasicToolStorageRecord = {
    key: "tool-output-1",
    material: { stdout: "ok" },
    scope: { runtimeId: "runtime-1", sessionId: "session-1", tenantId: "tenant-a" },
    createdAtMs: 100,
    expiresAtMs: 200,
    reusable: true,
    metadata: {},
  };

  const result = planBasicToolStorageOperation({
    operation: "reuse",
    scope: { runtimeId: "runtime-1", sessionId: "session-1", tenantId: "tenant-a" },
    key: "tool-output-1",
    existingRecord,
    nowMs: 150,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("storage reuse planning should succeed");
  }

  assert.equal(result.plan.expired, false);
  assert.equal(result.plan.reusable, true);
  assert.equal(result.plan.wouldMutateStorage, false);
  assert.equal(result.plan.existingRecord?.key, "tool-output-1");
});

test("planBasicToolStorageOperation classifies missing input, expiry, isolation, and real mutation", () => {
  const missingMaterial = planBasicToolStorageOperation({
    scope: { runtimeId: "runtime-1", sessionId: "session-1" },
    key: "tool-output-1",
  });
  assert.equal(missingMaterial.ok, false);
  if (!missingMaterial.ok) {
    assert.equal(missingMaterial.error.code, "MISSING_MATERIAL");
    assert.equal(missingMaterial.error.boundary, "input");
  }

  const expiredRecord: BasicToolStorageRecord = {
    key: "tool-output-1",
    material: "old",
    scope: { runtimeId: "runtime-1", sessionId: "session-1" },
    createdAtMs: 0,
    expiresAtMs: 10,
    reusable: true,
    metadata: {},
  };
  const expired = planBasicToolStorageOperation({
    operation: "read",
    scope: { runtimeId: "runtime-1", sessionId: "session-1" },
    key: "tool-output-1",
    existingRecord: expiredRecord,
    nowMs: 20,
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.equal(expired.error.code, "MATERIAL_EXPIRED");
    assert.equal(expired.error.boundary, "resource");
  }

  const isolated = planBasicToolStorageOperation({
    operation: "read",
    scope: { runtimeId: "runtime-1", sessionId: "session-2" },
    key: "tool-output-1",
    existingRecord: expiredRecord,
  });
  assert.equal(isolated.ok, false);
  if (!isolated.ok) {
    assert.equal(isolated.error.code, "ISOLATION_VIOLATION");
    assert.equal(isolated.error.boundary, "scope");
  }

  const realMutation = planBasicToolStorageOperation({
    dryRun: false,
    scope: { runtimeId: "runtime-1", sessionId: "session-1" },
    key: "tool-output-1",
    material: "value",
  });
  assert.equal(realMutation.ok, false);
  if (!realMutation.ok) {
    assert.equal(realMutation.error.code, "REAL_STORAGE_MUTATION_BLOCKED");
    assert.equal(realMutation.error.boundary, "contract");
  }
});

test("planBaseToolStorageWrite classifies invalid records, scope denial, and real writes", () => {
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
  if (!invalidRecord.ok) {
    assert.equal(invalidRecord.error.code, "MISSING_RECORD_KIND");
  }

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
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

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
  if (!realWrite.ok) {
    assert.equal(realWrite.error.code, "REAL_STORAGE_NOT_ALLOWED");
    assert.equal(realWrite.error.boundary, "contract");
  }
});
