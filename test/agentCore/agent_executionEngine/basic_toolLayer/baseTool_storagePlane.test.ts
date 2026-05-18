import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  baseToolStoragePlaneDescriptor,
  exposeBaseToolStoragePlane,
} from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.js";
import { planBaseToolStorageWrite } from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/storageLogic.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTool_storagePlane.md",
  testFileUrl: import.meta.url,
});

function makeStoragePlan() {
  const result = planBaseToolStorageWrite({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "invoke-1",
    records: [
      {
        id: "record-1",
        kind: "audit-trace",
        toolName: "code.debugRun",
        payload: { status: "planned" },
        reuseKey: "debug-run:unit",
        tags: ["debug", "audit"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected storage logic plan");
  }

  return result.plan;
}

test("exposeBaseToolStoragePlane presents a governed summary over a storageLogic plan", () => {
  const view = exposeBaseToolStoragePlane({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    storagePlan: makeStoragePlan(),
    requestedScopes: ["tool:storage:observe"],
    allowedScopes: ["tool:storage:observe"],
    auditMetadata: { source: "unit-test" },
  });

  assert.equal(baseToolStoragePlaneDescriptor.ownsStorageWriteRules, false);
  assert.equal(baseToolStoragePlaneDescriptor.ownsGovernanceExposure, true);
  assert.equal(view.ok, true);
  if (!view.ok) {
    throw new Error("expected storage plane view");
  }

  assert.equal(view.view.plane, "baseTool_storagePlane");
  assert.equal(view.view.storagePool, "storagePool.baseToolStorage");
  assert.equal(view.view.runtimeId, "runtime-1");
  assert.equal(view.view.sessionId, "session-1");
  assert.equal(view.view.recordCount, 1);
  assert.deepEqual(view.view.recordKinds, { "audit-trace": 1 });
  assert.deepEqual(view.view.toolNames, ["code.debugRun"]);
  assert.deepEqual(view.view.reuseKeys, ["debug-run:unit"]);
  assert.deepEqual(view.view.acceptedScopes, ["tool:storage:observe"]);
  assert.equal(view.view.records.length, 0);
  assert.equal(view.view.audit.storageLogicOwnsWriteRules, true);
  assert.equal(view.view.audit.planeOwnsPresentation, true);
});

test("exposeBaseToolStoragePlane can present record metadata without exposing payloads", () => {
  const view = exposeBaseToolStoragePlane({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    storagePlan: makeStoragePlan(),
    visibility: "records",
  });

  assert.equal(view.ok, true);
  if (!view.ok) {
    throw new Error("expected record view");
  }

  assert.equal(view.view.records[0]?.id, "record-1");
  assert.equal(view.view.records[0]?.toolName, "code.debugRun");
  assert.equal(view.view.records[0]?.payloadExposed, false);
});

test("exposeBaseToolStoragePlane rejects missing plans, mismatched scope, and governance denial", () => {
  const missing = exposeBaseToolStoragePlane({ runtimeId: "runtime-1", sessionId: "session-1" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_STORAGE_PLAN");
  }

  const mismatch = exposeBaseToolStoragePlane({
    runtimeId: "runtime-2",
    sessionId: "session-1",
    storagePlan: makeStoragePlan(),
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.error.code, "STORAGE_PLAN_SCOPE_MISMATCH");
    assert.equal(mismatch.error.boundary, "scope");
  }

  const denied = exposeBaseToolStoragePlane({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    storagePlan: makeStoragePlan(),
    requestedScopes: ["tool:storage:observe"],
    allowedScopes: [],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }
});
