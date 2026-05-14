import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  compileAgent,
  harness,
  loop,
  model,
  policy,
  sandbox as sandboxHelper,
  session,
  storage as storageHelper,
  tool,
  toolPolicies,
  tools,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";
import { createPraxisRuntimeKernel } from "../../../src/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.js";
import { createInMemorySessionStateEventStore } from "../../../src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.md",
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
    providerCaller: async () => ({
      output_text: "hello from live model shim",
      usage: {
        input_tokens: 21,
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 3 },
      },
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from live model shim");
  assert.equal(result.modelCalls.length, 1);
  assert.equal(result.modelCalls[0]?.usage?.inputTokens, 21);
  assert.equal(result.modelCalls[0]?.usage?.outputTokens, 5);
  assert.equal(result.modelCalls[0]?.usage?.thinkingTokens, 3);
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.state.session?.status, "completed");
  assert.equal(result.state.events.some((event) => event.type === "runtime.output.final"), true);
});

test("PraxisRuntimeKernel.runManifest uses .rax_workspace SQLite storage by default", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-storage-"));

  class SqliteAgent extends PraxisAgent {
    identity = "agent.kernel-sqlite";
    model = model("gpt-5.4", { carrierId: "carrier.kernel-sqlite" });
    session = session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(SqliteAgent, {
    compiledAt: "2026-05-05T00:00:00.000Z",
    manifestId: "manifest.kernel-sqlite",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-sqlite" }).runManifest(
    compiled.manifest,
    "say hello",
    {
      sessionId: "session-kernel-sqlite",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => ({ output_text: "hello from sqlite-backed run" }),
      storage: {
        cwd: workspace,
        homeDir: path.join(workspace, "home"),
        initMode: "on-run",
      },
      now: () => "2026-05-05T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sqlitePath = path.join(workspace, ".rax_workspace", "sessions", "praxis.sqlite");
  const storageMetadata = result.state.session?.metadata.storage as Record<string, unknown> | undefined;
  assert.equal(existsSync(sqlitePath), true);
  assert.equal(storageMetadata?.workspaceRef, "rax.workspace");
  assert.equal(JSON.stringify(result.state.session?.metadata).includes("codex-access-token-secret"), false);
});

test("PraxisRuntimeKernel.runManifest fails before model invocation when sandbox provider is unavailable", async () => {
  class MissingSandboxAgent extends PraxisAgent {
    identity = "agent.missing-sandbox";
    model = model("gpt-5.4", { carrierId: "carrier.missing-sandbox" });
    storage = storageHelper.memory();
    sandbox = sandboxHelper.linuxBubblewrap({
      dependencyRefs: ["binary:praxis-missing-bwrap-for-test"],
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  let providerCalls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-missing-sandbox" }).run(
    new MissingSandboxAgent(),
    "say hello",
    {
      sessionId: "session-missing-sandbox",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => {
        providerCalls += 1;
        return { output_text: "should not run" };
      },
      now: () => "2026-05-06T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, false);
  assert.equal(providerCalls, 0);
  if (result.ok) return;
  assert.equal(result.error.code, "SANDBOX_UNAVAILABLE");
  assert.equal(result.state?.events.some((event) => event.type === "runtime.sandboxPlane.prepared"), true);
  assert.equal(result.state?.session?.status, "failed");
});

test("PraxisRuntimeKernel routes pending approvals through interface envelopes", async () => {
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-approval-interface" }).run(
    new PlainAgent(),
    "ask for approval",
    {
      sessionId: "session-approval-interface",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => ({
        output: [{
          type: "function_call",
          name: "praxis_request_approval",
          call_id: "approval-call-1",
          arguments: JSON.stringify({
            reason: "need a human decision",
            requestedScopes: ["tool.shell.commandExecution"],
            riskLevel: "high",
          }),
        }],
      }),
      now: () => "2026-05-06T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.approvals.length, 1);
  const interfaceEvent = result.state?.events.find((event) => event.type === "runtime.interfaceAdapter.approval.envelope");
  assert.notEqual(interfaceEvent, undefined);
  assert.equal(JSON.stringify(interfaceEvent?.payload).includes("\"kind\":\"approval\""), true);
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
    toolPolicy = toolPolicies.bapr();
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
    toolPolicy = toolPolicies.bapr();
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

test("PraxisRuntimeKernel.runManifest gives colliding tool ids unique provider names", async () => {
  class ToolAgent extends PraxisAgent {
    identity = "agent.tool-name-collision";
    model = model("gpt-5.4", { carrierId: "carrier.tool-name-collision" });
    harness = harness({
      tools: tools([
        tool("code.read"),
      ]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(new ToolAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const manifestWithLegacyCollision = {
    ...compiled.manifest,
    harness: {
      ...compiled.manifest.harness,
      tools: [
        ...compiled.manifest.harness.tools,
        tool("code_read", { family: "codeBase", group: "explore" }),
      ],
    },
  };

  let capturedBody: unknown;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-name-collision" }).runManifest(manifestWithLegacyCollision, "list tools", {
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
  const body = capturedBody as {
    input?: readonly {
      role?: string;
      content?: readonly { text?: string }[];
    }[];
    tools?: readonly { name?: string }[];
  };
  const providerBodyText = JSON.stringify(body);
  assert.match(providerBodyText, /Praxis BaseTool calling protocol/);
  assert.match(providerBodyText, /declared function calls/);
  assert.match(providerBodyText, /runtime mounted BaseTools=code\.read, code_read/);
  assert.match(providerBodyText, /baseTool context mode=autoFolded/);
  assert.match(providerBodyText, /Praxis BaseTools are runtime-governed tools grouped by family, group, and toolId/);
  assert.match(providerBodyText, /BaseTool family: codeBase/);
  assert.deepEqual(body.tools?.map((item) => item.name), [
    "praxis_tool_code_read",
    "praxis_tool_code_read_2",
    "praxis_ephemeral_procedure",
    "praxis_request_approval",
    "praxis_expand_tool_context",
  ]);
});

test("PraxisRuntimeKernel.runManifest lets the model expand folded BaseTool context", async () => {
  class ExpandContextAgent extends PraxisAgent {
    identity = "agent.expand-context";
    model = model("gpt-5.4", { carrierId: "carrier.expand-context" });
    harness = harness({
      tools: tools([
        tool("shell.commandExecution", {
          family: "shellBase",
          group: "shellExecution",
          description: "Run a governed shell command.",
        }),
      ]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 0 }),
    });
  }

  const compiled = compileAgent(ExpandContextAgent, {
    compiledAt: "2026-05-09T00:00:00.000Z",
    manifestId: "manifest.expand-context",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const bodies: unknown[] = [];
  let callCount = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-expand-context" }).runManifest(
    compiled.manifest,
    "find the right shell tool manual",
    {
      sessionId: "session-expand-context",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async (envelope) => {
        callCount += 1;
        bodies.push(envelope.body);
        if (callCount === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_expand_tool_context",
              call_id: "expand-shell-execution",
              arguments: JSON.stringify({
                targetKind: "group",
                family: "shellBase",
                group: "shellExecution",
                reason: "need concrete shell execution manual",
              }),
            }],
          };
        }
        return { output_text: "expanded shell context was visible" };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "expanded shell context was visible");
  const secondBodyText = JSON.stringify(bodies[1]);
  assert.match(secondBodyText, /BaseTool group: shellBase\/shellExecution/);
  assert.match(secondBodyText, /shell\.commandExecution/);
  assert.match(secondBodyText, /function_call_output/);
  assert.match(secondBodyText, /expand-shell-execution/);
  assert.equal(result.mainLoopSteps.some((step) => step.metadata.runtimeDecision === "expandToolContext"), true);
});

test("PraxisRuntimeKernel.runManifest can execute a model requested baseTool and feed the result back", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from runtime kernel\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.tool";
    model = model("gpt-5.4", { carrierId: "carrier.tool" });
    toolPolicy = toolPolicies.bapr();
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
  const providerBodies: unknown[] = [];
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
    providerCaller: async (envelope) => {
      calls += 1;
      providerBodies.push(envelope.body);
      if (calls === 1) {
        const toolItem = {
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
          };
        return [
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "reasoning", id: "rs_test_not_persisted", summary: [] } })}`,
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: toolItem })}`,
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [{ type: "reasoning", id: "rs_test_not_persisted", summary: [] }, toolItem] } })}`,
          "data: [DONE]",
        ].join("\n\n");
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
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "prepareTurn"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "assemblePromptPack"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "buildCachePlan"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "interpretModelDecision"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "adjudicateDecision"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "invokeBaseTool"), true);
  const buildCacheStep = result.mainLoopSteps.find((step) => step.actionPrimitive === "buildCachePlan");
  assert.equal(Array.isArray(buildCacheStep?.metadata.cacheablePrefixSegmentKinds), true);
  assert.equal(result.mainLoopSteps.some((step) => step.timestamps.plannedAt.startsWith("1970-")), false);
  assert.equal(result.state.invocations.some((record) => record.kind === "tool" && record.ok), true);
  const heatState = result.state.states.find((record) => record.phase === "toolContextHeat");
  assert.deepEqual(heatState?.metadata.usage, [{ toolId: "code.read", count: 1 }]);
  assert.equal(result.state.events.some((record) => record.type === "runtime.baseTool.dependencies.preflight"), true);
  const firstProviderBodyText = JSON.stringify(providerBodies[0]);
  const secondProviderBodyText = JSON.stringify(providerBodies[1]);
  assert.match(firstProviderBodyText, /runtime:base-tool-protocol/u);
  assert.match(secondProviderBodyText, /runtime:base-tool-protocol/u);
  assert.doesNotMatch(firstProviderBodyText, /runtime:base-tool-protocol:\d+/u);
  assert.doesNotMatch(secondProviderBodyText, /runtime:base-tool-protocol:\d+/u);
  const secondProviderBody = providerBodies[1] as { input?: readonly { type?: string; call_id?: string; output?: string }[] };
  const nativeFunctionCall = secondProviderBody.input?.find((item) => item.type === "function_call");
  const nativeToolResult = secondProviderBody.input?.find((item) => item.type === "function_call_output");
  assert.equal(secondProviderBody.input?.some((item) => item.type === "reasoning"), false);
  assert.equal(nativeFunctionCall?.call_id, "tool-call-1");
  assert.equal(nativeToolResult?.call_id, "tool-call-1");
  assert.match(nativeToolResult?.output ?? "", /needle from runtime kernel/);
});

test("PraxisRuntimeKernel.runManifest enriches skill permissions and relative roots for model tool calls", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-skill-"));
  await writeFile(path.join(workspace, "skill.md"), "RepoInspectorAgent appears in this local skill fixture\n", "utf8");

  class SkillAgent extends PraxisAgent {
    identity = "agent.skill";
    model = model("gpt-5.4", { carrierId: "carrier.skill" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("skill.ripgrep")]),
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
    runtimeId: "runtime-skill",
    sessionId: "session-skill",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowRipgrep: true,
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-skill" }).run(new SkillAgent(), "search local skill fixture", {
    sessionId: "session-skill",
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
            name: "skill.ripgrep",
            call_id: "skill-ripgrep-call",
            arguments: JSON.stringify({
              target: {
                query: "RepoInspectorAgent",
                registryRoot: ".",
                maxResults: 5,
              },
              context: {
                grantedPermissions: ["tool.execute"],
              },
            }),
          }],
        };
      }
      return { output_text: "skill search found RepoInspectorAgent" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /RepoInspectorAgent/);
});

test("PraxisRuntimeKernel.runManifest adds a default local MCP server for model MCP calls", async () => {
  class McpAgent extends PraxisAgent {
    identity = "agent.mcp";
    model = model("gpt-5.4", { carrierId: "carrier.mcp" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("mcp.listTools")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-mcp" }).run(new McpAgent(), "list local MCP tools", {
    sessionId: "session-mcp",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "mcp.listTools",
            call_id: "mcp-list-tools-call",
            arguments: JSON.stringify({
              target: { limit: 5 },
              context: { grantedPermissions: ["tool.execute"] },
            }),
          }],
        };
      }
      return { output_text: "local MCP tools were listed" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /local-mcp|echo/);
});

test("PraxisRuntimeKernel.runManifest sanitizes omni governance context before provider dispatch", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-omni-"));
  const imagePath = path.join(workspace, "image.png");
  await writeFile(imagePath, "not-a-real-png-but-good-enough-for-contract", "utf8");

  class OmniAgent extends PraxisAgent {
    identity = "agent.omni";
    model = model("gpt-5.4", { carrierId: "carrier.omni" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("omni.viewImage")]),
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
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-omni" }).run(new OmniAgent(), "inspect image readiness", {
    sessionId: "session-omni",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "omni.viewImage",
            call_id: "omni-view-image-call",
            arguments: JSON.stringify({
              target: { imagePath, mediaType: "image/png", detail: "low" },
              context: {
                governance: "model-supplied-invalid-governance",
                grantedPermissions: ["tool.execute"],
              },
            }),
          }],
        };
      }
      return { output_text: "omni failure was surfaced as provider readiness, not malformed context" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  const toolError = result.toolCalls[0]?.error as { code?: string } | undefined;
  assert.equal(toolError?.code, "PROVIDER_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(result.toolCalls[0]), /INVALID_CONTEXT|malformed governance/);
});

test("PraxisRuntimeKernel.runManifest defaults omni provider permissions for permissive runtime profiles", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-omni-permissions-"));
  const outputPath = path.join(workspace, "generated.png");

  class OmniGenerateAgent extends PraxisAgent {
    identity = "agent.omni-generate";
    model = model("gpt-5.4", { carrierId: "carrier.omni-generate" });
    toolPolicy = toolPolicies.permissive();
    harness = harness({
      tools: tools([tool("omni.generateImage")]),
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
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-omni-generate" }).run(
    new OmniGenerateAgent(),
    "generate a test image",
    {
      sessionId: "session-omni-generate",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "omni.generateImage",
              call_id: "omni-generate-image-call",
              arguments: JSON.stringify({
                target: { prompt: "A small test image", outputPath, mimeType: "image/png" },
                context: { grantedPermissions: ["tool.execute"] },
              }),
            }],
          };
        }
        return { output_text: "generation provider was reached" };
      },
      now: () => "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  const toolError = result.toolCalls[0]?.error as { code?: string } | undefined;
  assert.equal(toolError?.code, "PROVIDER_REJECTED");
  const grantedPermissions = (result.toolCalls[0]?.arguments as { context?: { grantedPermissions?: readonly string[] } } | undefined)
    ?.context
    ?.grantedPermissions;
  assert.equal(grantedPermissions?.includes("provider:invoke"), true);
  assert.equal(grantedPermissions?.includes("omni:image:write"), true);
  assert.notEqual(toolError?.code, "PERMISSION_DENIED");
});

test("PraxisRuntimeKernel.runManifest feeds non-approval tool failures back for replanning", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-failure-"));

  class ToolFailureAgent extends PraxisAgent {
    identity = "agent.tool-failure";
    model = model("gpt-5.4", { carrierId: "carrier.tool-failure" });
    toolPolicy = toolPolicies.bapr();
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
  const providerBodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-failure",
    sessionId: "session-tool-failure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-failure" }).run(
    new ToolFailureAgent(),
    "read missing.txt",
    {
      sessionId: "session-tool-failure",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "code.read",
              call_id: "tool-call-missing",
              arguments: JSON.stringify({
                workspaceRoot: workspace,
                targetPath: "missing.txt",
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
        return { output_text: "missing.txt could not be read, so I need another path." };
      },
      now: () => "2026-04-30T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "missing.txt could not be read, so I need another path.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  const secondProviderBody = providerBodies[1] as { input?: readonly { type?: string; call_id?: string; output?: string }[] };
  const nativeToolResult = secondProviderBody.input?.find((item) => item.type === "function_call_output");
  assert.equal(nativeToolResult?.call_id, "tool-call-missing");
  assert.match(nativeToolResult?.output ?? "", /missing\.txt|ENOENT|failed|READER_REJECTED/i);
  assert.equal(result.mainLoopSteps.some((step) => step.observationRefs.includes("session-tool-failure:observation:tool-call-missing")), true);
});

test("PraxisRuntimeKernel.runManifest feeds sandbox-blocked tool calls back as model observations", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sandbox-tool-"));

  class SandboxToolBlockedAgent extends PraxisAgent {
    identity = "agent.sandbox-tool-blocked";
    model = model("gpt-5.4", { carrierId: "carrier.sandbox-tool-blocked" });
    toolPolicy = toolPolicies.permissive();
    harness = harness({
      tools: tools([tool("shell.commandExecution")]),
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
  const providerBodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sandbox-tool-blocked",
    sessionId: "session-sandbox-tool-blocked",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
      allowProcessExecution: true,
    },
    sandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "workspace-only",
      isolationLevel: "process-namespace",
      ready: false,
      probe: {
        status: "missing-dependency",
        publicSafeMessage: "linux-bubblewrap is not installed in this test runtime",
      },
    },
  });

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sandbox-tool-blocked" }).run(
    new SandboxToolBlockedAgent(),
    "run a safe pwd command",
    {
      sessionId: "session-sandbox-tool-blocked",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.commandExecution",
              call_id: "tool-call-sandbox-blocked",
              arguments: JSON.stringify({
                command: "pwd",
                args: [],
                cwd: workspace,
                timeoutMs: 1000,
                context: {
                  dryRun: false,
                  workspaceRoot: workspace,
                  allowedRoots: [workspace],
                },
              }),
            }],
          };
        }
        return { output_text: "The sandbox blocked the shell command, so I can explain the missing bwrap dependency." };
      },
      now: () => "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "The sandbox blocked the shell command, so I can explain the missing bwrap dependency.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  const toolError = result.toolCalls[0]?.error as { code?: string } | undefined;
  assert.equal(toolError?.code, "SANDBOX_UNAVAILABLE");
  const secondProviderBody = providerBodies[1] as { input?: readonly { type?: string; call_id?: string; output?: string }[] };
  const nativeToolResult = secondProviderBody.input?.find((item) => item.type === "function_call_output");
  assert.equal(nativeToolResult?.call_id, "tool-call-sandbox-blocked");
  assert.match(nativeToolResult?.output ?? "", /SANDBOX_UNAVAILABLE|linux-bubblewrap|sandbox/i);
  assert.equal(result.mainLoopSteps.some((step) => step.observationRefs.includes("session-sandbox-tool-blocked:observation:tool-call-sandbox-blocked")), true);
});

test("PraxisRuntimeKernel.runManifest exposes model approval requests to application surface", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval", store }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_request_approval",
        call_id: "approval-call-1",
        arguments: JSON.stringify({
          reason: "need human approval for risky continuation",
          requestedScopes: ["runtime.continue"],
          riskLevel: "risky",
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.session?.status, "waitingApproval");
  assert.equal(result.state?.approvals[0]?.status, "pending");
  assert.equal(result.state?.approvals[0]?.interfaceSurface, "application");
  assert.equal(result.mainLoopSteps?.some((step) => step.status === "waitingApproval"), true);
});

test("PraxisRuntimeKernel.runManifest lets an approval resolver continue a model request", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval-resolved";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval-resolved" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2 }),
    });
  }

  let calls = 0;
  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval-resolved", store }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval-resolved",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    approvalResolver: async (approval) => ({
      status: "approved",
      resolvedBy: "unit-test",
      reason: `approved ${approval.approvalId}`,
    }),
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_request_approval",
            call_id: "approval-call-1",
            arguments: JSON.stringify({
              reason: "need human approval for risky continuation",
              requestedScopes: ["runtime.continue"],
              riskLevel: "risky",
            }),
          }],
        };
      }
      return { output_text: "approval resolved and run continued" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "approval resolved and run continued");
  assert.equal(result.state.approvals[0]?.status, "approved");
  assert.equal(result.state.approvals[0]?.interfaceSurface, "test-harness");
});

test("PraxisRuntimeKernel.runManifest maps approval resolver failures to public-safe pending surface result", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval-resolver-failure";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval-resolver-failure" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval-resolver-failure" }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval-resolver-failure",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    approvalResolver: async () => {
      throw new Error("ui bridge crashed with private detail");
    },
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_request_approval",
        call_id: "approval-call-1",
        arguments: JSON.stringify({
          reason: "need human approval for risky continuation",
          requestedScopes: ["runtime.continue"],
          riskLevel: "risky",
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.approvals[0]?.status, "denied");
  assert.equal(result.state?.approvals[0]?.resolution?.reason, "approval resolver failed");
  assert.equal(JSON.stringify(result.state).includes("private detail"), false);
});

test("PraxisRuntimeKernel.runManifest gates BaseTool calls through tool policy approval", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-approval-"));
  await writeFile(path.join(workspace, "notes.txt"), "approval gate should stop before read\n", "utf8");

  class ToolApprovalAgent extends PraxisAgent {
    identity = "agent.tool-approval";
    model = model("gpt-5.4", { carrierId: "carrier.tool-approval" });
    toolPolicy = toolPolicies.restricted();
    harness = harness({
      tools: tools([tool("code.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1, maxToolCalls: 1 }),
    });
  }

  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-approval",
    sessionId: "session-tool-approval",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-approval" }).run(new ToolApprovalAgent(), "read notes", {
    sessionId: "session-tool-approval",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_tool_code_read",
        call_id: "tool-approval-call-1",
        arguments: JSON.stringify({
          workspaceRoot: workspace,
          targetPath: "notes.txt",
          dryRun: false,
          context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.session?.status, "waitingApproval");
  assert.equal(result.state?.approvals[0]?.source, "baseTool");
  assert.equal(result.state?.invocations.some((record) => record.kind === "tool" && !record.ok), true);
});

test("PraxisRuntimeKernel.runManifest executes governed BaseTool after approval resolver", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-approved-"));
  await writeFile(path.join(workspace, "notes.txt"), "approval resolver allows read\n", "utf8");

  class ToolApprovalAgent extends PraxisAgent {
    identity = "agent.tool-approved";
    model = model("gpt-5.4", { carrierId: "carrier.tool-approved" });
    toolPolicy = toolPolicies.restricted();
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
    runtimeId: "runtime-tool-approved",
    sessionId: "session-tool-approved",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-approved" }).run(new ToolApprovalAgent(), "read notes", {
    sessionId: "session-tool-approved",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    approvalResolver: async () => ({ status: "approved", resolvedBy: "unit-test" }),
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_tool_code_read",
            call_id: "tool-approved-call-1",
            arguments: JSON.stringify({
              workspaceRoot: workspace,
              targetPath: "notes.txt",
              dryRun: false,
              context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
            }),
          }],
        };
      }
      return { output_text: "approval resolver allowed the file read" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.state.approvals[0]?.status, "approved");
  assert.equal(result.finalOutput, "approval resolver allowed the file read");
});

test("PraxisRuntimeKernel.runManifest executes EphemeralProcedure through mounted BaseTools", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from ephemeral procedure\n", "utf8");

  class ProcedureAgent extends PraxisAgent {
    identity = "agent.procedure";
    model = model("gpt-5.4", { carrierId: "carrier.procedure" });
    toolPolicy = toolPolicies.bapr();
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
  const providerBodies: unknown[] = [];
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure" }).run(new ProcedureAgent(), "read notes by procedure", {
    sessionId: "session-procedure",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async (envelope) => {
      calls += 1;
      providerBodies.push(envelope.body);
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
  assert.match(JSON.stringify(providerBodies[1]), /procedure-call-1/);
  assert.match(JSON.stringify(providerBodies[1]), /function_call_output/);
});

test("PraxisRuntimeKernel.runManifest feeds EphemeralProcedure failures back for replanning", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-failure-"));

  class ProcedureFailureAgent extends PraxisAgent {
    identity = "agent.procedure-failure";
    model = model("gpt-5.4", { carrierId: "carrier.procedure-failure" });
    toolPolicy = toolPolicies.bapr();
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
    runtimeId: "runtime-procedure-failure",
    sessionId: "session-procedure-failure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure-failure" }).run(new ProcedureFailureAgent(), "read missing by procedure", {
    sessionId: "session-procedure-failure",
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
            call_id: "procedure-failure-call-1",
            arguments: JSON.stringify({
              procedureId: "procedure-read-missing",
              purpose: "read a missing file through code.read",
              executionMode: "serial",
              steps: [{
                stepId: "read-missing",
                baseToolId: "code.read",
                input: {
                  workspaceRoot: workspace,
                  targetPath: "missing.txt",
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
      return { output_text: "procedure failed and I can replan from the observation." };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "procedure failed and I can replan from the observation.");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  assert.equal(result.state.errors.some((record) => record.code === "PROCEDURE_INVOCATION_FAILED"), true);
});
