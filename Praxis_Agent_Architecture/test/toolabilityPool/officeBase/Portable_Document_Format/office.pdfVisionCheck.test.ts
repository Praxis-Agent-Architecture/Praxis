import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planPdfVisionCheck } from "../../../../src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionCheck.ts",
  docPath: "Praxis_Agent_Architecture/docs/toolabilityPool/officeBase/Portable_Document_Format/office.pdfVisionCheck.md",
  testFileUrl: import.meta.url,
});

test("planPdfVisionCheck creates a dry-run PDF visual inspection plan", () => {
  const result = planPdfVisionCheck({
    target: {
      pdfPath: "/docs/layout.pdf",
      checks: ["header aligned", "signature visible", "header aligned"],
      pageSelection: { pages: [1, 3, 3] },
      renderDpi: 150,
      includeThumbnails: true,
    },
    context: {
      invocationId: "pdf-vision-check-1",
      allowedDocumentRoots: ["/docs"],
      grantedPermissions: ["filesystem:read", "office:pdf:read", "office:pdf:render"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.pdfVisionCheck");
  assert.deepEqual(result.output.target.checks, ["header aligned", "signature visible"]);
  assert.deepEqual(result.output.renderPlan, { pages: [1, 3], dpi: 150, includeThumbnails: true });
  assert.equal(result.output.providerCallRequired, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.observations, []);
  assert.equal(result.audit[0]?.invocationId, "pdf-vision-check-1");
});

test("planPdfVisionCheck rejects missing checks and invalid render settings", () => {
  const missing = planPdfVisionCheck({ target: { pdfPath: "/docs/layout.pdf", checks: [] } });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_CHECKS");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidPages = planPdfVisionCheck({
    target: { pdfPath: "/docs/layout.pdf", checks: ["footer visible"], pageSelection: { pages: [0] } },
  });

  assert.equal(invalidPages.ok, false);
  if (!invalidPages.ok) {
    assert.equal(invalidPages.error.code, "INVALID_PAGE_SELECTION");
  }

  const invalidDpi = planPdfVisionCheck({
    target: { pdfPath: "/docs/layout.pdf", checks: ["footer visible"], renderDpi: 600 },
  });

  assert.equal(invalidDpi.ok, false);
  if (!invalidDpi.ok) {
    assert.equal(invalidDpi.error.code, "INVALID_RENDER_DPI");
  }
});

test("planPdfVisionCheck blocks scope gaps, permission gaps, and real execution", () => {
  const deniedScope = planPdfVisionCheck({
    target: { pdfPath: "/private/layout.pdf", checks: ["footer visible"] },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_REJECTED");
  }

  const traversalScope = planPdfVisionCheck({
    target: { pdfPath: "/docs/../private/layout.pdf", checks: ["footer visible"] },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(traversalScope.ok, false);
  if (!traversalScope.ok) {
    assert.equal(traversalScope.error.code, "SCOPE_REJECTED");
  }

  const permission = planPdfVisionCheck({
    target: { pdfPath: "/docs/layout.pdf", checks: ["footer visible"] },
    context: { grantedPermissions: ["filesystem:read", "office:pdf:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planPdfVisionCheck({
    target: { pdfPath: "/docs/layout.pdf", checks: ["footer visible"] },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
