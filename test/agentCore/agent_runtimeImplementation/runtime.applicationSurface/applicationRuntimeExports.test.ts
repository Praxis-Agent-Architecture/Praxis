import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineApplicationRuntimeExports } from "../../../../src/runtimeImplementation/runtime.applicationSurface/applicationRuntimeExports.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.applicationSurface/applicationRuntimeExports.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationRuntimeExports.md",
  testFileUrl: import.meta.url,
});

test("applicationRuntimeExports separates public APIs, visible events, callable capabilities, and hidden internals", () => {
  const result = defineApplicationRuntimeExports({
    runtimeId: " runtime:alpha ",
    applicationId: " app:writer ",
    publicApis: [{ name: "invoke" }, { name: " invoke " }, { name: "inspect" }],
    visibleEvents: [{ name: "runtime.output" }],
    callableCapabilities: [{ name: "agent.reply", description: "Reply through runtime" }],
    hiddenInternalDetails: ["src/agentCore/internalMutableState.ts", "provider.rawPayload"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.exports.publicApis.map((item) => item.name),
    ["invoke", "inspect"],
  );
  assert.deepEqual(result.exports.visibleEvents, [{ name: "runtime.output", description: undefined }]);
  assert.equal(result.exports.hiddenInternalDetailCount, 2);
  assert.equal(result.exports.internalFileStructureExposed, false);
});

test("applicationRuntimeExports rejects empty surfaces and governance denial", () => {
  const empty = defineApplicationRuntimeExports({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_EXPORT_SURFACE");
  assert.equal(empty.error.boundary, "input");

  const rejected = defineApplicationRuntimeExports({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
    publicApis: [{ name: "invoke" }],
    governance: { accepted: false, reason: "app is outside scope" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
