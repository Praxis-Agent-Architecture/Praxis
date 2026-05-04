import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  PraxisAgent,
  compileAgent,
  harness,
  model,
  tool,
  tools,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";
import { createRuntimeInspectReport } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspectReport.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspectReport.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspectReport.md",
  testFileUrl: import.meta.url,
});

class InspectableAgent extends PraxisAgent {
  identity = "agent.inspectable";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      tool("code.read", { family: "codeBase", group: "explore" }),
    ]),
  });
}

test("createRuntimeInspectReport aggregates public-safe Phase 10 report sections", () => {
  const compiled = compileAgent(InspectableAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.inspectable",
  });

  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const result = createRuntimeInspectReport({
    runtimeId: " runtime:inspectable ",
    audience: "inspection",
    manifest: compiled.manifest,
    tools: [
      {
        toolId: "code.read",
        family: "codeBase",
        group: "explore",
        ready: true,
        dependencies: [{ dependencyId: "storagePool.codeBase", kind: "storage", ready: true }],
      },
      {
        toolId: "shell.commandExecution",
        family: "shellBase",
        group: "shellExecution",
        ready: false,
        reason: "executor port not mounted",
      },
    ],
    dependencyGraph: {
      ready: false,
      blockingIssues: [{ nodeId: "runtime.debug", reason: "debug surface degraded" }],
      evaluationOrder: ["contract", "governance", "runtime.debug"],
    },
    promptPackPreview: {
      available: true,
      materialCount: 2,
      toolDeclarationCount: 1,
    },
    mainLoopTrace: {
      available: true,
      stepCount: 4,
      lastActionPrimitive: "invokeModel",
    },
    debug: {
      health: "degraded",
      providerReady: true,
      baseToolReady: false,
      replayPreviewAvailable: true,
    },
    selfRepair: {
      planAvailable: true,
      planStatus: "approval-required",
      unsafeSideEffects: false,
      nextStep: "hold-for-approval",
    },
    missingRequirements: ["provider.codex-responses"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.report.runtimeId, "runtime:inspectable");
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.reportSurface, "runtime.inspection.runtimeInspectReport");
  assert.equal(result.report.manifest?.manifestId, "manifest.inspectable");
  assert.equal(result.report.sections.policy.summary, "tool policy profile is standard");
  assert.equal(result.report.sections.sandbox.summary, "sandbox profile is host-observed");
  assert.equal(result.report.sections.promptPackPreview.status, "ready");
  assert.equal(result.report.sections.mainLoopTrace.status, "ready");
  assert.equal(result.report.sections.selfRepair.status, "ready");
  assert.equal(result.report.unsafeSideEffects, false);
  assert.equal(result.report.secretLeakageDetected, false);
  assert.equal(result.report.findings.some((finding) => finding.findingId === "shell.commandExecution.not-ready"), true);
  assert.equal(result.report.findings.some((finding) => finding.findingId === "debug.baseTool.not-ready"), true);
  assert.equal(result.report.findings.some((finding) => finding.findingId === "runtimeRequirement.provider.codex-responses.missing"), true);
  assert.deepEqual(result.events, ["runtime.inspection.inspectReport.blocked"]);
});

test("createRuntimeInspectReport rejects missing runtime, governance denial, and unsafe secret-like text", () => {
  const missing = createRuntimeInspectReport();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.internalDetailExposed, false);
  }

  const denied = createRuntimeInspectReport({
    runtimeId: "runtime:inspectable",
    governance: { accepted: false, reason: "inspection denied" },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
    assert.equal(denied.error.message, "inspection denied");
  }

  const unsafe = createRuntimeInspectReport({
    runtimeId: "runtime:inspectable",
    promptPackPreview: { available: true, safeSummary: "token sk-live" },
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "CHECK_FAILED");
    assert.equal(unsafe.error.boundary, "check");
  }
});
