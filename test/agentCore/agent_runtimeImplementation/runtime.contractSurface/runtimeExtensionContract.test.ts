import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeExtensionContract } from "../../../../src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeExtensionContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeExtensionContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeExtensionContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeExtensionContract plans extension mounting as dry-run guarded work", () => {
  const result = defineRuntimeExtensionContract({
    runtimeId: " runtime:alpha ",
    contractId: " contract:extension ",
    extensionId: " ext.audit ",
    kind: "inspection-hook",
    mountSurface: "inspection",
    allowedMountSurfaces: ["inspection", "debug"],
    requiredCapabilities: ["runtime.events", " runtime.events ", "runtime.errors"],
    exposedEvents: ["runtime.audit", " runtime.audit "],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.extension.runtimeId, "runtime:alpha");
  assert.equal(result.extension.contractId, "contract:extension");
  assert.equal(result.extension.extensionId, "ext.audit");
  assert.equal(result.extension.kind, "inspection-hook");
  assert.deepEqual(result.extension.mountPlan, {
    extensionId: "ext.audit",
    mountSurface: "inspection",
    dryRun: true,
    requiresGovernance: true,
  });
  assert.deepEqual(result.extension.requiredCapabilities, ["runtime.events", "runtime.errors"]);
  assert.deepEqual(result.extension.exposedEvents, ["runtime.audit"]);
  assert.equal(result.extension.internalRuntimeStateExposed, false);
  assert.equal(result.extension.unsafeSideEffects, false);
});

test("runtimeExtensionContract rejects missing mount surface, denied mount scope, and contract failures", () => {
  const missingMount = defineRuntimeExtensionContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:extension",
    extensionId: "ext.audit",
  });

  assert.equal(missingMount.ok, false);
  if (missingMount.ok) {
    return;
  }

  assert.equal(missingMount.error.code, "MISSING_MOUNT_SURFACE");
  assert.equal(missingMount.error.boundary, "input");

  const deniedMount = defineRuntimeExtensionContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:extension",
    extensionId: "ext.audit",
    mountSurface: "debug",
    allowedMountSurfaces: ["inspection"],
  });

  assert.equal(deniedMount.ok, false);
  if (deniedMount.ok) {
    return;
  }

  assert.equal(deniedMount.error.code, "EXTENSION_SCOPE_DENIED");
  assert.equal(deniedMount.error.boundary, "scope");

  const rejected = defineRuntimeExtensionContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:extension",
    extensionId: "ext.audit",
    mountSurface: "inspection",
    contract: { accepted: false, reason: "extension contract missing declared capability" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "CONTRACT_REJECTED");
  assert.equal(rejected.error.message, "extension contract missing declared capability");
});
