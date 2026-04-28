import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableEncode } from "../../../../src/toolabilityPool/officeBase/spreadsheet/office.tableEncode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/spreadsheet/office.tableEncode.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/spreadsheet/office.tableEncode.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableEncode creates a guarded dry-run table encode write plan", () => {
  const result = planOfficeTableEncode({
    target: {
      outputPath: "/repo/out/report.xlsx",
      format: "xlsx",
      overwrite: true,
      sheets: [
        {
          name: " Summary ",
          rows: [
            ["name", "score"],
            ["alpha", 10],
          ],
        },
      ],
    },
    context: {
      invocationId: "table-encode-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:write", "office:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableEncode");
  assert.equal(result.output.target.sheets[0]?.name, "Summary");
  assert.equal(result.output.writePlan.format, "xlsx");
  assert.equal(result.output.writePlan.sheetCount, 1);
  assert.equal(result.output.writePlan.rowCount, 2);
  assert.equal(result.output.writePlan.cellCount, 4);
  assert.equal(result.output.writePlan.overwrite, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "table-encode-1");
});

test("planOfficeTableEncode rejects missing content, scope gaps, permission gaps, and real execution", () => {
  const missing = planOfficeTableEncode();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_OUTPUT_PATH");
  }

  const noRows = planOfficeTableEncode({
    target: { outputPath: "/repo/out/report.csv", format: "csv", sheets: [{ name: "Summary", rows: [] }] },
  });

  assert.equal(noRows.ok, false);
  if (!noRows.ok) {
    assert.equal(noRows.error.code, "MISSING_ROWS");
  }

  const scope = planOfficeTableEncode({
    target: { outputPath: "/tmp/report.csv", format: "csv", sheets: [{ name: "Summary", rows: [["x"]] }] },
    context: { allowedFileRoots: ["/repo"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const permission = planOfficeTableEncode({
    target: { outputPath: "/repo/out/report.csv", format: "csv", sheets: [{ name: "Summary", rows: [["x"]] }] },
    context: { grantedPermissions: ["filesystem:write"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeTableEncode({
    target: { outputPath: "/repo/out/report.csv", format: "csv", sheets: [{ name: "Summary", rows: [["x"]] }] },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
