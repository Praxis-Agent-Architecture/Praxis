import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planOfficeDocEncode } from "../../../../src/toolabilityPool/officeBase/documentations/office.docEncode.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/documentations/office.docEncode.ts",
  docPath: "docs/toolabilityPool/officeBase/documentations/office.docEncode.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocEncode creates a guarded dry-run encode plan", () => {
  const result = planOfficeDocEncode({
    target: {
      title: "Quarterly Report",
      outputFormat: "docx",
      outputPath: "/workspace/out/report.docx",
      blocks: [
        { kind: "heading", text: "Summary", level: 1 },
        { kind: "paragraph", text: "Revenue increased." },
      ],
    },
    context: {
      invocationId: "doc-encode-1",
      allowedOutputRoots: ["/workspace/out"],
      grantedPermissions: ["filesystem:write", "office:document:encode"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected office.docEncode dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.docEncode");
  assert.equal(result.output.encodePlan.encoder, "office-document-encoder-v1");
  assert.equal(result.output.encodePlan.wouldWriteFile, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.encodePlan.artifactEnvelope.producedBytes, 0);
  assert.equal(result.audit[0]?.invocationId, "doc-encode-1");
});

test("planOfficeDocEncode rejects invalid format and empty blocks", () => {
  const invalidFormat = planOfficeDocEncode({
    target: { outputFormat: "pdf" as "docx", blocks: [{ text: "body" }] },
  });

  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) {
    assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");
  }

  const missingBlocks = planOfficeDocEncode({
    target: { outputFormat: "docx" },
  });

  assert.equal(missingBlocks.ok, false);
  if (!missingBlocks.ok) {
    assert.equal(missingBlocks.error.code, "MISSING_DOCUMENT_BLOCKS");
  }
});

test("planOfficeDocEncode blocks scoped output and missing file permissions", () => {
  const scoped = planOfficeDocEncode({
    target: {
      outputFormat: "docx",
      outputPath: "/tmp/report.docx",
      blocks: [{ text: "body" }],
    },
    context: { allowedOutputRoots: ["/workspace/out"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "OUTPUT_PATH_OUTSIDE_SCOPE");
  }

  const permission = planOfficeDocEncode({
    target: {
      outputFormat: "docx",
      outputPath: "/workspace/out/report.docx",
      blocks: [{ text: "body" }],
    },
    context: { grantedPermissions: ["office:document:encode"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }
});
