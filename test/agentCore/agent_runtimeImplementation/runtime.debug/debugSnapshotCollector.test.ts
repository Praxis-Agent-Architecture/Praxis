import assert from "node:assert/strict";
import test from "node:test";

import {
  collectDebugSnapshot,
  debugSnapshotCollectorDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.debug/debugSnapshotCollector.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.debug/debugSnapshotCollector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugSnapshotCollector.md",
  testFileUrl: import.meta.url,
});

test("collectDebugSnapshot collects public-safe runtime section shapes", () => {
  const result = collectDebugSnapshot({
    runtimeId: " runtime-1 ",
    snapshotId: " snapshot-1 ",
    caller: { kind: "runtime-surface", id: " debug-panel " },
    sections: [
      {
        kind: "runtime-state",
        label: " ready state ",
        status: "ready",
        value: { phase: "ready", hiddenToken: "not exposed" },
        tags: [" state ", "runtime"],
        metadata: { secretRuntimeValue: "not exposed" },
      },
      {
        kind: "governance",
        label: "scope",
        status: "degraded",
        value: ["debug", "inspection"],
      },
    ],
    requiredSectionKinds: ["runtime-state"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(debugSnapshotCollectorDescriptor.unsafeSideEffects, false);
  assert.equal(result.snapshot.runtimeId, "runtime-1");
  assert.equal(result.snapshot.route, "runtime.debug.debugSnapshotCollector");
  assert.deepEqual(result.snapshot.sectionKinds, ["runtime-state", "governance"]);
  assert.deepEqual(result.snapshot.sections[0]?.valueKeys, ["hiddenToken", "phase"]);
  assert.deepEqual(result.snapshot.sections[0]?.metadataKeys, ["secretRuntimeValue"]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.snapshot.sections[0] ?? {}, "metadata"),
    false,
  );
  assert.equal(result.snapshot.sections[0]?.valueShape, "object");
  assert.equal(result.snapshot.audit.rawRuntimeStateExposed, false);
  assert.deepEqual(result.snapshot.degradedSections, ["snapshot-1:section:2:governance"]);
});

test("collectDebugSnapshot rejects empty input and raw runtime value exposure", () => {
  const missing = collectDebugSnapshot();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty snapshot input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const raw = collectDebugSnapshot({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    sections: [{ kind: "runtime-state", label: "state", value: { secret: true } }],
    exposeRawValues: true,
  });

  assert.equal(raw.ok, false);
  if (raw.ok) {
    assert.fail("raw snapshot exposure must be blocked");
  }

  assert.equal(raw.error.code, "RAW_SNAPSHOT_BLOCKED");
  assert.equal(raw.error.boundary, "governance");
  assert.equal(raw.error.internalDetailExposed, false);
});
