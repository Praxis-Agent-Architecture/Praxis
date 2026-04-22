import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  microphonePermissionReleaseDescriptor,
  planMicrophonePermissionRelease,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.md",
  testFileUrl: import.meta.url,
});

test("planMicrophonePermissionRelease creates a guarded dry-run release plan", () => {
  const result = planMicrophonePermissionRelease({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    permissionLeaseId: "mic-lease-1",
    targetApplication: "voice-capture",
    releaseReason: "capture-complete",
    requestedScopes: ["tool:computeruse:microphone"],
    allowedScopes: ["tool:computeruse:microphone"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(microphonePermissionReleaseDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "computeruse.microphonePermissionRelease");
  assert.equal(result.plan.permissionLeaseId, "mic-lease-1");
  assert.equal(result.plan.targetApplication, "voice-capture");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldRelease, true);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:microphone"]);
});

test("planMicrophonePermissionRelease rejects missing lease and real permission release", () => {
  const missingLease = planMicrophonePermissionRelease({
    targetApplication: "voice-capture",
  });
  assert.equal(missingLease.ok, false);
  if (missingLease.ok) {
    assert.fail("missing permission lease must be rejected");
  }
  assert.equal(missingLease.error.code, "MISSING_PERMISSION_LEASE");
  assert.equal(missingLease.error.boundary, "input");

  const realSideEffect = planMicrophonePermissionRelease({
    permissionLeaseId: "mic-lease-1",
    targetApplication: "voice-capture",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  if (realSideEffect.ok) {
    assert.fail("real permission release must be rejected");
  }
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
