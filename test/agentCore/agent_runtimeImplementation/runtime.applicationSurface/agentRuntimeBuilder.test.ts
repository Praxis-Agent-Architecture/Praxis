import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { buildAgentRuntime } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeBuilder.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeBuilder.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeBuilder.md",
  testFileUrl: import.meta.url,
});

test("buildAgentRuntime creates a ready descriptor without unsafe side effects", () => {
  const result = buildAgentRuntime({
    source: { kind: "spec", name: "agent", version: "0.1.0" },
    requestedSurfaces: ["runtime.applicationSurface", "runtime.applicationSurface", " runtime.invocationMethod "],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.runtime, {
    runtimeId: "spec:agent",
    sourceKind: "spec",
    name: "agent",
    version: "0.1.0",
    readiness: "ready",
    assembledSurfaces: ["runtime.applicationSurface", "runtime.invocationMethod"],
    unsafeSideEffects: false,
  });
  assert.deepEqual(result.events, ["runtime.build.accepted"]);
});

test("buildAgentRuntime rejects missing source and contract failures", () => {
  assert.deepEqual(buildAgentRuntime({}), {
    ok: false,
    error: {
      code: "MISSING_SOURCE",
      message: "runtime build requires a DSL, spec, class, manifest, or configuration source",
      boundary: "input",
    },
    events: ["runtime.build.rejected"],
  });

  assert.deepEqual(
    buildAgentRuntime({
      source: { kind: "manifest", name: "agent" },
      contract: { accepted: false, reason: "manifest lacks runtime contract" },
    }),
    {
      ok: false,
      error: {
        code: "CONTRACT_REJECTED",
        message: "manifest lacks runtime contract",
        boundary: "contract",
      },
      events: ["runtime.build.rejected"],
    },
  );
});
