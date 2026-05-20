import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTablePosition } from "../../../../src/toolabilityPool/officeBase/spreadsheet/office.tablePosition.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/spreadsheet/office.tablePosition.ts",
  docPath: "docs/toolabilityPool/officeBase/spreadsheet/office.tablePosition.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTablePosition creates a guarded dry-run table position envelope", () => {
  const result = planOfficeTablePosition({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Sheet1 ",
      query: { kind: "text", text: " total ", matchMode: "exact" },
      maxMatches: 5,
      includeNearbyCells: true,
    },
    context: {
      invocationId: "table-position-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tablePosition");
  assert.equal(result.output.target.sheetName, "Sheet1");
  assert.deepEqual(result.output.target.query, { kind: "text", text: "total", matchMode: "exact" });
  assert.equal(result.output.resultEnvelope.matches.length, 0);
  assert.equal(result.output.resultEnvelope.metadata.includeNearbyCells, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "table-position-1");
});

test("planOfficeTablePosition rejects malformed position requests", () => {
  const missing = planOfficeTablePosition();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidAddress = planOfficeTablePosition({
    target: { workbookPath: "/repo/reports/book.xlsx", query: { kind: "cell", address: "row-one" } },
  });

  assert.equal(invalidAddress.ok, false);
  if (!invalidAddress.ok) {
    assert.equal(invalidAddress.error.code, "INVALID_CELL_ADDRESS");
  }

  const scope = planOfficeTablePosition({
    target: { workbookPath: "/tmp/book.xlsx", query: { kind: "range", range: "a1:b2" } },
    context: { allowedFileRoots: ["/repo"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const real = planOfficeTablePosition({
    target: { workbookPath: "/repo/reports/book.xlsx", query: { kind: "cell", address: "A1" } },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
