import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeChecks } from "../../../../src/agentCore_runtimeImplementation/runtime.inspection/runtimeCheckRunner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.inspection/runtimeCheckRunner.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeCheckRunner.md",
  testFileUrl: import.meta.url,
});

test("runtimeCheckRunner aggregates dry-run check results into an audit-only report", () => {
  const result = runRuntimeChecks({
    runtimeId: " runtime:alpha ",
    checks: [
      { checkId: "contract-ready", status: "pass", boundary: "contract" },
      { checkId: "governance-audit", status: "warn", boundary: "governance" },
      { checkId: "module-mounted", status: "skip", boundary: "module" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.runtimeId, "runtime:alpha");
  assert.equal(result.report.status, "warning");
  assert.deepEqual(result.report.executedChecks, ["contract-ready", "governance-audit"]);
  assert.deepEqual(result.report.skippedChecks, ["module-mounted"]);
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.auditOnly, true);
  assert.equal(result.report.unsafeSideEffects, false);
  assert.equal(result.report.findings[0]?.severity, "warning");
});

test("runtimeCheckRunner rejects non-dry-run execution and invalid check envelopes", () => {
  const realRun = runRuntimeChecks({ runtimeId: "runtime:alpha", dryRun: false });
  assert.equal(realRun.ok, false);
  if (!realRun.ok) {
    assert.equal(realRun.error.code, "CHECK_REJECTED");
    assert.equal(realRun.error.boundary, "check");
  }

  const invalidCheck = runRuntimeChecks({
    runtimeId: "runtime:alpha",
    checks: [{ checkId: " " }],
  });
  assert.equal(invalidCheck.ok, false);
  if (!invalidCheck.ok) {
    assert.equal(invalidCheck.error.code, "MISSING_CHECK_ID");
    assert.equal(invalidCheck.error.boundary, "input");
  }

  const contractDenied = runRuntimeChecks({
    runtimeId: "runtime:alpha",
    contract: { accepted: false, reason: "check contract denied" },
  });
  assert.equal(contractDenied.ok, false);
  if (!contractDenied.ok) {
    assert.equal(contractDenied.error.code, "CONTRACT_REJECTED");
    assert.equal(contractDenied.error.internalDetailExposed, false);
  }
});
