import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planOfficeDocPosition } from "../../../../src/toolabilityPool/officeBase/documentations/office.docPosition.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/documentations/office.docPosition.ts",
  docPath: "docs/toolabilityPool/officeBase/documentations/office.docPosition.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocPosition creates a guarded locator dry-run plan", () => {
  const result = planOfficeDocPosition({
    target: {
      documentPath: "/workspace/docs/report.docx",
      query: { kind: "text", value: "Revenue", caseSensitive: true },
      maxMatches: 3,
    },
    context: {
      allowedDocumentRoots: ["/workspace/docs"],
      grantedPermissions: ["filesystem:read", "office:document:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected office.docPosition dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.office.docPosition");
  assert.equal(result.output.target.query.value, "Revenue");
  assert.equal(result.output.locatorPlan.parser, "office-document-positioner-v1");
  assert.deepEqual(result.output.locatorPlan.matches, []);
});

test("planOfficeDocPosition rejects missing query and invalid regex", () => {
  const missingQuery = planOfficeDocPosition({
    target: { documentPath: "/workspace/docs/report.docx" },
  });

  assert.equal(missingQuery.ok, false);
  if (!missingQuery.ok) {
    assert.equal(missingQuery.error.code, "MISSING_QUERY");
  }

  const invalidRegex = planOfficeDocPosition({
    target: {
      documentPath: "/workspace/docs/report.docx",
      query: { kind: "regex", value: "[" },
    },
  });

  assert.equal(invalidRegex.ok, false);
  if (!invalidRegex.ok) {
    assert.equal(invalidRegex.error.code, "INVALID_REGEX_QUERY");
    assert.equal(invalidRegex.error.boundary, "input");
  }
});

test("planOfficeDocPosition enforces scope and dry-run guard", () => {
  const scoped = planOfficeDocPosition({
    target: {
      documentPath: "/outside/report.docx",
      query: { value: "Revenue" },
    },
    context: { allowedDocumentRoots: ["/workspace/docs"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "DOCUMENT_PATH_OUTSIDE_SCOPE");
  }

  const real = planOfficeDocPosition({
    target: {
      documentPath: "/workspace/docs/report.docx",
      query: { value: "Revenue" },
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
