import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  createEphemeralProcedureExecutionState,
  normalizeEphemeralProcedurePlan,
} from "../../../../src/executionEngine/coreLogic/ephemeralProcedure.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/ephemeralProcedure.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.md",
  testFileUrl: import.meta.url,
});

test("normalizeEphemeralProcedurePlan accepts a BaseTool orchestration plan", () => {
  const result = normalizeEphemeralProcedurePlan({
    procedureId: "scan-workspace",
    purpose: "summarize disk usage from mounted tools",
    executionMode: "mixed",
    riskLevel: "medium",
    steps: [
      {
        stepId: "find",
        baseToolId: "shell.run",
        input: { command: "find . -maxdepth 1 -type f" },
        riskLevel: "low",
      },
      {
        stepId: "summarize",
        baseToolId: "file.search",
        input: { directoryPath: ".", query: "*.ts", maxEntries: 20 },
        dependsOn: ["find"],
      },
    ],
    expectedOutputs: [{ outputRef: "summary", kind: "text" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.kind, "praxis.ephemeralProcedurePlan");
  assert.equal(result.plan.executionMode, "mixed");
  assert.deepEqual(result.plan.requiredBaseTools, ["shell.run", "file.search"]);
  assert.equal(result.plan.steps[1]?.dependsOn[0], "find");
});

test("normalizeEphemeralProcedurePlan rejects TAP capability creation or invocation", () => {
  const result = normalizeEphemeralProcedurePlan({
    procedureId: "tap-gap",
    purpose: "try office bridge",
    steps: [{ stepId: "office", baseToolId: "tap/office", input: {} }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "TAP_NOT_ALLOWED");
});

test("normalizeEphemeralProcedurePlan rejects unknown dependencies", () => {
  const result = normalizeEphemeralProcedurePlan({
    procedureId: "bad-dependency",
    purpose: "bad dependency",
    steps: [{
      stepId: "read",
      baseToolId: "file.read",
      input: {},
      dependsOn: ["missing"],
    }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "UNKNOWN_DEPENDENCY");
});

test("normalizeEphemeralProcedurePlan caps one procedure package at 128 BaseTool calls", () => {
  const result = normalizeEphemeralProcedurePlan({
    procedureId: "too-many",
    purpose: "too many calls",
    steps: Array.from({ length: 129 }, (_, index) => ({
      stepId: `step-${index}`,
      baseToolId: "file.read",
      input: {},
    })),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "TOO_MANY_STEPS");
});

test("createEphemeralProcedureExecutionState supports partial waiting, completed, failed, fallback, and parallel continuation", () => {
  const normalized = normalizeEphemeralProcedurePlan({
    procedureId: "parallel-plan",
    purpose: "scan and summarize",
    executionMode: "parallel",
    approval: { required: true, reason: "high risk shell step" },
    steps: [
      {
        stepId: "safe-read",
        baseToolId: "file.read",
        input: { path: "package.json" },
        riskLevel: "low",
      },
      {
        stepId: "risky-shell",
        baseToolId: "shell.run",
        input: { command: "du -ah ." },
        riskLevel: "high",
      },
      {
        stepId: "summarize",
        baseToolId: "file.search",
        input: { directoryPath: ".", query: "summary", maxEntries: 20 },
        dependsOn: ["safe-read"],
      },
      {
        stepId: "fallback",
        baseToolId: "file.search",
        input: { pattern: "TODO" },
      },
      {
        stepId: "failed",
        baseToolId: "web.search",
        input: { query: "Praxis basetool migration" },
      },
    ],
  });
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const state = createEphemeralProcedureExecutionState({
    plan: normalized.plan,
    completedStepIds: ["safe-read"],
    failedStepIds: ["failed"],
    fallbackStepIds: ["fallback"],
  });

  assert.equal(state.registryInvocationRequired, true);
  assert.equal(state.partialStatus, "partialFallback");
  assert.deepEqual(state.completedStepIds, ["safe-read"]);
  assert.deepEqual(state.failedStepIds, ["failed"]);
  assert.deepEqual(state.fallbackStepIds, ["fallback"]);
  assert.equal(state.steps.find((step) => step.stepId === "risky-shell")?.status, "waitingApproval");
  assert.equal(state.steps.find((step) => step.stepId === "summarize")?.status, "ready");
  assert.equal(state.steps.find((step) => step.stepId === "summarize")?.canContinueInParallel, true);
  assert.equal(state.steps.every((step) => step.mustUseBaseToolRegistry), true);
});
