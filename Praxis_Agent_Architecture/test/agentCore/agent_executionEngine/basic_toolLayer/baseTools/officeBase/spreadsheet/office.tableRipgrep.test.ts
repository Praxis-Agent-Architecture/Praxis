import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficeTableRipgrep } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableRipgrep.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableRipgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/spreadsheet/office.tableRipgrep.md",
  testFileUrl: import.meta.url,
});

test("planOfficeTableRipgrep creates a guarded dry-run table search envelope", () => {
  const result = planOfficeTableRipgrep({
    target: {
      workbookPath: "/repo/reports/book.xlsx",
      sheetName: " Sheet1 ",
      pattern: " total\\s+cost ",
      regex: true,
      caseSensitive: true,
      ranges: ["a1:c10", " B2 "],
      maxMatches: 20,
    },
    context: {
      invocationId: "table-ripgrep-1",
      allowedFileRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.tableRipgrep");
  assert.equal(result.output.target.sheetName, "Sheet1");
  assert.equal(result.output.target.pattern, "total\\s+cost");
  assert.deepEqual(result.output.target.ranges, ["A1:C10", "B2"]);
  assert.equal(result.output.resultEnvelope.matches.length, 0);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "table-ripgrep-1");
});

test("planOfficeTableRipgrep rejects malformed search requests", () => {
  const missing = planOfficeTableRipgrep();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_WORKBOOK_PATH");
  }

  const invalidRegex = planOfficeTableRipgrep({
    target: { workbookPath: "/repo/reports/book.xlsx", pattern: "(", regex: true },
  });

  assert.equal(invalidRegex.ok, false);
  if (!invalidRegex.ok) {
    assert.equal(invalidRegex.error.code, "INVALID_PATTERN");
  }

  const invalidRange = planOfficeTableRipgrep({
    target: { workbookPath: "/repo/reports/book.xlsx", pattern: "total", ranges: ["row-one"] },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_RANGE");
  }

  const permission = planOfficeTableRipgrep({
    target: { workbookPath: "/repo/reports/book.xlsx", pattern: "total" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeTableRipgrep({
    target: { workbookPath: "/repo/reports/book.xlsx", pattern: "total" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
