import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableVisionCheck } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableVisionCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableVisionCheck.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableVisionCheck.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableVisionCheck creates a guarded dry-run table vision check envelope", () => {
  const result = planOfficeTableVisionCheck({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Summary ",
      range: "a1:f20",
      checks: ["layout", "overflow", "visualDiff"],
      referenceImagePath: "/repo/references/summary.png",
      maxFindings: 10,
    },
    context: {
      invocationId: "table-vision-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read", "vision:analyze"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableVisionCheck");
  assert.equal(result.output.target.sheetName, "Summary");
  assert.equal(result.output.target.range, "A1:F20");
  assert.deepEqual(result.output.target.checks, ["layout", "overflow", "visualDiff"]);
  assert.equal(result.output.resultEnvelope.findings.length, 0);
  assert.equal(result.output.resultEnvelope.metadata.requiresRenderedSnapshot, true);
  assert.equal(result.output.resultEnvelope.metadata.providerCallPlanned, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "table-vision-1");
});

test("planOfficeTableVisionCheck rejects malformed vision requests", () => {
  const missing = planOfficeTableVisionCheck();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
  }

  const noChecks = planOfficeTableVisionCheck({
    target: { workbookPath: "/repo/reports/book.xlsx", checks: [] },
  });

  assert.equal(noChecks.ok, false);
  if (!noChecks.ok) {
    assert.equal(noChecks.error.code, "MISSING_CHECKS");
  }

  const missingReference = planOfficeTableVisionCheck({
    target: { workbookPath: "/repo/reports/book.xlsx", checks: ["visualDiff"] },
  });

  assert.equal(missingReference.ok, false);
  if (!missingReference.ok) {
    assert.equal(missingReference.error.code, "MISSING_REFERENCE_IMAGE");
  }

  const scope = planOfficeTableVisionCheck({
    target: { workbookPath: "/repo/reports/book.xlsx", checks: ["layout"], referenceImagePath: "/tmp/reference.png" },
    context: { allowedFileRoots: ["/repo"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const real = planOfficeTableVisionCheck({
    target: { workbookPath: "/repo/reports/book.xlsx", checks: ["layout"] },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
