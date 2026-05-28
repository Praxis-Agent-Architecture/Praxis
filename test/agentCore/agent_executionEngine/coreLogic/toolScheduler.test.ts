import assert from "node:assert/strict";
import test from "node:test";

import {
  runToolExecutionUnits,
  toolExecutionUnitsFromEphemeralProcedure,
} from "../../../../src/executionEngine/coreLogic/toolScheduler.js";
import type { EphemeralProcedurePlan } from "../../../../src/executionEngine/coreLogic/ephemeralProcedure.js";

function procedure(continueOnStepFailure = false): EphemeralProcedurePlan {
  return {
    kind: "praxis.ephemeralProcedurePlan",
    procedureId: "procedure-1",
    purpose: "test parallel procedure",
    author: "model",
    executionMode: "parallel",
    steps: [
      {
        stepId: "a",
        baseToolId: "file.read",
        input: { path: "a.txt" },
        dependsOn: [],
        riskLevel: "low",
        resourceHints: {},
        outputRef: "out.a",
      },
      {
        stepId: "b",
        baseToolId: "file.read",
        input: { path: "b.txt" },
        dependsOn: [],
        riskLevel: "low",
        resourceHints: {},
        outputRef: "out.b",
      },
      {
        stepId: "c",
        baseToolId: "file.search",
        input: { query: "needle" },
        dependsOn: ["a"],
        riskLevel: "low",
        resourceHints: {},
        outputRef: "out.c",
      },
    ],
    dependencies: [],
    requiredBaseTools: ["file.read", "file.search"],
    riskLevel: "low",
    approval: { required: false },
    resourceLimits: {},
    expectedOutputs: [],
    mergeObservationPolicy: "append",
    metadata: continueOnStepFailure ? { continueOnStepFailure: true } : {},
  };
}

test("runToolExecutionUnits executes EphemeralProcedure steps as dependency waves", async () => {
  const order: string[] = [];
  const result = await runToolExecutionUnits(
    toolExecutionUnitsFromEphemeralProcedure(procedure()),
    async ({ unit }) => {
      order.push(unit.unitId);
      return { ok: true, result: unit.unitId };
    },
    { executionMode: "parallel" },
  );

  assert.equal(result.ok, true);
  assert.deepEqual([...result.completedUnitIds].sort(), ["procedure-1:a", "procedure-1:b", "procedure-1:c"]);
  assert.equal(order.slice(0, 2).includes("procedure-1:a"), true);
  assert.equal(order.slice(0, 2).includes("procedure-1:b"), true);
  assert.equal(order[2], "procedure-1:c");
});

test("runToolExecutionUnits can continue independent work after a failed step", async () => {
  const result = await runToolExecutionUnits(
    toolExecutionUnitsFromEphemeralProcedure(procedure(true)),
    async ({ unit }) => {
      if (unit.procedureStepId === "a") {
        return {
          ok: false,
          error: { code: "FAILED", message: "boom", publicSafe: true },
        };
      }
      return { ok: true, result: unit.unitId };
    },
    { executionMode: "parallel", continueOnStepFailure: true },
  );

  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.deepEqual(result.failedUnitIds, ["procedure-1:a"]);
  assert.deepEqual(result.completedUnitIds, ["procedure-1:b"]);
  assert.deepEqual(result.skippedUnitIds, ["procedure-1:c"]);
});

test("runToolExecutionUnits passes abort signals and cancels pending work", async () => {
  const controller = new AbortController();
  let first = true;
  const result = await runToolExecutionUnits(
    toolExecutionUnitsFromEphemeralProcedure(procedure()),
    async ({ signal }) => {
      assert.equal(signal, controller.signal);
      if (first) {
        first = false;
        controller.abort();
      }
      return { ok: true, result: "ok" };
    },
    { executionMode: "serial", signal: controller.signal },
  );

  assert.equal(result.ok, false);
  assert.equal(result.records.some((record) => record.status === "cancelled"), true);
  assert.deepEqual(result.failedUnitIds, []);
  assert.ok(result.skippedUnitIds.length > 0);
});
