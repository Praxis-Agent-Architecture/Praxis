import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationModelAdapter,
  type ApplicationModelAdapter,
} from "../../../../src/agentCore_modelAdapter/bridgingLayer/applicationAdapter.js";
import type { ApplicationBridgeCandidate } from "../../../../src/agentCore_modelAdapter/bridgingLayer/applicationCompatibilityCheck.js";
import {
  applicationInterfaceTestDescriptor,
  runApplicationModelInterfaceProbe,
} from "../../../../src/agentCore_modelAdapter/bridgingLayer/applicationInterfaceTest.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/bridgingLayer/applicationInterfaceTest.ts",
  docPath: "docs/agentCore/agent_modelAdapter/bridgingLayer/applicationInterfaceTest.md",
  testFileUrl: import.meta.url,
});

function compatibleCandidate(): ApplicationBridgeCandidate {
  return {
    runtimeId: "runtime",
    bridgeId: "bridge-1",
    transformationId: "transform-1",
    sourceInterfaceId: "responses-output",
    capabilities: [
      { capabilityId: "text-output", available: true, required: true },
      { capabilityId: "json-output", available: true },
    ],
    formats: [
      { formatId: "text", mediaType: "text/plain", available: true },
      { formatId: "json", mediaType: "application/json", structured: true, available: true },
    ],
    compatible: true,
    bridgeReadiness: "ready",
    providerPayloadCreated: false,
    unsafeSideEffects: false,
  };
}

function readyAdapter(): ApplicationModelAdapter {
  const result = createApplicationModelAdapter({
    runtimeId: "runtime",
    adapterId: "adapter-1",
    candidate: compatibleCandidate(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected ready adapter");
  }
  return result.adapter;
}

test("applicationInterfaceTest proves the agentCore-facing adapter interface is callable without provider calls", async () => {
  const result = await runApplicationModelInterfaceProbe({
    runtimeId: " runtime ",
    probeId: " probe-1 ",
    adapter: readyAdapter(),
    expectedCapabilityIds: ["text-output"],
    expectedFormatIds: ["json"],
    requestedScopes: ["model.invoke"],
    allowedScopes: ["model.invoke"],
  });

  assert.equal(applicationInterfaceTestDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected usable interface probe");
  }

  assert.equal(result.report.kind, "agentCore.modelAdapter.applicationInterfaceProbe");
  assert.equal(result.report.interfaceUsable, true);
  assert.deepEqual(result.report.gaps, []);
  assert.equal(result.report.dryRun.executed, true);
  assert.equal(result.report.dryRun.ok, true);
  assert.equal(result.report.dryRun.providerPayloadCreated, false);
  assert.equal(result.report.unsafeSideEffects, false);
  assert.equal(result.invocation?.ok, true);
});

test("applicationInterfaceTest reports interface gaps and rejects invalid probe boundaries", async () => {
  const missingRuntime = await runApplicationModelInterfaceProbe();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime rejection");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const gapped = await runApplicationModelInterfaceProbe({
    runtimeId: "runtime",
    probeId: "probe-2",
    adapter: readyAdapter(),
    expectedCapabilityIds: ["tool-call-output"],
    expectedFormatIds: ["xml"],
    executeDryRun: false,
  });
  assert.equal(gapped.ok, true);
  if (!gapped.ok) {
    throw new Error("expected gapped probe report");
  }
  assert.equal(gapped.report.interfaceUsable, false);
  assert.deepEqual(gapped.report.gaps, [
    { kind: "capability", id: "tool-call-output", reason: "missing" },
    { kind: "format", id: "xml", reason: "missing" },
  ]);
  assert.equal(gapped.report.dryRun.executed, false);

  const denied = await runApplicationModelInterfaceProbe({
    runtimeId: "runtime",
    probeId: "probe-3",
    adapter: readyAdapter(),
    requestedScopes: ["model.admin"],
    allowedScopes: ["model.invoke"],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    throw new Error("expected scope denial");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
});
