import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  pdfEncodeDescriptor,
  planPdfEncode,
} from "../../../../src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEncode.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEncode.ts",
  docPath: "docs/toolabilityPool/officeBase/Portable_Document_Format/office.pdfEncode.md",
  testFileUrl: import.meta.url,
});

test("planPdfEncode creates a guarded dry-run PDF creation plan", () => {
  const result = planPdfEncode({
    target: {
      outputPath: "exports/report.pdf",
      sourceFormat: "markdown",
      sourceLabel: "promptPack.summary",
      title: "Report",
      pageSize: "a4",
    },
    context: {
      workspaceRoot: "/workspace",
      invocationId: "encode-1",
      requestedScopes: ["tool:office:pdf:write"],
      allowedScopes: ["tool:office:pdf:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(pdfEncodeDescriptor.capability, "encode-pdf");
  assert.equal(result.plan.toolId, "office.pdfEncode");
  assert.equal(result.plan.target.outputPath, "exports/report.pdf");
  assert.equal(result.plan.target.sourceFormat, "markdown");
  assert.equal(result.plan.requiresTapApproval, true);
  assert.equal(result.plan.requiredPermissions[0], "filesystem:readwrite");
  assert.equal(result.plan.resultEnvelope.artifactAvailable, false);
  assert.equal(result.audit[0]?.invocationId, "encode-1");
});

test("planPdfEncode rejects missing provenance, unsafe output, and real execution", () => {
  const missingSource = planPdfEncode({
    target: { outputPath: "exports/report.pdf", sourceFormat: "markdown" },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(missingSource.ok, false);
  if (!missingSource.ok) {
    assert.equal(missingSource.error.code, "MISSING_SOURCE_LABEL");
  }

  const unsafe = planPdfEncode({
    target: {
      outputPath: "/tmp/report.pdf",
      sourceFormat: "markdown",
      sourceLabel: "material",
    },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "OUTPUT_OUT_OF_SCOPE");
  }

  const real = planPdfEncode({
    target: {
      outputPath: "exports/report.pdf",
      sourceFormat: "markdown",
      sourceLabel: "material",
    },
    context: { workspaceRoot: "/workspace", dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
