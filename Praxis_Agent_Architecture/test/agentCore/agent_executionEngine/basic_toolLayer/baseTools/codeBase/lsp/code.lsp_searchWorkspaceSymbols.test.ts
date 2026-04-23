import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { searchLspWorkspaceSymbols } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.md",
  testFileUrl: import.meta.url,
});

test("searchLspWorkspaceSymbols returns a dry-run workspace symbol envelope", async () => {
  const result = await searchLspWorkspaceSymbols({ query: "AgentRuntime", limit: 10 });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.searchWorkspaceSymbols");
  assert.equal(result.output.query, "AgentRuntime");
  assert.equal(result.output.limit, 10);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.permissionsRequired, ["workspace:read", "lsp:read"]);
});

test("searchLspWorkspaceSymbols rejects blank queries before provider dispatch", async () => {
  let providerCalled = false;

  const result = await searchLspWorkspaceSymbols({
    query: " ",
    context: { dryRun: false },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_SYMBOL_NAME");
    assert.equal(result.error.boundary, "input");
  }
});

test("searchLspWorkspaceSymbols can call an injected provider when dry-run is disabled", async () => {
  const result = await searchLspWorkspaceSymbols({
    query: "Agent",
    context: { dryRun: false, invocationId: "workspace-symbols-1" },
    provider: () => [
      {
        name: "AgentRuntime",
        kind: "class",
        detail: "runtime surface",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.symbols[0]?.name, "AgentRuntime");
  assert.equal(result.output.symbols[0]?.source, "provider");
  assert.equal(result.audit[0]?.invocationId, "workspace-symbols-1");
});

test("searchLspWorkspaceSymbols can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-workspace-symbols-"));

  try {
    const result = await searchLspWorkspaceSymbols({
      query: "Agent",
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "workspace/symbol": [
                {
                  name: "AgentRuntime",
                  kind: 5,
                  location: {
                    uri: `file://${path.join(workspaceRoot, "agent.fake")}`,
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
                  },
                },
              ],
            }),
          ],
          languageId: "fake",
          fileExtensions: [".fake"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.symbols[0]?.name, "AgentRuntime");
      assert.equal(result.output.symbols[0]?.source, "provider");
      assert.equal(result.output.providerCalled, true);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("searchLspWorkspaceSymbols can auto-resolve a workspace-level server without explicit runtime.server", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-workspace-auto-"));
  const fakeBinRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-bin-"));
  const fakeServerPath = path.join(fakeBinRoot, "typescript-language-server");
  const previousPath = process.env.PATH;

  await writeFile(path.join(workspaceRoot, "package.json"), '{ "name": "workspace-auto-resolve" }\n', "utf8");
  await writeFile(
    fakeServerPath,
    `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  console.log("typescript-language-server 0.0-test");
  process.exit(0);
}
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
    if (!match) throw new Error("missing Content-Length");
    const bodyStart = headerEnd + separator.length;
    const bodyEnd = bodyStart + Number(match[1]);
    if (buffer.length < bodyEnd) return;
    const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
    buffer = buffer.subarray(bodyEnd);
    if (message.method === "initialize") {
      send(message.id, { capabilities: { workspaceSymbolProvider: true } });
    } else if (message.method === "workspace/symbol") {
      send(message.id, [{
        name: "AgentWorkspaceRuntime",
        kind: 5,
        location: {
          uri: "file://${path.join(workspaceRoot, "agent.ts")}",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } }
        }
      }]);
    } else if (message.method === "shutdown") {
      send(message.id, null);
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
`,
    "utf8",
  );
  await chmod(fakeServerPath, 0o755);

  process.env.PATH = `${fakeBinRoot}:${previousPath ?? ""}`;

  try {
    const result = await searchLspWorkspaceSymbols({
      query: "AgentWorkspace",
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.symbols[0]?.name, "AgentWorkspaceRuntime");
      assert.equal(result.output.providerCalled, true);
    }
  } finally {
    process.env.PATH = previousPath;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(fakeBinRoot, { recursive: true, force: true });
  }
});
