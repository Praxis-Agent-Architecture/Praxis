import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  pdfEditDescriptor,
  planPdfEdit,
} from "../../../../src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEdit.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEdit.ts",
  docPath: "docs/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEdit.md",
  testFileUrl: import.meta.url,
});

test("planPdfEdit creates a guarded dry-run edit plan", () => {
  const result = planPdfEdit({
    target: {
      sourcePath: "docs/report.pdf",
      outputPath: "exports/report.annotated.pdf",
      operations: [
        {
          kind: "annotate",
          targetPage: 1,
          summary: "add reviewer note",
          parameters: { label: "review" },
        },
      ],
    },
    context: {
      workspaceRoot: "/workspace",
      invocationId: "edit-1",
      requestedScopes: ["tool:office:pdf:write"],
      allowedScopes: ["tool:office:pdf:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(pdfEditDescriptor.capability, "edit-pdf");
  assert.equal(result.plan.toolId, "office.pdfEdit");
  assert.equal(result.plan.target.sourcePath, "docs/report.pdf");
  assert.equal(result.plan.target.outputPath, "exports/report.annotated.pdf");
  assert.equal(result.plan.target.operations[0]?.kind, "annotate");
  assert.equal(result.plan.requiresTapApproval, true);
  assert.equal(result.plan.executionBlocked, true);
  assert.equal(result.plan.resultEnvelope.operationsApplied, 0);
  assert.equal(result.audit[0]?.invocationId, "edit-1");
});

test("planPdfEdit rejects missing operations, overwrite without approval, and real execution", () => {
  const missingOperations = planPdfEdit({
    target: {
      sourcePath: "docs/report.pdf",
      outputPath: "exports/report.pdf",
      operations: [],
    },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(missingOperations.ok, false);
  if (!missingOperations.ok) {
    assert.equal(missingOperations.error.code, "MISSING_EDIT_OPERATIONS");
  }

  const overwrite = planPdfEdit({
    target: {
      sourcePath: "docs/report.pdf",
      outputPath: "docs/report.pdf",
      operations: [{ kind: "metadata", summary: "update title" }],
    },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(overwrite.ok, false);
  if (!overwrite.ok) {
    assert.equal(overwrite.error.code, "OVERWRITE_NOT_APPROVED");
    assert.equal(overwrite.error.boundary, "governance");
  }

  const real = planPdfEdit({
    target: {
      sourcePath: "docs/report.pdf",
      outputPath: "exports/report.pdf",
      operations: [{ kind: "rotate", targetPage: 1, summary: "rotate first page" }],
    },
    context: { workspaceRoot: "/workspace", dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
