import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { normalizeEphemeralProcedurePlan } from "../../../../src/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.md",
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
        baseToolId: "shell.commandExecution",
        input: { command: "find . -maxdepth 1 -type f" },
        riskLevel: "low",
      },
      {
        stepId: "summarize",
        baseToolId: "code.exec",
        input: { language: "python", code: "print('summary')" },
        dependsOn: ["find"],
      },
    ],
    expectedOutputs: [{ outputRef: "summary", kind: "text" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.kind, "praxis.ephemeralProcedurePlan");
  assert.equal(result.plan.executionMode, "mixed");
  assert.deepEqual(result.plan.requiredBaseTools, ["shell.commandExecution", "code.exec"]);
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
      baseToolId: "code.read",
      input: {},
      dependsOn: ["missing"],
    }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "UNKNOWN_DEPENDENCY");
});
