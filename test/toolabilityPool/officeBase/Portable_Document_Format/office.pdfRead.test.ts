import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  pdfReadDescriptor,
  planPdfRead,
} from "../../../../src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfRead.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfRead.ts",
  docPath: "docs/toolabilityPool/officeBase/Portable_Document_Format/office.pdfRead.md",
  testFileUrl: import.meta.url,
});

test("planPdfRead creates a guarded dry-run read plan", () => {
  const result = planPdfRead({
    target: {
      sourcePath: "docs/report.pdf",
      view: "outline",
      pageRange: { startPage: 2, endPage: 4 },
      maxPages: 3,
    },
    context: {
      workspaceRoot: "/workspace",
      invocationId: "read-1",
      requestedScopes: ["tool:office:pdf:read"],
      allowedScopes: ["tool:office:pdf:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(pdfReadDescriptor.capability, "read-pdf");
  assert.equal(result.plan.toolId, "office.pdfRead");
  assert.equal(result.plan.target.sourcePath, "docs/report.pdf");
  assert.equal(result.plan.target.view, "outline");
  assert.equal(result.plan.requiredPermissions[0], "filesystem:read");
  assert.equal(result.plan.executionBlocked, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.resultEnvelope.outline, []);
  assert.equal(result.audit[0]?.invocationId, "read-1");
});

test("planPdfRead rejects invalid ranges, scopes, and real execution", () => {
  const invalidRange = planPdfRead({
    target: { sourcePath: "docs/report.pdf", pageRange: { startPage: 5, endPage: 1 } },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_PAGE_RANGE");
  }

  const denied = planPdfRead({
    target: { sourcePath: "docs/report.pdf" },
    context: {
      workspaceRoot: "/workspace",
      requestedScopes: ["tool:office:pdf:read"],
      allowedScopes: ["tool:office:pdf:write"],
    },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const real = planPdfRead({
    target: { sourcePath: "docs/report.pdf" },
    context: { workspaceRoot: "/workspace", dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
