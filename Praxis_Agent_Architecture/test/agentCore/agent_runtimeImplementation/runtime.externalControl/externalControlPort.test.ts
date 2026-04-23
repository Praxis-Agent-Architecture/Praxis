import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  externalControlPortDescriptor,
  routeExternalControlCommand,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlPort.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlPort.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlPort.md",
  testFileUrl: import.meta.url,
});

test("routeExternalControlCommand receives, guards, audits, and dry-run routes a command", () => {
  const result = routeExternalControlCommand({
    runtimeId: " runtime-1 ",
    commandKind: "diagnostic",
    commandName: "inspect.runtime",
    caller: { kind: "application", id: "app-1" },
    target: { surface: "inspection", operation: "runtime.inspect" },
    requestedEffects: ["inspect-runtime"],
    grantedScopes: ["runtime.inspect"],
    allowedEffects: ["inspect-runtime"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }
  assert.equal(result.ok, true);

  assert.equal(externalControlPortDescriptor.unsafeSideEffects, false);
  assert.equal(result.command.mode, "dry-run");
  assert.equal(result.guard.status, "allow");
  assert.equal(result.audit.outcome, "allowed");
  assert.equal(result.dispatch.mode, "dry-run");
  assert.equal(result.dispatch.targetSurface, "inspection");
  assert.equal(result.dispatch.actualRuntimeMutationStarted, false);
  assert.equal(result.dispatch.actualToolOrModelInvocationStarted, false);
  assert.equal(result.dispatch.unsafeSideEffects, false);
  assert.deepEqual(result.events.at(-1), "runtime.externalControl.port.routed");
});

test("routeExternalControlCommand audits guard rejection without dispatching", () => {
  const result = routeExternalControlCommand({
    runtimeId: "runtime-1",
    commandKind: "management",
    commandName: "runtime.rollback",
    caller: { kind: "operator", id: "ops" },
    target: { surface: "managementPlane", operation: "rollback" },
    requestedEffects: ["manage-runtime"],
    grantedScopes: ["runtime.read"],
    allowedEffects: ["manage-runtime"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing runtime.manage scope must stop external control routing");
  }

  assert.equal(result.error.code, "GUARD_REJECTED");
  assert.equal(result.error.boundary, "scope");
  assert.equal(result.guardError?.code, "SCOPE_DENIED");
  assert.equal(result.audit?.ok, true);
  if (result.audit?.ok) {
    assert.equal(result.audit.entry.outcome, "rejected");
    assert.equal(result.audit.entry.rejectionCode, "SCOPE_DENIED");
  }
});

test("routeExternalControlCommand blocks real execution in the first implementation", () => {
  const result = routeExternalControlCommand({
    runtimeId: "runtime-1",
    commandName: "runtime.mutate",
    caller: { kind: "operator", id: "ops" },
    target: { surface: "managementPlane" },
    execute: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real external control execution must be blocked");
  }

  assert.equal(result.error.code, "REAL_CONTROL_BLOCKED");
  assert.equal(result.error.boundary, "governance");
  assert.equal(result.error.safeForInspection, true);
});
