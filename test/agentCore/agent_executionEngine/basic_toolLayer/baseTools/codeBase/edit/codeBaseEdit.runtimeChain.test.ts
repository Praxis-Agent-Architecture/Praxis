import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeCodeDelete } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.delete.js";
import { executeCodeFormat } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.format.js";
import { executeCodeModify } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.modify.js";
import { executeCodeOverwrite } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.overwrite.js";
import { executeCodeReplaceFile } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.replaceFile.js";
import { adaptRuntimeToolInvocation } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

type ChainInvokeResult = {
  ok: boolean;
  toolId: string;
  output?: Record<string, unknown>;
  error?: { code: string; publicSafe: true };
};

const runtimeId = "code-edit-runtime-chain-1";
const sessionId = "code-edit-session-chain-1";

function createMemoryExecutor(files: Record<string, string>, calls: string[]): BaseToolExecutorPort {
  return {
    filesystem: {
      async readText(request) {
        calls.push(`readText:${request.path}`);
        const content = files[request.path];
        if (content === undefined) {
          return { ok: false, error: { code: "FILE_NOT_FOUND", message: "missing private /tmp/path", publicSafe: true } };
        }
        return { ok: true, output: { content, truncated: false } };
      },
      async writeText(request) {
        calls.push(`writeText:${request.path}:${request.content}`);
        files[request.path] = request.content;
        return { ok: true, output: { bytesWritten: Buffer.byteLength(request.content, "utf8") } };
      },
      async deletePath(request) {
        calls.push(`deletePath:${request.path}:${request.recursive === true ? "recursive" : "single"}`);
        delete files[request.path];
        return { ok: true, output: { deleted: true } };
      },
    },
    lsp: {
      async formatDocumentPreview(request) {
        calls.push(`formatDocumentPreview:${request.target.filePath}`);
        return {
          ok: true,
          output: { edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "// formatted\n" }] },
        };
      },
      async formatRangePreview(request) {
        calls.push(`formatRangePreview:${request.target.filePath}`);
        return {
          ok: true,
          output: { edits: [{ range: { start: request.target.range.start, end: request.target.range.start }, newText: "// range\n" }] },
        };
      },
    },
  };
}

