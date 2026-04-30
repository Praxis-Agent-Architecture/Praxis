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
  assert.equal(result.state.invocations.some((record) => record.kind === "tool" && record.ok), true);
});
