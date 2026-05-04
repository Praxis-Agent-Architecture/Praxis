import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import {
  PromptPack,
  PraxisAgent,
  PraxisAgentArchetype,
  append,
  compileAgent,
  endpoint,
  harness,
  loop,
  model,
  modelFleet,
  mainLoop,
  markdown,
  markdownFile,
  policy,
  replaceLastLines,
  sandbox,
  session,
  statePlane,
  tool,
  toolPolicies,
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

class CodingPrompt extends PromptPack {
  promptPackId = "prompt.coding";
  base = markdown("你是 Praxis Coding Agent，为处理编程任务而生。", "coding.base");
  patches = [
    append("coding.rules", markdownFile("rules.md", "coding.rules.file"), { auditRefs: ["audit.prompt.rules"] }),
    replaceLastLines("coding.base", 5, markdownFile("override.md", "coding.override.file")),
  ];
  sceneTriggers = ["scene.coding"];
  auditRefs = ["audit.prompt.base"];
}

class CodingAgentArchetype extends PraxisAgentArchetype {
  identity = { id: "agent.coding", version: "2.0.0" };
  model = model("gpt-5.4-nano", { carrierId: "carrier.background", endpointShape: "responses" });
  modelFleet = modelFleet.auto({
    primary: endpoint("/v1/messages", { role: "reasoning", provider: "anthropic", model: "claude-opus-4.7" }),
    image: endpoint("/v1/images", { role: "image-generation", provider: "openai", model: "gpt-image-2" }),
    background: endpoint("/v1/responses", { role: "background", provider: "openai", model: "gpt-5.4-nano" }),
    batch: endpoint("/v1/batches", { role: "batch", provider: "openai", model: "gpt-5.5-pro" }),
    realtime: endpoint("/v1/realtime", { role: "realtime", provider: "openai", model: "gpt-realtime-1.5" }),
  }, {
    failurePolicy: { onUnavailable: "fallback", fallbackEndpointRef: "background", maxRetries: 2 },
  });
  promptPack = new CodingPrompt();
  mainLoop = mainLoop.standard({
    hooks: {
      onStart: "coding.loop.onStart",
      buildPrompt: { strategyRef: "coding.prompt.strategy" },
      chooseModel: { handlerRef: "coding.model.router" },
      beforeTool: { policyRef: "coding.tool.before" },
      afterTool: { handlerRef: "coding.tool.after" },
      shouldContinue: { strategyRef: "coding.loop.continue" },
      shouldBreak: { strategyRef: "coding.loop.break" },
      onError: { handlerRef: "coding.loop.error" },
      onResume: { handlerRef: "coding.loop.resume" },
    },
  });
  sandbox = sandbox.temp({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
    resourceLimits: { timeoutMs: 30_000, maxProcesses: 8 },
  });
  toolPolicy = toolPolicies.codingAgentFull({
    read: "allow",
    write: "approval",
    shell: "guarded",
    git: "approval-on-destructive",
  });
  session = session({
    persistence: "sqlite",
    resume: "auto",
    thread: "durable",
    logs: "full",
    storeRef: "session.sqlite.default",
  });
  statePlane = statePlane({
    expose: ["phase", "lastAction", "toolCalls", "errors"],
    control: ["pause", "resume", "interrupt", "rollback"],
    audit: "full",
  });
  harness = harness({
    tools: tools([
      tool("code.read", { family: "codeBase", group: "explore" }),
      tool("shell.commandExecution", { family: "shellBase", group: "shellExecution" }),
      tool("git.getRepositoryStatus", { family: "gitBase", group: "inspection" }),
    ]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 4, maxToolCalls: 6 }),
  });
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

test("compileAgent compiles Agent Archetype authoring specs into stable Manifest fields", () => {
  const result = compileAgent(CodingAgentArchetype, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.coding",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.manifest.modelFleet.mode, "auto");
  assert.equal(result.manifest.modelFleet.primaryRef, "primary");
  assert.equal(result.manifest.modelFleet.endpoints.primary?.endpoint, "/v1/messages");
  assert.equal(result.manifest.modelFleet.endpoints.image?.endpointFamily, "images");
  assert.equal(result.manifest.modelFleet.endpoints.realtime?.protocolFamily, "openai-realtime");
  assert.equal(result.manifest.promptPack.promptPackId, "prompt.coding");
  assert.equal(result.manifest.promptPack.base?.kind, "markdown");
  assert.equal(result.manifest.promptPack.patches.length, 2);
  assert.equal(result.manifest.promptPack.patches[0]?.patchId, "coding.rules:append");
  assert.equal(result.manifest.promptPack.patches[1]?.operation, "replaceLastLines");
  assert.equal(result.manifest.mainLoop.hooks.some((hook) => hook.hook === "chooseModel" && hook.handlerRef === "coding.model.router"), true);
  assert.equal(result.manifest.sandbox.filesystem, "workspace-only");
  assert.equal(result.manifest.sandbox.resourceLimits.timeoutMs, 30_000);
  assert.equal(result.manifest.toolPolicy.familyRules.some((rule) => rule.family === "gitBase" && rule.decision === "approval-on-destructive"), true);
  assert.equal(result.manifest.session.persistence, "sqlite");
  assert.deepEqual(result.manifest.statePlane.control, ["pause", "resume", "interrupt", "rollback"]);
  assert.equal(result.manifest.harness.modelFleet.endpoints.batch?.endpoint, "/v1/batches");
  assert.equal(result.manifest.harness.promptPack.promptPackId, "prompt.coding");
  assert.equal(result.manifest.harness.promptPack.patches?.[1]?.operation, "replaceLastLines");
  assert.equal(result.manifest.harness.mainLoop.stepRecordCompatible, true);
  assert.equal(result.manifest.harness.sandbox.shell, "approval-for-write");
});

test("prompt patch helpers keep scene triggers as metadata and validate unique ids", () => {
  const scenePatch = append("coding.base", markdown("scene material"), { sceneTrigger: "scene.coding" });

  assert.equal(scenePatch.patchId, "coding.base:append:scene:scene.coding");
  assert.equal(scenePatch.sceneTrigger, "scene.coding");

  class DuplicatePromptAgent extends PraxisAgent {
    identity = "agent.duplicate-prompt";
    model = model("gpt-5.4");
    promptPack = {
      patches: [
        append("coding.base", markdown("one"), { patchId: "duplicate.patch" }),
        append("coding.rules", markdown("two"), { patchId: " duplicate.patch " }),
      ],
    };
    harness = harness({});
  }

  const result = compileAgent(new DuplicatePromptAgent());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_PROMPT_PACK");
    assert.match(result.error.message, /patchId must be unique/);
  }
});

test("compileAgent rejects non-declarative mainLoop hooks and invalid prompt patches", () => {
  class BadMainLoopAgent extends PraxisAgent {
    identity = "agent.bad-main-loop";
    model = model("gpt-5.4");
    mainLoop = {
      ...mainLoop.standard(),
      hooks: [{ hook: "onStart" as const, handlerRef: (() => "bad") as unknown as string }],
    };
    harness = harness({});
  }

  const badMainLoop = compileAgent(new BadMainLoopAgent());
  assert.equal(badMainLoop.ok, false);
  if (!badMainLoop.ok) {
    assert.equal(badMainLoop.error.code, "INVALID_MAIN_LOOP");
  }

  class BadPromptAgent extends PraxisAgent {
    identity = "agent.bad-prompt";
    model = model("gpt-5.4");
    promptPack = {
      patches: [replaceLastLines("base", 0, markdown("bad"))],
    };
    harness = harness({});
  }

  const badPrompt = compileAgent(new BadPromptAgent());
  assert.equal(badPrompt.ok, false);
  if (!badPrompt.ok) {
    assert.equal(badPrompt.error.code, "INVALID_PROMPT_PACK");
  }
});

test("compileAgent rejects missing agent input with public-safe error", () => {
  const result = compileAgent(undefined);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MISSING_AGENT");
  assert.equal(result.error.publicSafe, true);
});