async function invokeThroughRuntimeChain(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  executor: BaseToolExecutorPort,
): Promise<ChainInvokeResult> {
  const toolCallId = `${toolId}:runtime-chain`;
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolId}`],
      allowedScopes: ["tool.execute", `tool.${toolId}`],
      auditMetadata: { test: "codeBaseEdit.runtimeChain" },
    },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  assert.equal(adapted.ok, true, `${toolId} must pass the runtime tool invocation adapter`);
  if (!adapted.ok) throw new Error(`${toolId} adapter failed`);

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "code-edit-runtime-chain-test", sessionId },
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolId,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });
  assert.equal(bridged.ok, true, `${toolId} must pass the execEngine invocation bridge`);
  if (!bridged.ok) throw new Error(`${toolId} bridge failed`);

  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true, `${toolId} must be mounted in the baseTool registry`);
  if (!lookup.ok) throw new Error(`${toolId} registry lookup failed`);

  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor }) as Promise<ChainInvokeResult>;
}

test("codeBase edit direct execution covers dry-run, real provider, missing provider, denied guard, malformed input, and provider failure", async () => {
  const dryRun = await executeCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/a.ts",
    searchText: "old",
    replacementText: "new",
  });
  assert.equal(dryRun.ok, true);
  if (dryRun.ok) assert.equal(dryRun.output.dryRun, true);

  const files = { "src/a.ts": "old old" };
  const calls: string[] = [];
  const provider = {
    async readText(request: { targetPath: string }) {
      calls.push(`read:${request.targetPath}`);
      return { content: files[request.targetPath as keyof typeof files], truncated: false };
    },
    async writeText(request: { targetPath: string; content: string }) {
      calls.push(`write:${request.targetPath}:${request.content}`);
      files[request.targetPath as keyof typeof files] = request.content;
      return { bytesWritten: request.content.length };
    },
  };
  const applied = await executeCodeModify({
    workspaceRoot: "/workspace",
    targetPath: "src/a.ts",
    searchText: "old",
    replacementText: "new",
    occurrence: "all",
    dryRun: false,
    guard: { allowed: true },
    provider,
  });
  assert.equal(applied.ok, true);
  assert.equal(files["src/a.ts"], "new new");
  assert.deepEqual(calls, ["read:src/a.ts", "write:src/a.ts:new new"]);

  const missingProvider = await executeCodeOverwrite({
    workspaceRoot: "/workspace",
    targetPath: "src/a.ts",
    content: "next",
    dryRun: false,
    guard: { allowed: true },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");

  const denied = await executeCodeDelete({
    workspaceRoot: "/workspace",
    targetPath: "src/a.ts",
    dryRun: false,
    guard: { allowed: false, reason: "blocked" },
    provider: {
      async deletePath() {
        throw new Error("must not dispatch");
      },
    },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "GOVERNANCE_REJECTED");

  const malformed = await executeCodeFormat({ workspaceRoot: "/workspace", targetPath: "../outside.ts" });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "TARGET_OUT_OF_SCOPE");

  const providerFailure = await executeCodeReplaceFile({
    targetPath: "src/a.ts",
    newContent: "next",
    dryRun: false,
    guard: { allowed: true },
    provider: {
      async writeText() {
        throw new Error("leaked /secret/path and command details");
      },
    },
  });
  assert.equal(providerFailure.ok, false);
  if (!providerFailure.ok) {
    assert.equal(providerFailure.error.code, "PROVIDER_FAILURE");
    assert.equal(providerFailure.error.safeForRuntimeInspection, true);
    assert.match(providerFailure.error.message, /provider failed/);
    assert.doesNotMatch(providerFailure.error.message, /secret|command|path/);
  }
});

test("codeBase edit runtime chain reaches runtime support ports through registry handlers", async () => {
  const calls: string[] = [];
  const files: Record<string, string> = {
    "src/replace.ts": "before",
    "src/overwrite.ts": "before",
    "src/modify.ts": "old value",
    "src/delete-range.ts": "a\nb\nc",
    "src/format.ts": "const x=1;\n",
    "src/delete.ts": "gone",
  };
  const executor = createMemoryExecutor(files, calls);
  const context = { dryRun: false, guard: { allowed: true }, workspaceRoot: "/workspace" } as const;
  const cases: Array<{ toolId: string; input: Readonly<Record<string, unknown>>; expectedCall: string }> = [
    { toolId: "code.replaceFile", input: { targetPath: "src/replace.ts", newContent: "after", context }, expectedCall: "writeText:src/replace.ts:after" },
    { toolId: "code.overwrite", input: { workspaceRoot: "/workspace", targetPath: "src/overwrite.ts", content: "after", context }, expectedCall: "writeText:src/overwrite.ts:after" },
    { toolId: "code.modify", input: { workspaceRoot: "/workspace", targetPath: "src/modify.ts", searchText: "old", replacementText: "new", context }, expectedCall: "writeText:src/modify.ts:new value" },
    { toolId: "code.delete", input: { workspaceRoot: "/workspace", targetPath: "src/delete.ts", deleteKind: "file", context }, expectedCall: "deletePath:src/delete.ts:single" },
    { toolId: "code.format", input: { workspaceRoot: "/workspace", targetPath: "src/format.ts", languageHint: "typescript", context }, expectedCall: "formatDocumentPreview:src/format.ts" },
  ];

  for (const testCase of cases) {
    const before = calls.length;
    const result = await invokeThroughRuntimeChain(testCase.toolId, testCase.input, executor);
    assert.equal(result.ok, true, `${testCase.toolId} should complete through the runtime chain: ${JSON.stringify(result)}`);
    assert.ok(calls.slice(before).includes(testCase.expectedCall), `${testCase.toolId} should call ${testCase.expectedCall}`);
  }
});

test("codeBase edit registry chain rejects missing providers and denied guards before provider dispatch", async () => {
  const missingProvider = await invokeThroughRuntimeChain(
    "code.modify",
    { workspaceRoot: "/workspace", targetPath: "src/a.ts", searchText: "old", replacementText: "new", context: { dryRun: false, guard: { allowed: true } } },
    {},
  );
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.error?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(missingProvider.error?.publicSafe, true);

  const calls: string[] = [];
  const denied = await invokeThroughRuntimeChain(
    "code.overwrite",
    { workspaceRoot: "/workspace", targetPath: "src/a.ts", content: "new", context: { dryRun: false, guard: { allowed: false, reason: "blocked" } } },
    createMemoryExecutor({ "src/a.ts": "old" }, calls),
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, "GOVERNANCE_REJECTED");
  assert.equal(calls.some((call) => call.startsWith("writeText:src/a.ts")), false, "denied guard must reject before provider dispatch");
});
