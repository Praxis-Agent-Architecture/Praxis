import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeBenchmarkDescriptor,
  planCodeBenchmark,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.benchmark.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.benchmark.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.benchmark.md",
  testFileUrl: import.meta.url,
});

test("planCodeBenchmark creates a dry-run benchmark envelope without executing code", () => {
  const result = planCodeBenchmark({
    runtimeId: "runtime-1",
    workspaceRoot: "/workspace/praxis",
    benchmarkTarget: "bench/main.bench.ts",
    command: ["npm", "run", "bench"],
    requestedScopes: ["tool:code"],
    allowedScopes: ["tool:code"],
    iterations: 3,
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(codeBenchmarkDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.toolKind, "code.benchmark");
  assert.equal(result.plan.benchmarkTarget, "bench/main.bench.ts");
  assert.deepEqual(result.plan.command, ["npm", "run", "bench"]);
  assert.deepEqual(result.plan.permissions, ["workspace:read", "process:spawn:dry-run"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.benchmarkExecuted, false);
  assert.equal(result.plan.execution.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.code.benchmark.planned"]);
});

test("planCodeBenchmark rejects missing runtime context", () => {
  const result = planCodeBenchmark();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planCodeBenchmark rejects real benchmark execution in the first round", () => {
  const result = planCodeBenchmark({
    runtimeId: "runtime-1",
    workspaceRoot: "/workspace/praxis",
    benchmarkTarget: "bench/main.bench.ts",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real benchmark execution must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["basicTool.code.benchmark.rejected"]);
});
