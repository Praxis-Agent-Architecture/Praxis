import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planPdfVisionPosition } from "../../../../src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionPosition.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionPosition.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionPosition.md",
  testFileUrl: import.meta.url,
});

test("planPdfVisionPosition creates a dry-run visual region positioning plan", () => {
  const result = planPdfVisionPosition({
    target: {
      pdfPath: "/docs/layout.pdf",
      visualCue: "approval stamp",
      pageNumber: 4,
      coordinateSystem: "rendered-pixels",
      renderDpi: 180,
      maxCandidates: 6,
    },
    context: {
      invocationId: "pdf-position-1",
      allowedDocumentRoots: ["/docs"],
      grantedPermissions: ["filesystem:read", "office:pdf:read", "office:pdf:render"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.pdfVisionPosition");
  assert.deepEqual(result.output.renderPlan, {
    pageNumber: 4,
    dpi: 180,
    coordinateSystem: "rendered-pixels",
  });
  assert.equal(result.output.providerCallRequired, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.candidateRegions, []);
  assert.equal(result.audit[0]?.invocationId, "pdf-position-1");
});

test("planPdfVisionPosition rejects missing cue and invalid positioning options", () => {
  const missingCue = planPdfVisionPosition({ target: { pdfPath: "/docs/layout.pdf", pageNumber: 1 } });

  assert.equal(missingCue.ok, false);
  if (!missingCue.ok) {
    assert.equal(missingCue.error.code, "MISSING_VISUAL_CUE");
    assert.equal(missingCue.error.boundary, "input");
  }

  const invalidPage = planPdfVisionPosition({
    target: { pdfPath: "/docs/layout.pdf", visualCue: "stamp", pageNumber: 0 },
  });

  assert.equal(invalidPage.ok, false);
  if (!invalidPage.ok) {
    assert.equal(invalidPage.error.code, "INVALID_PAGE_NUMBER");
  }

  const invalidCoordinateSystem = planPdfVisionPosition({
    target: {
      pdfPath: "/docs/layout.pdf",
      visualCue: "stamp",
      pageNumber: 1,
      coordinateSystem: "css-pixels" as "pdf-points",
    },
  });

  assert.equal(invalidCoordinateSystem.ok, false);
  if (!invalidCoordinateSystem.ok) {
    assert.equal(invalidCoordinateSystem.error.code, "INVALID_COORDINATE_SYSTEM");
  }
});

test("planPdfVisionPosition blocks scope gaps, permission gaps, and real execution", () => {
  const deniedScope = planPdfVisionPosition({
    target: { pdfPath: "/private/layout.pdf", visualCue: "stamp", pageNumber: 1 },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_REJECTED");
  }

  const traversalScope = planPdfVisionPosition({
    target: { pdfPath: "/docs/../private/layout.pdf", visualCue: "stamp", pageNumber: 1 },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(traversalScope.ok, false);
  if (!traversalScope.ok) {
    assert.equal(traversalScope.error.code, "SCOPE_REJECTED");
  }

  const permission = planPdfVisionPosition({
    target: { pdfPath: "/docs/layout.pdf", visualCue: "stamp", pageNumber: 1 },
    context: { grantedPermissions: ["filesystem:read", "office:pdf:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planPdfVisionPosition({
    target: { pdfPath: "/docs/layout.pdf", visualCue: "stamp", pageNumber: 1 },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
