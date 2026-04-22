import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  officeDocRipgrepDescriptor,
  planOfficeDocRipgrep,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docRipgrep.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docRipgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/officeBase/documentations/office.docRipgrep.md",
  testFileUrl: import.meta.url,
});

test("planOfficeDocRipgrep creates a guarded dry-run document search envelope", async () => {
  const result = await planOfficeDocRipgrep({
    documentPath: " docs/spec.docx ",
    query: " AgentCore ",
    maxMatches: 3,
    caseSensitive: false,
    context: {
      toolCallId: "doc-rg-1",
      allowedDocumentRoots: ["docs"],
      requestedScopes: ["office.document.read"],
      allowedScopes: ["office.document.read"],
      grantedPermissions: ["filesystem:read", "office:read"],
    },
  });

  assert.equal(officeDocRipgrepDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected document ripgrep plan");
  }

  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.readsFileDirectly, false);
  assert.deepEqual(result.plan.commandPreview, [
    "office-doc-ripgrep",
    "--json",
    "--max-count",
    "3",
    "--fixed-strings",
    "--ignore-case",
    "--",
    "AgentCore",
    "docs/spec.docx",
  ]);
  assert.equal(result.audit.toolCallId, "doc-rg-1");
});

test("planOfficeDocRipgrep can use an injected executor envelope", async () => {
  const result = await planOfficeDocRipgrep({
    documentPath: "docs/spec.docx",
    query: "needle",
    context: { dryRun: false },
    executor: () => ({
      exitCode: 0,
      matches: [{ documentPath: "docs/spec.docx", line: 4, text: "needle" }],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected document ripgrep result");
  }

  assert.equal(result.plan.dispatch, "injected-executor");
  assert.equal(result.output?.matches[0]?.text, "needle");
  assert.equal(result.output?.unsafeSideEffects, false);
});

test("planOfficeDocRipgrep rejects missing query and scope violations", async () => {
  const missing = await planOfficeDocRipgrep({
    documentPath: "docs/spec.docx",
    query: " ",
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_QUERY");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = await planOfficeDocRipgrep({
    documentPath: "../secret.docx",
    query: "needle",
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "DOCUMENT_PATH_OUTSIDE_SCOPE");
    assert.equal(scoped.error.boundary, "scope");
  }
});
