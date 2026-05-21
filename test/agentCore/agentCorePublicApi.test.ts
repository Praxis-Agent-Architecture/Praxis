import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PraxisAgent,
  PraxisAgentArchetype,
  PraxisRuntimeKernel,
  authoringPrimitives,
  baseTool,
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
  storage as storageHelpers,
  toolPolicies,
  toolSets,
  tools,
  validateAgentManifest,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolver,
  createStoragePlaneRuntime,
  praxis,
} from "../../src/agentCore/index.js";

import {
  authoringPrimitives as packageAuthoringPrimitives,
  baseTool as packageBaseTool,
  modelAuthoring as packageModelAuthoring,
  praxis as packagePraxis,
} from "@praxis-ai/praxis";

class MinimalDeveloperAgent extends PraxisAgent {
  identity = "agent.public.minimal";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      baseTool.basetool.core.fileRead({ profileName: "codingCore" }),
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
  storage = storageHelpers.raxWorkspace();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
  statePlane = statePlane({ expose: ["phase", "toolCalls"], control: ["pause"] });
  harness = harness({
    tools: tools([
      baseTool.basetool.core.shellRun({ profileName: "codingCore" }),
      baseTool.basetool.core.fileSearch({ profileName: "codingCore" }),
    ]),
    loop: loop.standard({ maxModelTurns: 2, maxToolCalls: 2 }),
  });
}

test("public agentCore API lets developers compile minimal and mature agents without runtime internals", async () => {
  assert.equal(authoringPrimitives.PraxisAgent, PraxisAgent);
  assert.equal(baseTool.basetool.core.fileRead().toolId, "file.read");
  assert.deepEqual(baseTool.profiles().map((profile) => profile.name), [
    "codingCore",
    "researchCore",
    "workCore",
    "runtimeCore",
    "agentCore",
    "fullCore",
  ]);
  assert.equal(packageAuthoringPrimitives.PraxisAgentArchetype, PraxisAgentArchetype);
  assert.equal(packageModelAuthoring.model("gpt-5.4").model, "gpt-5.4");
  assert.equal(packageBaseTool.basetool.core.fileSearch().toolId, "file.search");
  assert.equal(praxis.Agent, PraxisAgent);
  assert.equal(packagePraxis.AgentArchetype, PraxisAgentArchetype);
  assert.equal(packagePraxis.model("gpt-5.4").model, "gpt-5.4");
  assert.equal(packagePraxis.basetool.core.fileRead().toolId, "file.read");
  assert.equal(packagePraxis.sandbox.linuxBubblewrap().providerFamily, "linux-bubblewrap");
  assert.equal(packagePraxis.toolPolicies.custom({ matrixId: "toolPolicy.public.custom" }).profile, "custom");
  assert.equal(packagePraxis.interfaceAdapter.createInterfaceEnvelope({
    envelopeId: "event.public",
    kind: "event",
    surface: "application",
    runtimeId: "runtime.public-api",
    payload: {},
  }).ok, true);

  const minimal = compileAgent(MinimalDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(minimal.ok, true);
  if (!minimal.ok) return;
  assert.equal(minimal.manifest.sandbox.profile, "host-observed");
  assert.equal(minimal.manifest.toolPolicy.profile, "standard");
  assert.equal(minimal.manifest.harness.tools[0]?.family, "coreBase");
  assert.equal(minimal.manifest.harness.tools[0]?.group, "filesystem");

  const mature = compileAgent(MatureDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(mature.ok, true);
  if (!mature.ok) return;
  assert.equal(mature.manifest.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.toolPolicy.profile, "standard");
  assert.equal(mature.manifest.harness.sandbox.profile, "host-observed");
  assert.equal(mature.manifest.harness.storage.kind, "rax-workspace");
  assert.equal(mature.manifest.harness.storage.sessionStoreRef, "session.sqlite.workspace");
  assert.equal(mature.manifest.harness.tools.some((item) => item.toolId === "file.search"), true);
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
    providers: [{ providerId: "codex_responses", ready: true }],
  });
  assert.equal(inspection.ok, true);
  if (inspection.ok) {
    assert.equal(inspection.report.audit.reportSurface, "runtime.inspection.frameworkInspectionReport");
    assert.equal(inspection.report.storage.writesSecrets, false);
    assert.equal(inspection.report.toolReadiness.total, mature.manifest.harness.tools.length);
    assert.ok(inspection.report.toolReadiness.tools.some((tool) => tool.toolId === "shell.run"));
    assert.equal(
      inspection.report.toolReadiness.byDeveloperReadiness.adapterRequired > 0 ||
        inspection.report.toolReadiness.byDeveloperReadiness.usableWithApproval > 0 ||
        inspection.report.toolReadiness.byDeveloperReadiness.notLiveProven > 0,
      true,
    );
  }

  const storageRuntime = createStoragePlaneRuntime({
    cwd: process.cwd(),
    agentId: mature.manifest.identity.id,
  });
  assert.equal(storageRuntime.ok, true);
});

test("agentCore developer guide documents the public framework path", async () => {
  const guide = await readFile(
    new URL("../../docs/agentCore/agent_runtimeImplementation/agentCoreFrameworkDeveloperGuide.md", import.meta.url),
    "utf8",
  );

  assert.match(guide, /PraxisAgent class or instance/);
  assert.match(guide, /compileAgent\(\.\.\.\)/);
  assert.match(guide, /AgentManifest/);
  assert.match(guide, /PraxisRuntimeKernel\.runManifest/);
  assert.match(guide, /src\/agentCore\/index\.ts/);
  assert.match(guide, /praxis\.storage\.raxWorkspace\(\)/);
  assert.match(guide, /family \/ group \/ toolId/);
});
