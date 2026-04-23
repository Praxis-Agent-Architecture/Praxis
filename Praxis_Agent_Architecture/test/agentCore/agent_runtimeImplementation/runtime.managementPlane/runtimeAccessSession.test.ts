import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimeAccessSession,
  isRuntimeAccessSessionActive,
  runtimeAccessSessionDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.md",
  testFileUrl: import.meta.url,
});

test("createRuntimeAccessSession creates a dry-run management access session with scoped authority", () => {
  const result = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "operator.main" },
    requestedScopes: ["runtime.manage", "runtime.inspect"],
    issuedAt: "2026-04-23T00:00:00.000Z",
    expiresAt: "2026-04-23T01:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(runtimeAccessSessionDescriptor.mode, "dry-run");
  assert.equal(result.session.runtimeId, "runtime-1");
  assert.equal(result.session.actor.kind, "operator");
  assert.deepEqual(result.session.requestedScopes, ["runtime.manage", "runtime.inspect"]);
  assert.equal(result.session.dryRunOnly, true);
  assert.equal(result.session.unsafeSideEffects, false);
  assert.equal(isRuntimeAccessSessionActive(result.session, "2026-04-23T00:30:00.000Z"), true);
});

test("createRuntimeAccessSession classifies missing input, denied scope, and expired session", () => {
  const missingActor = createRuntimeAccessSession({ runtimeId: "runtime-1" });
  assert.equal(missingActor.ok, false);
  assert.equal(missingActor.error.code, "MISSING_ACTOR");
  assert.equal(missingActor.error.boundary, "input");

  const deniedScope = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "external-control", id: "control-port" },
    requestedScopes: ["runtime.manage"],
  });
  assert.equal(deniedScope.ok, false);
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.internalDetailExposed, false);

  const expired = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "operator.main" },
    issuedAt: "2026-04-23T01:00:00.000Z",
    expiresAt: "2026-04-23T00:00:00.000Z",
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.error.code, "SESSION_EXPIRED");
});
