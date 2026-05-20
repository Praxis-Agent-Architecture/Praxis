import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createApplicationRuntimeSandbox } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationRuntimeSandbox.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationRuntimeSandbox.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationRuntimeSandbox.md",
  testFileUrl: import.meta.url,
});

test("applicationRuntimeSandbox creates a dry-run envelope that grants only scoped capabilities", () => {
  const result = createApplicationRuntimeSandbox({
    runtimeId: " runtime:alpha ",
    applicationId: " app:writer ",
    extension: {
      extensionId: " ext:preview ",
      requestedCapabilities: ["invoke.agent", "internal.state.write"],
      requestedEffects: ["filesystem", "provider"],
    },
    allowedCapabilities: ["invoke.agent"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.sandboxId, "runtime:alpha:app:writer:ext:preview");
  assert.deepEqual(result.envelope.grantedCapabilities, ["invoke.agent"]);
  assert.deepEqual(result.envelope.deniedCapabilities, ["internal.state.write"]);
  assert.deepEqual(result.envelope.blockedEffects, ["filesystem", "provider"]);
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.equal(result.envelope.internalStateMutable, false);
});

test("applicationRuntimeSandbox rejects missing extension and direct internal state mutation", () => {
  const missing = createApplicationRuntimeSandbox({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_EXTENSION_ID");
  assert.equal(missing.error.boundary, "input");

  const mutation = createApplicationRuntimeSandbox({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
    extension: {
      extensionId: "ext:bad",
      mutatesInternalState: true,
    },
  });

  assert.equal(mutation.ok, false);
  if (mutation.ok) {
    return;
  }

  assert.equal(mutation.error.code, "INTERNAL_STATE_MUTATION_DENIED");
  assert.equal(mutation.error.boundary, "runtime-state");
});
