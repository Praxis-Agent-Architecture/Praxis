import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeOperationBusDescriptor,
  submitRuntimeOperation,
} from "../../../src/agentCore_runtimeImplementation/runtimeOperationBus.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtimeOperationBus.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeOperationBus.md",
  testFileUrl: import.meta.url,
});

test("submitRuntimeOperation builds a governed dry-run operation envelope", () => {
  const result = submitRuntimeOperation({
    runtimeId: " runtime-1 ",
    runtimeReady: true,
    operation: {
      operationId: " invoke-1 ",
      kind: " invoke ",
      targetSurface: "runtime.invocationMethod",
      caller: { callerId: " official:cmp ", kind: "official-module" },
      payload: { prompt: "hello" },
      trace: { correlationId: " corr-1 " },
    },
    mountedSurfaces: ["runtime.invocationMethod", "runtime.inspection"],
    requestedScopes: ["invoke", " invoke "],
    allowedScopes: ["invoke", "inspect"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected operation bus acceptance");
  }

  assert.equal(runtimeOperationBusDescriptor.unsafeSideEffects, false);
  assert.equal(result.envelope.runtimeId, "runtime-1");
  assert.equal(result.envelope.operationId, "invoke-1");
  assert.equal(result.envelope.operationKind, "invoke");
  assert.equal(result.envelope.caller.callerId, "official:cmp");
  assert.equal(result.envelope.targetSurface, "runtime.invocationMethod");
  assert.deepEqual(result.envelope.acceptedScopes, ["invoke"]);
  assert.equal(result.envelope.dispatchMode, "dry-run");
  assert.equal(result.envelope.status, "accepted-for-audit");
  assert.equal(result.envelope.governanceRequired, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.operationBus.accepted"]);
});

test("submitRuntimeOperation rejects missing input with inspection-safe errors", () => {
  const missingRuntime = submitRuntimeOperation();

  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime rejection");
  }

  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");
  assert.equal(missingRuntime.error.safeForRuntimeInspection, true);
  assert.equal(missingRuntime.error.internalDetailExposed, false);

  const missingCaller = submitRuntimeOperation({
    runtimeId: "runtime-1",
    operation: {
      kind: "inspect",
      targetSurface: "runtime.inspection",
    },
  });

  assert.equal(missingCaller.ok, false);
  if (missingCaller.ok) {
    throw new Error("expected missing caller rejection");
  }

  assert.equal(missingCaller.error.code, "MISSING_CALLER");
  assert.equal(missingCaller.error.boundary, "input");
});

test("submitRuntimeOperation enforces runtime, governance, scope, and bus boundaries", () => {
  const governanceRejected = submitRuntimeOperation({
    runtimeId: "runtime-1",
    operation: {
      kind: "invoke",
      targetSurface: "runtime.invocationMethod",
      caller: { callerId: "app", kind: "application" },
    },
    governance: { accepted: false, reason: "scope denied" },
  });

  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }

  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "scope denied");
  assert.equal(governanceRejected.error.boundary, "governance");

  const scopeRejected = submitRuntimeOperation({
    runtimeId: "runtime-1",
    operation: {
      kind: "inspect",
      targetSurface: "runtime.inspection",
      caller: { callerId: "debug", kind: "debug" },
    },
    requestedScopes: ["private-debug"],
    allowedScopes: ["inspect"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");

  const unmountedSurface = submitRuntimeOperation({
    runtimeId: "runtime-1",
    operation: {
      kind: "invoke",
      targetSurface: "runtime.modelAdapter",
      caller: { callerId: "official:tap", kind: "official-module" },
    },
    mountedSurfaces: ["runtime.invocationMethod"],
  });

  assert.equal(unmountedSurface.ok, false);
  if (unmountedSurface.ok) {
    throw new Error("expected bus target rejection");
  }

  assert.equal(unmountedSurface.error.code, "TARGET_SURFACE_NOT_MOUNTED");
  assert.equal(unmountedSurface.error.boundary, "bus");

  const realDispatch = submitRuntimeOperation({
    runtimeId: "runtime-1",
    dryRun: false,
    operation: {
      kind: "invoke",
      targetSurface: "runtime.invocationMethod",
      caller: { callerId: "app", kind: "application" },
    },
  });

  assert.equal(realDispatch.ok, false);
  if (realDispatch.ok) {
    throw new Error("expected real dispatch rejection");
  }

  assert.equal(realDispatch.error.code, "REAL_DISPATCH_NOT_ALLOWED");
  assert.equal(realDispatch.error.boundary, "governance");
});
