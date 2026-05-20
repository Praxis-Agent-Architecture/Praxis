import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeManagementPlane } from "../../../../src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.md",
  testFileUrl: import.meta.url,
});

test("runtimeManagementPlane exposes a guarded dry-run management handle", () => {
  const result = createRuntimeManagementPlane({
    runtimeId: " runtime-alpha ",
    caller: { kind: "operator", id: " operator-1 ", sessionId: " session-1 " },
    requestedScopes: ["runtime.manage", " runtime.audit ", "runtime.manage"],
    allowedScopes: ["runtime.manage", "runtime.audit"],
    components: [
      {
        surface: "operatorConsole",
        componentId: " operator-console ",
        capabilities: ["command.envelope", " command.envelope "],
      },
      {
        surface: "resourceGovernor",
        componentId: "resource-governor",
        metadata: { mockableEnvelope: true },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.managementPlane.runtimeId, "runtime-alpha");
  assert.equal(result.managementPlane.route, "runtime.managementPlane");
  assert.deepEqual(result.managementPlane.componentIds, ["operator-console", "resource-governor"]);
  assert.deepEqual(result.managementPlane.surfaces, ["operatorConsole", "resourceGovernor"]);
  assert.deepEqual(result.managementPlane.grantedScopes, ["runtime.manage", "runtime.audit"]);
  assert.equal(result.managementPlane.auditRequired, true);
  assert.equal(result.managementPlane.dryRun, true);
  assert.equal(result.managementPlane.unsafeSideEffects, false);
});

test("runtimeManagementPlane classifies missing, unready, and out-of-scope management input", () => {
  const missingRuntime = createRuntimeManagementPlane();

  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    return;
  }

  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const unreadyComponent = createRuntimeManagementPlane({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    components: [{ surface: "mutationPlanner", componentId: "planner-1", ready: false }],
  });

  assert.equal(unreadyComponent.ok, false);
  if (unreadyComponent.ok) {
    return;
  }

  assert.equal(unreadyComponent.error.code, "COMPONENT_NOT_READY");
  assert.equal(unreadyComponent.error.boundary, "runtime-state");

  const denied = createRuntimeManagementPlane({
    runtimeId: "runtime-alpha",
    caller: { kind: "official-module", id: "cmp" },
    requestedScopes: ["runtime.manage", "runtime.admin"],
    allowedScopes: ["runtime.manage"],
    components: [{ surface: "policyGate", componentId: "policy-gate-1" }],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.internalDetailExposed, false);
});
