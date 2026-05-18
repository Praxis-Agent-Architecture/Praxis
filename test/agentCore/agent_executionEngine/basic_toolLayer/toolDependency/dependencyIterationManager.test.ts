import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { manageToolDependencies } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";
import {
  planToolDependencyIteration,
  toolDependencyIterationManagerDescriptor,
} from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyIterationManager.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyIterationManager.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyIterationManager.md",
  testFileUrl: import.meta.url,
});

test("planToolDependencyIteration creates refresh steps from an existing dependency report", () => {
  const dependencyReport = manageToolDependencies({
    toolId: "search.fetch",
    declarations: [
      { dependencyId: "network", kind: "permission" },
      { dependencyId: "fetch-runtime", kind: "runtime", acceptedVersions: ["2.0"] },
      { dependencyId: "optional-cache", kind: "service", required: false },
    ],
    probes: [
      { dependencyId: "network", available: false },
      { dependencyId: "fetch-runtime", available: true, version: "1.0" },
    ],
  });

  assert.equal(dependencyReport.ok, true);
  if (!dependencyReport.ok) {
    return;
  }

  const result = planToolDependencyIteration({
    toolId: "search.fetch",
    currentIteration: 1,
    report: dependencyReport.report,
    context: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(toolDependencyIterationManagerDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.status, "needs-refresh");
  assert.equal(result.plan.currentIteration, 1);
  assert.equal(result.plan.nextIteration, 2);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.refreshSteps.map((step) => [step.dependencyId, step.action]),
    [
      ["network", "probe"],
      ["fetch-runtime", "refresh-version"],
    ],
  );
});

test("planToolDependencyIteration attaches trusted managed install plans without approval", () => {
  const dependencyReport = manageToolDependencies({
    toolId: "code.lsp_locateDefinition",
    declarations: [{ dependencyId: "lsp.server.typescript-language-server", kind: "package" }],
    probes: [{ dependencyId: "lsp.server.typescript-language-server", available: false }],
  });

  assert.equal(dependencyReport.ok, true);
  if (!dependencyReport.ok) {
    return;
  }

  const result = planToolDependencyIteration({
    toolId: "code.lsp_locateDefinition",
    report: dependencyReport.report,
    strategy: { managedRoot: "/tmp/praxis-tool-deps" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.refreshSteps[0]?.action, "install");
  assert.equal(result.plan.refreshSteps[0]?.approvalRequired, false);
  assert.equal(result.plan.refreshSteps[0]?.installPlan?.target, "praxis-managed");
  assert.equal(result.plan.refreshSteps[0]?.installPlan?.steps[0]?.command, "npm");
});

test("planToolDependencyIteration can derive a report from declarations without probing for real", () => {
  const result = planToolDependencyIteration({
    toolId: "code.format",
    declarations: [{ dependencyId: "formatter", kind: "binary" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.sourceReportStatus, "unknown");
  assert.equal(result.plan.status, "needs-refresh");
  assert.deepEqual(result.plan.refreshSteps.map((step) => step.action), ["probe"]);
});

test("planToolDependencyIteration rejects invalid iteration, max limit, and real refresh", () => {
  const invalid = planToolDependencyIteration({
    toolId: "code.format",
    currentIteration: -1,
    declarations: [{ dependencyId: "formatter" }],
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_ITERATION");
    assert.equal(invalid.error.boundary, "input");
  }

  const limit = planToolDependencyIteration({
    toolId: "code.format",
    currentIteration: 3,
    strategy: { maxIterations: 3 },
    declarations: [{ dependencyId: "formatter" }],
  });
  assert.equal(limit.ok, false);
  if (!limit.ok) {
    assert.equal(limit.error.code, "ITERATION_LIMIT_REACHED");
    assert.equal(limit.error.boundary, "contract");
  }

  const real = planToolDependencyIteration({
    toolId: "code.format",
    context: { dryRun: false },
    declarations: [{ dependencyId: "formatter" }],
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_REFRESH_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planToolDependencyIteration rejects mismatched request and report tool ids", () => {
  const dependencyReport = manageToolDependencies({
    toolId: "search.fetch",
    declarations: [{ dependencyId: "network", kind: "permission" }],
    probes: [{ dependencyId: "network", available: false }],
  });

  assert.equal(dependencyReport.ok, true);
  if (!dependencyReport.ok) {
    return;
  }

  const result = planToolDependencyIteration({
    toolId: "code.format",
    report: dependencyReport.report,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TOOL_ID_MISMATCH");
    assert.equal(result.error.boundary, "contract");
  }
});

test("planToolDependencyIteration leaves satisfied reports complete and blocks required blocked dependencies", () => {
  const satisfied = manageToolDependencies({
    toolId: "git.status",
    declarations: [{ dependencyId: "git", kind: "binary" }],
    probes: [{ dependencyId: "git", available: true }],
  });
  assert.equal(satisfied.ok, true);
  if (!satisfied.ok) {
    return;
  }

  const complete = planToolDependencyIteration({ toolId: "git.status", report: satisfied.report });
  assert.equal(complete.ok, true);
  if (complete.ok) {
    assert.equal(complete.plan.status, "complete");
    assert.equal(complete.plan.refreshSteps.length, 0);
  }

  const blocked = manageToolDependencies({
    toolId: "shell.exec",
    declarations: [{ dependencyId: "approval", kind: "permission" }],
    probes: [{ dependencyId: "approval", blocked: true }],
  });
  assert.equal(blocked.ok, true);
  if (!blocked.ok) {
    return;
  }

  const blockedPlan = planToolDependencyIteration({ toolId: "shell.exec", report: blocked.report });
  assert.equal(blockedPlan.ok, true);
  if (blockedPlan.ok) {
    assert.equal(blockedPlan.plan.status, "blocked");
    assert.equal(blockedPlan.plan.refreshSteps[0]?.action, "request-scope");
  }
});
