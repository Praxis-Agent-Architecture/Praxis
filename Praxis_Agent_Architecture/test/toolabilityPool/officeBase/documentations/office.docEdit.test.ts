import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planOfficeDocEdit } from "../../../../src/toolabilityPool/officeBase/documentations/office.docEdit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/documentations/office.docEdit.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/documentations/office.docEdit.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocEdit creates a guarded dry-run edit plan", () => {
  const result = planOfficeDocEdit({
    target: {
      documentPath: "/workspace/docs/report.docx",
      outputPath: "/workspace/docs/report.edited.docx",
      operations: [
        {
          kind: "replaceText",
          targetText: "draft",
          replacementText: "final",
          occurrence: "all",
        },
      ],
    },
    context: {
      invocationId: "doc-edit-1",
      allowedDocumentRoots: ["/workspace/docs"],
      grantedPermissions: ["filesystem:read", "filesystem:write", "office:document:edit"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected office.docEdit dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.docEdit");
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.editPlan.editor, "office-document-editor-v1");
  assert.equal(result.output.editPlan.operationCount, 1);
  assert.equal(result.audit[0]?.invocationId, "doc-edit-1");
});

test("planOfficeDocEdit rejects missing operations and invalid edits", () => {
  const missingOperations = planOfficeDocEdit({
    target: { documentPath: "/workspace/docs/report.docx" },
  });

  assert.equal(missingOperations.ok, false);
  if (!missingOperations.ok) {
    assert.equal(missingOperations.error.code, "MISSING_EDIT_OPERATIONS");
  }

  const invalidOperation = planOfficeDocEdit({
    target: {
      documentPath: "/workspace/docs/report.docx",
      operations: [{ kind: "replaceText", replacementText: "final" }],
    },
  });

  assert.equal(invalidOperation.ok, false);
  if (!invalidOperation.ok) {
    assert.equal(invalidOperation.error.code, "INVALID_EDIT_OPERATION");
    assert.equal(invalidOperation.error.boundary, "input");
  }
});

test("planOfficeDocEdit blocks scope escapes, missing permissions, and real execution", () => {
  const scoped = planOfficeDocEdit({
    target: {
      documentPath: "/workspace/docs/report.docx",
      outputPath: "/tmp/report.docx",
      operations: [{ kind: "deleteRange", locator: "page:1" }],
    },
    context: { allowedDocumentRoots: ["/workspace/docs"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "DOCUMENT_PATH_OUTSIDE_SCOPE");
  }

  const permission = planOfficeDocEdit({
    target: {
      documentPath: "/workspace/docs/report.docx",
      operations: [{ kind: "insertText", locator: "end", text: "Appendix" }],
    },
    context: { grantedPermissions: ["filesystem:read", "office:document:edit"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeDocEdit({
    target: {
      documentPath: "/workspace/docs/report.docx",
      operations: [{ kind: "deleteRange", locator: "page:1" }],
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
