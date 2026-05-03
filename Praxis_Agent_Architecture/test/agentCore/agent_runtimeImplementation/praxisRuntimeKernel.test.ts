import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import { createChatGPTCodexAuthEnvelope } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/codexAuth.js";
import { createCredentialRef } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { createRuntimeBaseToolExecutorPort } from "../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  PraxisAgent,
  harness,
  loop,
  model,
  policy,
  tool,
  tools,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";
import { createPraxisRuntimeKernel } from "../../../src/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.js";
import { createInMemorySessionStateEventStore } from "../../../src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.md",
  testFileUrl: import.meta.url,
});

function authEnvelope() {
  const ref = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) throw new Error("expected credential ref");

  return createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "codex-access-token-secret",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "workspace-secret-id",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

class PlainAgent extends PraxisAgent {
  identity = "agent.plain";
  model = model("gpt-5.4", { carrierId: "carrier.plain" });
  harness = harness({
    policy: policy({ allowProviderCall: true }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
  });
}

test("PraxisRuntimeKernel.run compiles an Agent and returns a codex responses text output", async () => {
  const store = createInMemorySessionStateEventStore();
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-test", store });
  const result = await kernel.run(new PlainAgent(), "say hello", {
    sessionId: "session-plain",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () => ({ output_text: "hello from live model shim" }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from live model shim");
  assert.equal(result.modelCalls.length, 1);
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.state.session?.status, "completed");
  assert.equal(result.state.events.some((event) => event.type === "runtime.output.final"), true);
});

test("PraxisRuntimeKernel.run extracts final text from real codex responses SSE shape", async () => {
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-sse" });
  const result = await kernel.run(new PlainAgent(), "say hello", {
    sessionId: "session-sse",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () =>
      [
        'event: response.created',
        'data: {"type":"response.created","response":{"output":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"praxis-runtime-real-ok"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"praxis-runtime-real-ok"}]}]}}',
        '',
      ].join("\n"),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "praxis-runtime-real-ok");
});

test("PraxisRuntimeKernel.run extracts tool calls from codex responses SSE completion output", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sse-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from sse tool\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.sse-tool";
    model = model("gpt-5.4", { carrierId: "carrier.sse-tool" });
    harness = harness({
      tools: tools([tool("code.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sse-tool",
    sessionId: "session-sse-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sse-tool" }).run(new ToolAgent(), "read notes", {
    sessionId: "session-sse-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return [
          "event: response.output_item.added",
          `data: ${JSON.stringify({
            type: "response.output_item.added",
            item: {
              type: "function_call",
              name: "praxis_tool_code_read",
              call_id: "sse-tool-call-incomplete",
              arguments: "",
            },
          })}`,
          "",
          "event: response.function_call_arguments.delta",
          'data: {"type":"response.function_call_arguments.delta","delta":"{\\"targetPath\\":\\"wrong.txt\\"}"}',
          "",
          "event: response.completed",
          `data: ${JSON.stringify({
            type: "response.completed",
            response: {
              output: [{
                type: "function_call",
                name: "code.read",
                call_id: "sse-tool-call-1",
                arguments: JSON.stringify({
                  workspaceRoot: workspace,
                  targetPath: "notes.txt",
                  dryRun: false,
                  context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
                }),
              }],
            },
          })}`,
          "",
        ].join("\n");
      }
      return [
        "event: response.output_text.delta",
        'data: {"type":"response.output_text.delta","delta":"read needle from sse tool"}',
        "",
      ].join("\n");
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.finalOutput, "read needle from sse tool");
});

test("PraxisRuntimeKernel.run deduplicates streamed tool calls by call id", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sse-dedupe-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from deduped sse tool\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.sse-dedupe-tool";
    model = model("gpt-5.4", { carrierId: "carrier.sse-dedupe-tool" });
    harness = harness({
      tools: tools([tool("code.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sse-dedupe-tool",
    sessionId: "session-sse-dedupe-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const completedToolCall = {
    type: "function_call",
    name: "praxis_tool_code_read",
    call_id: "sse-tool-call-1",
    arguments: JSON.stringify({
      workspaceRoot: workspace,
      targetPath: "notes.txt",
      dryRun: false,
      context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
    }),
  };
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sse-dedupe-tool" }).run(new ToolAgent(), "read notes", {
    sessionId: "session-sse-dedupe-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return [
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: completedToolCall })}`,
          "",
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [completedToolCall] } })}`,
          "",
        ].join("\n");
      }
      return { output_text: "read deduped sse tool once" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.callId, "sse-tool-call-1");
  assert.equal(result.finalOutput, "read deduped sse tool once");
});

test("PraxisRuntimeKernel.run gives colliding tool ids unique provider names", async () => {
  class ToolAgent extends PraxisAgent {
    identity = "agent.tool-name-collision";
    model = model("gpt-5.4", { carrierId: "carrier.tool-name-collision" });
    harness = harness({
      tools: tools([
        tool("code.read"),
        tool("code_read"),
      ]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  let capturedBody: unknown;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-name-collision" }).run(new ToolAgent(), "list tools", {
    sessionId: "session-tool-name-collision",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async (envelope) => {
      capturedBody = envelope.body;
      return { output_text: "tools listed" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(typeof capturedBody, "object");
  assert.notEqual(capturedBody, null);
  const body = capturedBody as { tools?: readonly { name?: string }[] };
  assert.deepEqual(body.tools?.map((item) => item.name), [
    "praxis_tool_code_read",
    "praxis_tool_code_read_2",
    "praxis_ephemeral_procedure",
    "praxis_request_approval",
  ]);
});

test("PraxisRuntimeKernel.runManifest can execute a model requested baseTool and feed the result back", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from runtime kernel\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.tool";
    model = model("gpt-5.4", { carrierId: "carrier.tool" });
    harness = harness({
      tools: tools([tool("code.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool",
    sessionId: "session-tool",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-tool" });
  const result = await kernel.run(new ToolAgent(), "read notes.txt", {
    sessionId: "session-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "code.read",
            call_id: "tool-call-1",
            arguments: JSON.stringify({
              workspaceRoot: workspace,
              targetPath: "notes.txt",
              dryRun: false,
              context: {
                workspaceRoot: workspace,
                allowedRoots: [workspace],
                dryRun: false,
              },
            }),
          }],
        };
      }
      return { output_text: "The file contains needle from runtime kernel." };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "The file contains needle from runtime kernel.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.toolCalls[0]?.toolId, "code.read");
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "assemblePromptPack"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "interpretModelDecision"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "invokeBaseTool"), true);
  assert.equal(result.state.invocations.some((record) => record.kind === "tool" && record.ok), true);
});

test("PraxisRuntimeKernel.runManifest executes EphemeralProcedure through mounted BaseTools", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from ephemeral procedure\n", "utf8");

  class ProcedureAgent extends PraxisAgent {
    identity = "agent.procedure";
    model = model("gpt-5.4", { carrierId: "carrier.procedure" });
    harness = harness({
      tools: tools([tool("code.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-procedure",
    sessionId: "session-procedure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure" }).run(new ProcedureAgent(), "read notes by procedure", {
    sessionId: "session-procedure",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_ephemeral_procedure",
            call_id: "procedure-call-1",
            arguments: JSON.stringify({
              procedureId: "procedure-read",
              purpose: "read an existing file through code.read",
              executionMode: "serial",
              steps: [{
                stepId: "read",
                baseToolId: "code.read",
                input: {
                  workspaceRoot: workspace,
                  targetPath: "notes.txt",
                  dryRun: false,
                  context: {
                    workspaceRoot: workspace,
                    allowedRoots: [workspace],
                    dryRun: false,
                  },
                },
                riskLevel: "low",
              }],
            }),
          }],
        };
      }
      return { output_text: "procedure read needle from ephemeral procedure" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.callId, "procedure-read:read");
  assert.equal(result.toolCalls[0]?.toolId, "code.read");
  assert.equal(result.finalOutput, "procedure read needle from ephemeral procedure");
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "executeEphemeralProcedure"), true);
  assert.equal(result.state.invocations.some((record) => record.summary.procedureId === "procedure-read"), true);
});
