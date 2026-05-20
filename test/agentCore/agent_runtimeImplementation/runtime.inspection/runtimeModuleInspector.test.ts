import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectRuntimeModule,
  runtimeModuleInspectorDescriptor,
} from "../../../../src/runtimeImplementation/runtime.inspection/runtimeModuleInspector.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.inspection/runtimeModuleInspector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeModuleInspector.md",
  testFileUrl: import.meta.url,
});

test("inspectRuntimeModule returns a readonly module attachment summary", () => {
  const result = inspectRuntimeModule({
    runtimeId: " runtime-1 ",
    moduleId: "tap",
    modules: [
      {
        moduleId: " tap ",
        kind: "TAP",
        mounted: true,
        required: true,
        health: "ready",
        surfaces: ["officialModuleSurface", "officialModuleSurface", "governancePlane"],
        capabilities: ["tool.invoke", "policy.audit"],
      },
    ],
    requestedScopes: ["inspection:read"],
    allowedScopes: ["inspection:read"],
  });

  assert.equal(runtimeModuleInspectorDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected module inspection to succeed");
  }

  assert.equal(result.inspection.runtimeId, "runtime-1");
  assert.equal(result.inspection.moduleId, "tap");
  assert.equal(result.inspection.status, "mounted");
  assert.equal(result.inspection.mounted, true);
  assert.equal(result.inspection.missingRequiredModule, false);
  assert.deepEqual(result.inspection.surfaces, ["officialModuleSurface", "governancePlane"]);
  assert.equal(result.inspection.unsafeSideEffects, false);
});

test("inspectRuntimeModule reports unmounted required modules without mutating runtime", () => {
  const result = inspectRuntimeModule({
    runtimeId: "runtime-1",
    moduleId: "multiagent",
    modules: [{ moduleId: "multiagent", required: true, mounted: false }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected unmounted module inspection to succeed");
  }

  assert.equal(result.inspection.status, "unmounted");
  assert.equal(result.inspection.missingRequiredModule, true);
  assert.deepEqual(result.events, ["runtime.inspection.moduleInspector.unmounted"]);
});

test("inspectRuntimeModule rejects missing module id, unready runtime, and scope denial", () => {
  const missingModule = inspectRuntimeModule({ runtimeId: "runtime-1" });
  assert.equal(missingModule.ok, false);
  if (missingModule.ok) {
    assert.fail("missing moduleId must be rejected");
  }
  assert.equal(missingModule.error.code, "MISSING_MODULE_ID");

  const unready = inspectRuntimeModule({
    runtimeId: "runtime-1",
    moduleId: "tap",
    runtimeReady: false,
  });
  assert.equal(unready.ok, false);
  if (unready.ok) {
    assert.fail("unready runtime must be rejected");
  }
  assert.equal(unready.error.code, "RUNTIME_NOT_READY");
  assert.equal(unready.error.boundary, "runtime-state");

  const denied = inspectRuntimeModule({
    runtimeId: "runtime-1",
    moduleId: "tap",
    requestedScopes: ["inspection:private"],
    allowedScopes: ["inspection:read"],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
});
