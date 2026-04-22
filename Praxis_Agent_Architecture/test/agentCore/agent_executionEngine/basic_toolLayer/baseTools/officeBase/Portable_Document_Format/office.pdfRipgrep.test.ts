import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planPdfRipgrep } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfRipgrep.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfRipgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfRipgrep.md",
  testFileUrl: import.meta.url,
});

test("planPdfRipgrep creates a guarded dry-run PDF text search plan", () => {
  const result = planPdfRipgrep({
    target: {
      pdfPath: "/docs/report.pdf",
      query: "budget",
      pageRange: { startPage: 2, endPage: 5 },
      includeTextContext: true,
      maxMatches: 25,
    },
    context: {
      invocationId: "pdf-rg-1",
      allowedDocumentRoots: ["/docs"],
      grantedPermissions: ["filesystem:read", "office:pdf:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.pdfRipgrep");
  assert.deepEqual(result.output.commandPreview, [
    "pdftotext",
    "-layout",
    "-f",
    "2",
    "-l",
    "5",
    "/docs/report.pdf",
    "-",
    "|",
    "rg",
    "--ignore-case",
    "--max-count",
    "25",
    "--context",
    "1",
    "budget",
  ]);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.matches, []);
  assert.equal(result.audit[0]?.invocationId, "pdf-rg-1");
});

test("planPdfRipgrep rejects missing query and invalid page range", () => {
  const missing = planPdfRipgrep({ target: { pdfPath: "/docs/report.pdf" } });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_QUERY");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidRange = planPdfRipgrep({
    target: { pdfPath: "/docs/report.pdf", query: "budget", pageRange: { startPage: 4, endPage: 3 } },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_PAGE_RANGE");
  }
});

test("planPdfRipgrep blocks scope gaps, permission gaps, and real execution", () => {
  const deniedScope = planPdfRipgrep({
    target: { pdfPath: "/private/report.pdf", query: "budget" },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_REJECTED");
  }

  const traversalScope = planPdfRipgrep({
    target: { pdfPath: "/docs/../private/report.pdf", query: "budget" },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(traversalScope.ok, false);
  if (!traversalScope.ok) {
    assert.equal(traversalScope.error.code, "SCOPE_REJECTED");
  }

  const permission = planPdfRipgrep({
    target: { pdfPath: "/docs/report.pdf", query: "budget" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planPdfRipgrep({
    target: { pdfPath: "/docs/report.pdf", query: "budget" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
