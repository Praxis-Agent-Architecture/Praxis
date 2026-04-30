import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import {
  PraxisAgent,
  compileAgent,
  harness,
  loop,
  model,
  policy,
  tool,
  tools,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtimeAgentManifest.md",
  testFileUrl: import.meta.url,
});

class ResearchAgent extends PraxisAgent {
  identity = { id: "agent.research", version: "1.0.0" };
  model = model("gpt-5.4", { carrierId: "carrier.research" });
  harness = harness({
    tools: tools([
      tool("code.read", { scopes: ["tool.execute", "tool.code.read"] }),
    ]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
  });
}

class ConfiguredAgent extends PraxisAgent {
  identity = "agent.configured";
  model = model("gpt-5.4");
  harness;

  constructor(private readonly depth: "fast" | "deep") {
    super();
    this.harness = harness({
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: this.depth === "deep" ? 4 : 1 }),
    });
  }
}

test("compileAgent compiles a PraxisAgent class into a stable AgentManifest", () => {
  const result = compileAgent(ResearchAgent, {
    compiledAt: "2026-04-30T00:00:00.000Z",
    manifestId: "manifest.research",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.manifest.kind, "praxis.agentManifest");
  assert.equal(result.manifest.identity.id, "agent.research");
  assert.equal(result.manifest.model.carrierId, "carrier.research");
  assert.equal(result.manifest.source.kind, "class");
  assert.equal(result.manifest.source.constructorSideEffectsAllowed, false);
  assert.equal(result.manifest.harness.tools[0]?.toolId, "code.read");
  assert.equal(result.manifest.harness.loop.maxModelTurns, 2);
  assert.equal(result.manifest.verification.runtimeExecutesManifestOnly, true);
  assert.equal(result.manifest.manifestHash.length, 64);
});

test("compileAgent supports configured instances without treating constructor as runtime execution", () => {
  const result = compileAgent(new ConfiguredAgent("deep"), {
    compiledAt: "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.manifest.identity.id, "agent.configured");
  assert.equal(result.manifest.source.kind, "instance");
  assert.equal(result.manifest.harness.loop.maxModelTurns, 4);
  assert.equal(result.manifest.model.endpointShape, "responses");
});

test("compileAgent rejects missing agent input with public-safe error", () => {
  const result = compileAgent(undefined);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MISSING_AGENT");
  assert.equal(result.error.publicSafe, true);
});
