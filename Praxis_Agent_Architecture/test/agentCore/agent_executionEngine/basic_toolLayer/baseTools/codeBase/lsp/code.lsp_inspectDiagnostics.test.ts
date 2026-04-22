import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectLspDiagnostics } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectDiagnostics.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectDiagnostics.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectDiagnostics.md",
  testFileUrl: import.meta.url,
});

test("code.lsp_inspectDiagnostics summarizes a supplied diagnostic snapshot", () => {
  const result = inspectLspDiagnostics({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    diagnostics: [
      {
        severity: "warning",
        message: "unused local",
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 8 },
        },
      },
      {
        severity: "error",
        message: "missing import",
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 6 },
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.tool, "code.lsp_inspectDiagnostics");
  assert.equal(result.snapshot.summary.total, 2);
  assert.equal(result.snapshot.summary.bySeverity.error, 1);
  assert.equal(result.snapshot.summary.bySeverity.warning, 1);
  assert.equal(result.snapshot.summary.highestSeverity, "error");
  assert.equal(result.snapshot.execution.lspServerInvoked, false);
});

test("code.lsp_inspectDiagnostics filters severities without provider calls", () => {
  const result = inspectLspDiagnostics({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    severities: ["warning"],
    diagnostics: [
      {
        severity: "warning",
        message: "unused local",
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 8 },
        },
      },
      {
        severity: "hint",
        message: "can simplify",
        range: {
          start: { line: 6, character: 2 },
          end: { line: 6, character: 10 },
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.summary.total, 1);
  assert.equal(result.snapshot.diagnostics[0]?.severity, "warning");
  assert.equal(result.snapshot.execution.lspServerInvoked, false);
});

test("code.lsp_inspectDiagnostics rejects inverted diagnostic ranges", () => {
  const result = inspectLspDiagnostics({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    diagnostics: [
      {
        severity: "error",
        message: "bad range",
        range: {
          start: { line: 8, character: 4 },
          end: { line: 7, character: 10 },
        },
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_DIAGNOSTICS");
  assert.equal(result.error.boundary, "input");
});
