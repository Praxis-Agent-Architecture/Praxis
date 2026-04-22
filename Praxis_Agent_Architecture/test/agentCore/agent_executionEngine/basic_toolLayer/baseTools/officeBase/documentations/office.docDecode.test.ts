import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planDocDecode } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docDecode.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docDecode.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docDecode.md",
  testFileUrl: import.meta.url,
});

test("planDocDecode creates a guarded dry-run document decode plan", () => {
  const result = planDocDecode({
    target: {
      documentPath: "/docs/report.docx",
      extractStructure: true,
      maxCharacters: 5000,
    },
    context: {
      invocationId: "doc-decode-1",
      allowedDocumentRoots: ["/docs"],
      grantedPermissions: ["filesystem:read", "office:document:decode"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.docDecode");
  assert.equal(result.output.target.format, "docx");
  assert.equal(result.output.decodePlan.parserHint, "openxml");
  assert.equal(result.output.decodePlan.mutatesDocument, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.structure, []);
  assert.equal(result.audit[0]?.invocationId, "doc-decode-1");
});

test("planDocDecode rejects missing path, unsupported format, and invalid size limits", () => {
  const missing = planDocDecode();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_DOCUMENT_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsupported = planDocDecode({ target: { documentPath: "/docs/report.pages" } });

  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "UNSUPPORTED_DOCUMENT_FORMAT");
  }

  const invalidLimit = planDocDecode({
    target: { documentPath: "/docs/report.docx", maxCharacters: 0 },
  });

  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) {
    assert.equal(invalidLimit.error.code, "INVALID_MAX_CHARACTERS");
  }
});

test("planDocDecode blocks scope gaps, permission gaps, and real execution", () => {
  const deniedScope = planDocDecode({
    target: { documentPath: "/private/report.docx" },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_REJECTED");
  }

  const traversalScope = planDocDecode({
    target: { documentPath: "/docs/../private/report.docx" },
    context: { allowedDocumentRoots: ["/docs"] },
  });

  assert.equal(traversalScope.ok, false);
  if (!traversalScope.ok) {
    assert.equal(traversalScope.error.code, "SCOPE_REJECTED");
  }

  const permission = planDocDecode({
    target: { documentPath: "/docs/report.docx" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planDocDecode({
    target: { documentPath: "/docs/report.docx" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
