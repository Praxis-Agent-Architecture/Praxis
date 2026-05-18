import { defineAgentCoreContractTest } from "../../../agentCore/agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeDocVisionCheckDescriptor,
  planOfficeDocVisionCheck,
} from "../../../../src/toolabilityPool/officeBase/documentations/office.docVisionCheck.js";

defineAgentCoreContractTest({
  sourcePath: "src/toolabilityPool/officeBase/documentations/office.docVisionCheck.ts",
  docPath: "docs/toolabilityPool/officeBase/documentations/office.docVisionCheck.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocVisionCheck creates a guarded visual inspection envelope", async () => {
  const result = await planOfficeDocVisionCheck({
    documentPath: "docs/spec.docx",
    checks: ["layout", "text-legibility"],
    pages: [1, 2, 2],
    renderProfile: "print",
    context: {
      toolCallId: "doc-vision-1",
      allowedDocumentRoots: ["docs"],
      requestedScopes: ["office.document.vision"],
      allowedScopes: ["office.document.vision"],
      grantedPermissions: ["filesystem:read", "office:read", "vision:inspect"],
    },
  });

  assert.equal(officeDocVisionCheckDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected document vision plan");
  }

  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.callsVisionProviderDirectly, false);
  assert.deepEqual(result.plan.pages, [1, 2]);
  assert.deepEqual(result.plan.checks, ["layout", "text-legibility"]);
  assert.equal(result.audit.toolCallId, "doc-vision-1");
});

test("planOfficeDocVisionCheck can use an injected inspector envelope", async () => {
  const result = await planOfficeDocVisionCheck({
    documentPath: "docs/spec.docx",
    context: { dryRun: false },
    inspector: ({ pages }) => ({
      renderedPages: pages,
      summary: "ok",
      issues: [{ page: 1, check: "layout", severity: "info", message: "layout rendered" }],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected vision inspection");
  }

  assert.equal(result.plan.dispatch, "injected-inspector");
  assert.equal(result.output?.summary, "ok");
  assert.equal(result.output?.issues[0]?.severity, "info");
});

test("planOfficeDocVisionCheck rejects invalid page ranges and missing inspector", async () => {
  const invalidPage = await planOfficeDocVisionCheck({
    documentPath: "docs/spec.docx",
    pages: [0],
  });

  assert.equal(invalidPage.ok, false);
  if (!invalidPage.ok) {
    assert.equal(invalidPage.error.code, "INVALID_PAGE_RANGE");
  }

  const missingInspector = await planOfficeDocVisionCheck({
    documentPath: "docs/spec.docx",
    context: { dryRun: false },
  });

  assert.equal(missingInspector.ok, false);
  if (!missingInspector.ok) {
    assert.equal(missingInspector.error.code, "INSPECTOR_NOT_INJECTED");
    assert.equal(missingInspector.error.boundary, "execution");
  }
});
