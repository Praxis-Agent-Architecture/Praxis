import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableRead } from "../../../../src/toolabilityPool/officeBase/spreadsheet/office.tableRead.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/spreadsheet/office.tableRead.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/spreadsheet/office.tableRead.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableRead creates a guarded dry-run table read envelope", () => {
  const result = planOfficeTableRead({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Sheet1 ",
      range: "a1:c10",
      valueMode: "formula",
      includeHeaderRow: true,
      maxRows: 10,
      maxColumns: 3,
    },
    context: {
      invocationId: "table-read-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableRead");
  assert.equal(result.output.target.sheetName, "Sheet1");
  assert.equal(result.output.target.range, "A1:C10");
  assert.equal(result.output.target.valueMode, "formula");
  assert.deepEqual(result.output.resultEnvelope.headerRow, []);
  assert.equal(result.output.resultEnvelope.rows.length, 0);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "table-read-1");
});

test("planOfficeTableRead rejects missing input, invalid ranges, permission gaps, and real execution", () => {
  const missing = planOfficeTableRead();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
  }

  const invalidRange = planOfficeTableRead({
    target: { workbookPath: "/repo/reports/book.xlsx", range: "not-a-range" },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_RANGE");
  }

  const permission = planOfficeTableRead({
    target: { workbookPath: "/repo/reports/book.xlsx" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeTableRead({
    target: { workbookPath: "/repo/reports/book.xlsx" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
