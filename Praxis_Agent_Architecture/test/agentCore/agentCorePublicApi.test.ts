import assert from "node:assert/strict";
import test from "node:test";

import {
  PraxisAgent,
  PraxisAgentArchetype,
  PraxisRuntimeKernel,
  compileAgent,
  createFrameworkInspectionReport,
  endpoint,
  harness,
  inspectAgentManifest,
  loop,
  mainLoop,
  markdown,
  model,
  modelFleet,
  policy,
  sandbox,
  session,
  statePlane,
  tool,
  toolPolicies,
  tools,
  validateAgentManifest,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolver,
} from "../../src/agentCore/index.js";

class MinimalDeveloperAgent extends PraxisAgent {
  identity = "agent.public.minimal";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      tool("code.read", { family: "codeBase", group: "explore" }),
    ]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 1 }),
  });
}

class MatureDeveloperAgent extends PraxisAgentArchetype {
  identity = "agent.public.mature";
  model = model("gpt-5.4-nano");
  modelFleet = modelFleet.auto({
    primary: endpoint("/v1/responses", { role: "background", provider: "openai", model: "gpt-5.4-nano" }),
  });
  promptPack = {
    promptPackId: "prompt.public.mature",
    base: markdown("You are a public API Praxis agent.", "public.base"),
  };
  mainLoop = mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "public.prompt.strategy" },
      shouldContinue: { strategyRef: "public.loop.continue" },
    },
  });
  sandbox = sandbox.hostObserved();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
  statePlane = statePlane({ expose: ["phase", "toolCalls"], control: ["pause"] });
  harness = harness({
    tools: tools([
      tool("shell.commandExecution", { family: "shellBase", group: "shellExecution" }),
    ]),
    loop: loop.standard({ maxModelTurns: 2, maxToolCalls: 2 }),
  });
}

test("public agentCore API lets developers compile minimal and mature agents without runtime internals", async () => {
  const minimal = compileAgent(MinimalDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(minimal.ok, true);
  if (!minimal.ok) return;
  assert.equal(minimal.manifest.sandbox.profile, "host-observed");
  assert.equal(minimal.manifest.toolPolicy.profile, "standard");

  const mature = compileAgent(MatureDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(mature.ok, true);
  if (!mature.ok) return;
  assert.equal(mature.manifest.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.toolPolicy.profile, "standard");
  assert.equal(mature.manifest.harness.sandbox.profile, "host-observed");
  const validation = validateAgentManifest(mature.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(inspectAgentManifest(validation.manifest).frameworkCore.mainLoopBindRef, "runtime.execEngine.bindCoreLogic");

  const runtime = new PraxisRuntimeKernel({ runtimeId: "runtime.public-api" });
  const result = await runtime.runManifest(minimal.manifest, "Say hello from public API.");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.finalOutput, "PraxisRuntimeKernel dry-run completed.");
  }

  const resolver: RuntimeApprovalResolver = async (approval: RuntimeApprovalEnvelope) => ({
    status: approval.publicSafe ? "approved" : "denied",
    resolvedBy: "public-api-test",
  });
  const approvalResolution = await resolver({
    approvalId: "approval.public",
    runtimeId: "runtime.public-api",
    sessionId: "session.public-api",
    source: "runtime",
    reason: "public API type smoke",
    requestedScopes: ["runtime.continue"],
    interfaceSurface: "application",
    metadata: {},
    publicSafe: true,
  });
  assert.equal(approvalResolution.status, "approved");

  const inspection = createFrameworkInspectionReport({
    runtimeId: "runtime.public-api",
    manifest: mature.manifest,
    tools: [{ toolId: "shell.commandExecution", family: "shellBase", group: "shellExecution", ready: true }],
    providers: [{ providerId: "codex_responses", ready: true }],
  });
  assert.equal(inspection.ok, true);
  if (inspection.ok) {
    assert.equal(inspection.report.audit.reportSurface, "runtime.inspection.frameworkInspectionReport");
  }
});
