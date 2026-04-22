import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableEdit } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableEdit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableEdit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableEdit.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableEdit creates a guarded dry-run table edit write plan", () => {
  const result = planOfficeTableEdit({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Budget ",
      operations: [
        { kind: "setCell", address: " b2 ", value: 42 },
        { kind: "clearRange", range: "c3:d4" },
      ],
    },
    context: {
      invocationId: "table-edit-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "filesystem:write", "office:read", "office:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableEdit");
  assert.equal(result.output.target.sheetName, "Budget");
  assert.deepEqual(result.output.writePlan.affectedReferences, ["B2", "C3:D4"]);
  assert.equal(result.output.writePlan.operationCount, 2);
  assert.equal(result.output.writePlan.requiresBackup, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "table-edit-1");
});

test("planOfficeTableEdit rejects unsafe or malformed edit requests", () => {
  const missing = planOfficeTableEdit();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
  }

  const noOperations = planOfficeTableEdit({
    target: { workbookPath: "/repo/reports/book.xlsx", sheetName: "Budget", operations: [] },
  });

  assert.equal(noOperations.ok, false);
  if (!noOperations.ok) {
    assert.equal(noOperations.error.code, "MISSING_OPERATIONS");
  }

  const invalidAddress = planOfficeTableEdit({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: "Budget",
      operations: [{ kind: "setCell", address: "row-two", value: "x" }],
    },
  });

  assert.equal(invalidAddress.ok, false);
  if (!invalidAddress.ok) {
    assert.equal(invalidAddress.error.code, "INVALID_CELL_ADDRESS");
  }

  const permission = planOfficeTableEdit({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: "Budget",
      operations: [{ kind: "clearRange", range: "A1:A2" }],
    },
    context: { grantedPermissions: ["filesystem:read", "office:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeTableEdit({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: "Budget",
      operations: [{ kind: "clearRange", range: "A1:A2" }],
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
