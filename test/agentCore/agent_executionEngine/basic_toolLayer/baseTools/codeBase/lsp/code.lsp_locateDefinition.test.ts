import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  locateLspDefinition,
  lspLocateDefinitionHandler,
  selectLspLocateDefinitionPractice,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.md",
  testFileUrl: import.meta.url,
});

test("locateLspDefinition returns an auditable dry-run location without calling a provider", async () => {
  let providerCalled = false;

  const result = await locateLspDefinition({
    target: { filePath: "src/example.ts", line: 3, character: 8 },
    context: { invocationId: "definition-1" },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.locateDefinition");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.locations[0]?.filePath, "src/example.ts");
  assert.equal(result.audit[0]?.invocationId, "definition-1");
});

test("locateLspDefinition classifies input and scope errors", async () => {
  const missing = await locateLspDefinition();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_FILE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = await locateLspDefinition({
    target: { filePath: "src/outside.ts", line: 0, character: 0 },
    context: { allowedFilePaths: ["src/inside.ts"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }
});

test("locateLspDefinition uses an injected provider only when dryRun is disabled", async () => {
  const result = await locateLspDefinition({
    target: { filePath: "src/example.ts", line: 3, character: 8 },
    context: { dryRun: false },
    provider: (target) => [
      {
        filePath: "src/definition.ts",
        range: {
          start: { line: target.line + 1, character: 0 },
          end: { line: target.line + 1, character: 12 },
        },
        symbolName: "Example",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.locations[0]?.filePath, "src/definition.ts");
  assert.equal(Object.isFrozen(result.output.locations), true);
});

test("locateLspDefinition can execute through the host LSP executor best practice", async () => {
  const selection = selectLspLocateDefinitionPractice({
    executor: {
      lsp: {
        locateDefinition: async ({ target }) => ({
          ok: true,
          output: {
            locations: [
              {
                filePath: "src/host-definition.ts",
                range: {
                  start: { line: target.line + 2, character: 1 },
                  end: { line: target.line + 2, character: 9 },
                },
                symbolName: "FromHost",
              },
            ],
          },
        }),
      },
    },
  });

  assert.equal(selection.providerName, "anthropic");
  assert.equal(selection.practice.directCliSupport, true);

  const result = await locateLspDefinition({
    target: { filePath: "src/example.ts", line: 1, character: 4 },
    context: { dryRun: false, invocationId: "definition-host" },
    executor: {
      lsp: {
        locateDefinition: async ({ target }) => ({
          ok: true,
          output: {
            locations: [
              {
                filePath: "src/host-definition.ts",
                range: {
                  start: { line: target.line + 2, character: 1 },
                  end: { line: target.line + 2, character: 9 },
                },
                symbolName: "FromHost",
              },
            ],
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.locations[0]?.filePath, "src/host-definition.ts");
  assert.equal(result.audit[0]?.metadata?.selectedPractice, "anthropic");
});

test("lspLocateDefinitionHandler adapts BaseToolInvokeRequest to the best practice layer", async () => {
  const result = await lspLocateDefinitionHandler.invoke({
    toolCallId: "call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { filePath: "src/example.ts", line: 2, character: 3 },
      context: { dryRun: false },
    },
    executor: {
      lsp: {
        locateDefinition: async () => ({
          ok: true,
          output: {
            locations: [
              {
                filePath: "src/handler-definition.ts",
                range: {
                  start: { line: 9, character: 0 },
                  end: { line: 9, character: 7 },
                },
              },
            ],
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.toolId, "code.lsp_locateDefinition");
  assert.equal(result.output.locations[0]?.filePath, "src/handler-definition.ts");
  assert.equal(result.metadata?.audit !== undefined, true);
});

test("locateLspDefinition can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-runtime-"));
  const targetPath = path.join(workspaceRoot, "example.fake");
  await writeFile(targetPath, "function example() { return 1; }\n", "utf8");

  const fakeLspServer = `
let buffer = Buffer.alloc(0);
function send(id, result) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write("Content-Length: " + Buffer.byteLength(body, "utf8") + "\\r\\n\\r\\n" + body);
}
function drain() {
  const separator = Buffer.from("\\r\\n\\r\\n");
  while (true) {
    const headerEnd = buffer.indexOf(separator);
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) throw new Error("missing length");
    const start = headerEnd + separator.length;
    const end = start + Number(match[1]);
    if (buffer.length < end) return;
    const message = JSON.parse(buffer.subarray(start, end).toString("utf8"));
    buffer = buffer.subarray(end);
    if (message.method === "initialize") {
      send(message.id, { capabilities: { definitionProvider: true } });
    } else if (message.method === "textDocument/definition") {
      send(message.id, {
        uri: message.params.textDocument.uri,
        range: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
      });
    } else if (message.method === "shutdown") {
      send(message.id, null);
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
}
process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
`;

  try {
    const result = await locateLspDefinition({
      target: { filePath: targetPath, line: 0, character: 9, languageId: "fake" },
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        timeoutMs: 5_000,
        server: {
          command: process.execPath,
          args: ["-e", fakeLspServer],
          languageId: "fake",
          fileExtensions: [".fake"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.locations[0]?.filePath, targetPath);
    assert.equal(result.output.locations[0]?.range.start.character, 9);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
