import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeCompositionRoot } from "../../../src/runtimeImplementation/runtimeCompositionRoot.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtimeCompositionRoot.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeCompositionRoot.md",
  testFileUrl: import.meta.url,
});

test("createRuntimeCompositionRoot composes injected runtime surfaces into a dry-run root", () => {
  const result = createRuntimeCompositionRoot({
    runtimeId: " runtime:alpha ",
    caller: {
      kind: "application",
      id: " app:studio ",
      sessionId: " session:1 ",
    },
    requestedScopes: [" runtime.invoke ", "runtime.inspect", "runtime.invoke"],
    allowedScopes: ["runtime.invoke", "runtime.inspect"],
    surfaces: [
      {
        surface: "runtime.contractSurface",
        bindingId: " contract:root ",
        capabilities: [" contract.check ", "contract.check"],
      },
      {
        surface: "runtime.governancePlane",
        bindingId: " governance:root ",
        capabilities: ["policy.evaluate"],
      },
      {
        surface: "runtime.invocationMethod",
        bindingId: " invocation:root ",
        metadata: { mode: "dry-run" },
      },
      {
        surface: "runtime.inspection",
        bindingId: " inspection:root ",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.composition.runtimeId, "runtime:alpha");
  assert.equal(result.composition.caller.id, "app:studio");
  assert.equal(result.composition.caller.sessionId, "session:1");
  assert.equal(result.composition.surface, "runtime.compositionRoot");
  assert.equal(result.composition.phase, "composed");
  assert.deepEqual(result.composition.requiredSurfaces, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
  ]);
  assert.deepEqual(result.composition.surfaceNames, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
    "runtime.inspection",
  ]);
  assert.deepEqual(result.composition.bindingIds, [
    "contract:root",
    "governance:root",
    "invocation:root",
    "inspection:root",
  ]);
  assert.deepEqual(result.composition.surfaces[0]?.capabilities, ["contract.check"]);
  assert.deepEqual(result.composition.acceptedScopes, ["runtime.invoke", "runtime.inspect"]);
  assert.equal(result.composition.contractChecked, true);
  assert.equal(result.composition.governanceChecked, true);
  assert.equal(result.composition.dryRun, true);
  assert.equal(result.composition.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.compositionRoot.composed"]);
});

test("createRuntimeCompositionRoot returns classified composition and gate failures", () => {
  const missingSurfaces = createRuntimeCompositionRoot({
    runtimeId: "runtime:alpha",
    caller: { kind: "test", id: "test:root" },
  });
  assert.equal(missingSurfaces.ok, false);
  assert.equal(missingSurfaces.error.code, "MISSING_SURFACES");
  assert.equal(missingSurfaces.error.boundary, "input");

  const missingRequired = createRuntimeCompositionRoot({
    runtimeId: "runtime:alpha",
    caller: { kind: "runtime-surface", id: "runtime:builder" },
    surfaces: [
      { surface: "runtime.contractSurface", bindingId: "contract:root" },
      { surface: "runtime.governancePlane", bindingId: "governance:root" },
    ],
  });
  assert.equal(missingRequired.ok, false);
  assert.equal(missingRequired.error.code, "REQUIRED_SURFACE_MISSING");
  assert.equal(missingRequired.error.boundary, "composition");

  const notReady = createRuntimeCompositionRoot({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspection:probe" },
    surfaces: [
      { surface: "runtime.contractSurface", bindingId: "contract:root" },
      { surface: "runtime.governancePlane", bindingId: "governance:root", ready: false },
      { surface: "runtime.invocationMethod", bindingId: "invocation:root" },
    ],
  });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.error.code, "SURFACE_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");

  const rejected = createRuntimeCompositionRoot({
    runtimeId: "runtime:alpha",
    caller: { kind: "official-module", id: "cmp:module", moduleId: "cmp" },
    surfaces: [
      { surface: "runtime.contractSurface", bindingId: "contract:root" },
      { surface: "runtime.governancePlane", bindingId: "governance:root" },
      { surface: "runtime.invocationMethod", bindingId: "invocation:root" },
    ],
    governance: { accepted: false, reason: "module scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "module scope denied");
  assert.equal(rejected.error.boundary, "governance");

  const scopeDenied = createRuntimeCompositionRoot({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app:studio" },
    requestedScopes: ["runtime.invoke", "runtime.mutate"],
    allowedScopes: ["runtime.invoke"],
    surfaces: [
      { surface: "runtime.contractSurface", bindingId: "contract:root" },
      { surface: "runtime.governancePlane", bindingId: "governance:root" },
      { surface: "runtime.invocationMethod", bindingId: "invocation:root" },
    ],
  });
  assert.equal(scopeDenied.ok, false);
  assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  assert.equal(scopeDenied.error.boundary, "scope");
});
