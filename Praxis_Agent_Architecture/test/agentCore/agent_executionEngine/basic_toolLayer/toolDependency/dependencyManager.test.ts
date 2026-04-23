import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  manageToolDependencies,
  toolDependencyManagerDescriptor,
} from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.md",
  testFileUrl: import.meta.url,
});

test("manageToolDependencies creates a dry-run dependency report from declarations and probes", () => {
  const result = manageToolDependencies({
    toolId: "shell.exec",
    context: {
      runtimeId: "runtime-1",
      invocationId: "invoke-1",
      allowedScopes: ["tool:shell:exec"],
      auditMetadata: { source: "unit-test" },
    },
    declarations: [
      {
        dependencyId: "bash",
        kind: "binary",
        requestedVersion: "5.2",
        requiredScopes: ["tool:shell:exec"],
      },
      {
        dependencyId: "python",
        kind: "runtime",
        acceptedVersions: ["3.13"],
        required: false,
      },
    ],
    probes: [
      { dependencyId: "bash", available: true, version: "5.2", observedAt: "2026-04-22T00:00:00.000Z" },
      { dependencyId: "python", available: true, version: "3.12" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(toolDependencyManagerDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.toolId, "shell.exec");
  assert.equal(result.report.status, "stale");
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.unsafeSideEffects, false);
  assert.equal(result.report.summary.satisfied, 1);
  assert.equal(result.report.summary.stale, 1);
  assert.equal(result.report.summary.requiredUnsatisfied, 0);
  assert.deepEqual(result.report.resolutions.map((resolution) => resolution.dependencyId), ["bash", "python"]);
});

test("manageToolDependencies rejects missing declarations, duplicate ids, and real resolution", () => {
  const empty = manageToolDependencies();
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.error.code, "MISSING_TOOL_ID");
    assert.equal(empty.error.boundary, "input");
  }

  const missingDeclarations = manageToolDependencies({ toolId: "search.fetch" });
  assert.equal(missingDeclarations.ok, false);
  if (!missingDeclarations.ok) {
    assert.equal(missingDeclarations.error.code, "MISSING_DECLARATIONS");
    assert.equal(missingDeclarations.error.boundary, "input");
  }

  const duplicate = manageToolDependencies({
    toolId: "search.fetch",
    declarations: [{ dependencyId: "network" }, { dependencyId: "network" }],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, "DUPLICATE_DEPENDENCY_ID");
    assert.equal(duplicate.error.boundary, "contract");
  }

  const real = manageToolDependencies({
    toolId: "search.fetch",
    context: { dryRun: false },
    declarations: [{ dependencyId: "network" }],
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_DEPENDENCY_RESOLUTION_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("manageToolDependencies classifies missing, conflict, blocked, and scope denial", () => {
  const report = manageToolDependencies({
    toolId: "git.commit",
    declarations: [{ dependencyId: "git" }, { dependencyId: "worktree" }, { dependencyId: "approval" }],
    probes: [
      { dependencyId: "git", available: false, detail: "git binary unavailable" },
      { dependencyId: "worktree", available: true, conflictWith: ["dirty-index"] },
      { dependencyId: "approval", blocked: true, detail: "approval gate closed" },
    ],
  });

  assert.equal(report.ok, true);
  if (!report.ok) {
    return;
  }

  assert.equal(report.report.status, "blocked");
  assert.deepEqual(
    report.report.resolutions.map((resolution) => resolution.status),
    ["missing", "conflict", "blocked"],
  );

  const denied = manageToolDependencies({
    toolId: "shell.exec",
    context: { allowedScopes: ["tool:shell:read"] },
    declarations: [{ dependencyId: "shell", requiredScopes: ["tool:shell:exec"] }],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }
});
