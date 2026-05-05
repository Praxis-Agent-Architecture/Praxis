import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codeActionsWithLspRuntime,
  completeWithLspRuntime,
  formatDocumentWithLspRuntime,
  formatRangeWithLspRuntime,
  hoverWithLspRuntime,
  inspectDiagnosticsWithLspRuntime,
  signatureHelpWithLspRuntime,
} from "../../../../../../../src/storagePool/baseToolStorage/codeBase/lsp/_shared/runtime.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

async function withFakeWorkspace<T>(
  resultsByMethod: Readonly<Record<string, unknown>>,
  run: (workspaceRoot: string, targetPath: string, runtime: Parameters<typeof completeWithLspRuntime>[1]) => Promise<T>,
): Promise<T> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-shared-"));
  const targetPath = path.join(workspaceRoot, "example.fake");
  await writeFile(targetPath, "function example(value) { return value; }\n", "utf8");

  try {
    return await run(workspaceRoot, targetPath, {
      workspaceRoot,
      server: {
        command: process.execPath,
        args: ["-e", fakeLspServerSource(resultsByMethod)],
        languageId: "fake",
        fileExtensions: [".fake"],
      },
    });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test("shared LSP runtime normalizes completion, signature and hover responses", async () => {
  await withFakeWorkspace(
    {
      "textDocument/completion": {
        items: [{ label: "example", kind: 3, detail: "function example(value)" }],
      },
      "textDocument/signatureHelp": {
        signatures: [{ label: "example(value: string)", parameters: [{ label: "value" }] }],
        activeSignature: 0,
        activeParameter: 0,
      },
      "textDocument/hover": {
        contents: { kind: "markdown", value: "function example(value)" },
        range: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
      },
    },
    async (_workspaceRoot, targetPath, runtime) => {
      const target = { filePath: targetPath, line: 0, character: 11, languageId: "fake" };
      const completions = await completeWithLspRuntime(target, { ...runtime, maxItems: 5 });
      const signatures = await signatureHelpWithLspRuntime(target, runtime);
      const hover = await hoverWithLspRuntime(target, runtime);

      assert.equal(completions[0]?.label, "example");
      assert.equal(signatures.signatures[0]?.label, "example(value: string)");
      assert.equal(hover?.contents, "function example(value)");
    },
  );
});

test("shared LSP runtime normalizes formatting and code action previews", async () => {
  await withFakeWorkspace(
    {
      "textDocument/formatting": [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
          newText: "function",
        },
      ],
      "textDocument/rangeFormatting": [
        {
          range: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
          newText: "sample",
        },
      ],
      "textDocument/codeAction": [
        {
          title: "Add missing import",
          kind: "quickfix",
          edit: { changes: {} },
        },
      ],
    },
    async (_workspaceRoot, targetPath, runtime) => {
      const documentEdits = await formatDocumentWithLspRuntime(
        { filePath: targetPath, languageId: "fake" },
        { tabSize: 2, insertSpaces: true },
        runtime,
      );
      const rangeEdits = await formatRangeWithLspRuntime(
        { filePath: targetPath, languageId: "fake" },
        { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
        { tabSize: 2, insertSpaces: true },
        runtime,
      );
      const actions = await codeActionsWithLspRuntime(
        {
          filePath: targetPath,
          languageId: "fake",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
        },
        runtime,
      );

      assert.equal(documentEdits[0]?.newText, "function");
      assert.equal(rangeEdits[0]?.newText, "sample");
      assert.equal(actions[0]?.title, "Add missing import");
      assert.equal(actions[0]?.editAvailable, true);
    },
  );
});

test("shared LSP runtime captures publishDiagnostics notifications", async () => {
  await withFakeWorkspace(
    {
      "textDocument/publishDiagnostics": [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
          message: "example diagnostic",
          severity: 2,
          source: "fake-lsp",
        },
      ],
    },
    async (_workspaceRoot, targetPath, runtime) => {
      const diagnostics = await inspectDiagnosticsWithLspRuntime(
        { filePath: targetPath, languageId: "fake" },
        { ...runtime, waitMs: 10 },
      );

      assert.equal(diagnostics[0]?.message, "example diagnostic");
      assert.equal(diagnostics[0]?.severity, "warning");
    },
  );
});
