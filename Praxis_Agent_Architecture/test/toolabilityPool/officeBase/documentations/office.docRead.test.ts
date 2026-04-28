import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planOfficeDocRead } from "../../../../src/toolabilityPool/officeBase/documentations/office.docRead.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/documentations/office.docRead.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/documentations/office.docRead.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocRead creates a guarded dry-run document read plan", () => {
  const result = planOfficeDocRead({
    target: {
      documentPath: "/workspace/docs/report.docx",
      mode: "markdown",
      maxBytes: 4096,
      includeMetadata: true,
    },
    context: {
      invocationId: "doc-read-1",
      allowedDocumentRoots: ["/workspace/docs"],
      grantedPermissions: ["filesystem:read", "office:document:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected office.docRead dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.docRead");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.readPlan.parser, "office-document-reader-v1");
  assert.equal(result.output.readPlan.wouldReadBytesAtMost, 4096);
  assert.equal(result.audit[0]?.invocationId, "doc-read-1");
});

test("planOfficeDocRead rejects missing target and unsafe paths", () => {
  const missing = planOfficeDocRead();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_DOCUMENT_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsafe = planOfficeDocRead({
    target: { documentPath: "/workspace/docs/../secret.docx" },
  });

  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_DOCUMENT_PATH");
    assert.equal(unsafe.error.boundary, "scope");
  }
});

test("planOfficeDocRead blocks missing permissions and real execution", () => {
  const permission = planOfficeDocRead({
    target: { documentPath: "/workspace/docs/report.docx" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planOfficeDocRead({
    target: { documentPath: "/workspace/docs/report.docx" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
