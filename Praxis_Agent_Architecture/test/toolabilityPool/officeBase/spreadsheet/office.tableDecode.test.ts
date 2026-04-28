import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableDecode } from "../../../../src/toolabilityPool/officeBase/spreadsheet/office.tableDecode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/spreadsheet/office.tableDecode.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/spreadsheet/office.tableDecode.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableDecode creates a guarded dry-run table decode envelope", () => {
  const result = planOfficeTableDecode({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Sheet1 ",
      range: "a1:c10",
      valueMode: "raw",
      includeFormulas: true,
      maxRows: 20,
      maxColumns: 5,
    },
    context: {
      invocationId: "table-decode-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableDecode");
  assert.equal(result.output.target.sheetName, "Sheet1");
  assert.equal(result.output.target.range, "A1:C10");
  assert.equal(result.output.target.valueMode, "raw");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.resultEnvelope.rows.length, 0);
  assert.equal(result.output.resultEnvelope.truncated, false);
  assert.equal(result.audit[0]?.invocationId, "table-decode-1");
});

test("planOfficeTableDecode rejects missing input, invalid ranges, permission gaps, and real execution", () => {
  const missing = planOfficeTableDecode();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidRange = planOfficeTableDecode({
    target: { workbookPath: "/repo/reports/book.xlsx", range: "not a range" },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_RANGE");
  }

  const permission = planOfficeTableDecode({
    target: { workbookPath: "/repo/reports/book.xlsx" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeTableDecode({
    target: { workbookPath: "/repo/reports/book.xlsx" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
