import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  pdfDecodeDescriptor,
  planPdfDecode,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfDecode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfDecode.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/Portable_Document_Format/office.pdfDecode.md",
  testFileUrl: import.meta.url,
});

test("planPdfDecode creates a guarded dry-run decode plan", () => {
  const result = planPdfDecode({
    target: {
      sourcePath: "docs/report.pdf",
      mode: "structure",
      pageRange: { startPage: 1, endPage: 3 },
      includeImages: true,
    },
    context: {
      workspaceRoot: "/workspace",
      invocationId: "decode-1",
      requestedScopes: ["tool:office:pdf:read"],
      allowedScopes: ["tool:office:pdf:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(pdfDecodeDescriptor.defaultDryRun, true);
  assert.equal(result.plan.toolId, "office.pdfDecode");
  assert.equal(result.plan.capability, "decode-pdf");
  assert.equal(result.plan.target.sourcePath, "docs/report.pdf");
  assert.equal(result.plan.target.mode, "structure");
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.executionBlocked, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.resultEnvelope.textChunks, []);
  assert.equal(result.audit[0]?.invocationId, "decode-1");
});

test("planPdfDecode rejects missing input, unsafe paths, and real execution", () => {
  const missing = planPdfDecode({ context: { workspaceRoot: "/workspace" } });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SOURCE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsafe = planPdfDecode({
    target: { sourcePath: "../report.pdf" },
    context: { workspaceRoot: "/workspace" },
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "SOURCE_OUT_OF_SCOPE");
    assert.equal(unsafe.error.boundary, "scope");
  }

  const real = planPdfDecode({
    target: { sourcePath: "docs/report.pdf" },
    context: { workspaceRoot: "/workspace", dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
