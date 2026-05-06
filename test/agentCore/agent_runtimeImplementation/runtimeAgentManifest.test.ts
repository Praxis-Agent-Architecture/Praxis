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
  inspectAgentManifest,
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
  storage as storageHelpers,
  tool,
  toolPolicies,
  tools,
  validateAgentManifest,
  type BaseToolPolicyMatrixSpec,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeAgentManifest.md",
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
  sandbox = sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
    resourceLimits: { timeoutMs: 30_000, maxProcesses: 8 },
  });
  toolPolicy = toolPolicies.standard();
  session = session({
    persistence: "sqlite",
    resume: "auto",
    thread: "durable",
    logs: "full",
    storeRef: "session.sqlite.default",
  });
  storage = storageHelpers.raxWorkspace({ path: ".custom_rax_workspace" });
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
  assert.equal(result.manifest.sandbox.profile, "host-observed");
  assert.equal(result.manifest.harness.sandbox.profile, "host-observed");
  assert.equal(result.manifest.toolPolicy.profile, "standard");
  assert.equal(result.manifest.harness.toolPolicy.profile, "standard");
  assert.equal(result.manifest.frameworkCore.kind, "praxis.frameworkCoreContract");
  assert.equal(result.manifest.frameworkCore.runtimeTruth, "agentManifest");
  assert.equal(result.manifest.frameworkCore.promptPack.providerPayloadBuilder, false);
  assert.equal(result.manifest.frameworkCore.baseToolGovernance.identityAxis, "family/group/toolId");
  assert.equal(result.manifest.harness.frameworkCore.promptPack.promptPackId, result.manifest.promptPack.promptPackId);
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

test("session sqlite defaults to rax workspace storage refs", () => {
  class SqliteAgent extends PraxisAgent {
    identity = "agent.sqlite-defaults";
    model = model("gpt-5.4");
    session = session({ persistence: "sqlite" });
    harness = harness({
      loop: loop({ strategy: "single" }),
    });
  }

  const result = compileAgent(SqliteAgent, {
    compiledAt: "2026-05-05T00:00:00.000Z",
    manifestId: "manifest.sqlite-defaults",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.session.storeRef, "session.sqlite.workspace");
  assert.equal(result.manifest.storage.kind, "rax-workspace");
  assert.equal(result.manifest.storage.init, "on-run");
  assert.equal(result.manifest.harness.storage.workspaceRef, "rax.workspace");
  assert.equal(result.manifest.harness.storage.sessionStoreRef, "session.sqlite.workspace");
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
  assert.equal(result.manifest.sandbox.profile, "host-observed");
  assert.equal(result.manifest.sandbox.filesystem, "workspace-only");
  assert.equal(result.manifest.sandbox.resourceLimits.timeoutMs, 30_000);
  assert.equal(result.manifest.toolPolicy.profile, "standard");
  assert.equal(result.manifest.toolPolicy.actionRules.find((rule) => rule.action === "dangerous")?.decision, "approval");
  assert.equal(result.manifest.session.persistence, "sqlite");
  assert.equal(result.manifest.storage.kind, "rax-workspace");
  assert.equal(result.manifest.storage.path, ".custom_rax_workspace");
  assert.equal(result.manifest.storage.sessionStoreRef, "session.sqlite.workspace");
  assert.equal(result.manifest.harness.storage.kind, result.manifest.storage.kind);
  assert.equal(result.manifest.harness.storage.sessionStoreRef, result.manifest.storage.sessionStoreRef);
  assert.deepEqual(result.manifest.statePlane.control, ["pause", "resume", "interrupt", "rollback"]);
  assert.equal(result.manifest.harness.modelFleet.endpoints.batch?.endpoint, "/v1/batches");
  assert.equal(result.manifest.harness.promptPack.promptPackId, "prompt.coding");
  assert.equal(result.manifest.harness.promptPack.patches?.[1]?.operation, "replaceLastLines");
  assert.equal(result.manifest.harness.mainLoop.stepRecordCompatible, true);
  assert.equal(result.manifest.harness.toolPolicy.profile, "standard");
  assert.equal(result.manifest.harness.sandbox.shell, "approval-for-write");
  assert.equal(result.manifest.frameworkCore.promptPack.promptPackId, "prompt.coding");
  assert.equal(result.manifest.frameworkCore.mainLoop.strategy, "standard");
  assert.deepEqual(result.manifest.frameworkCore.officialModuleBridge, {
    tap: "contract-only",
    cmp: "contract-only",
    mp: "contract-only",
    multiagent: "contract-only",
  });
});

test("AgentManifest validation preserves hash stability and inspectable summary", () => {
  const first = compileAgent(CodingAgentArchetype, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.coding.stable",
  });
  const second = compileAgent(CodingAgentArchetype, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.coding.stable",
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(first.manifest.manifestHash, second.manifest.manifestHash);

  const validation = validateAgentManifest(first.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  const inspection = inspectAgentManifest(validation.manifest);
  assert.equal(inspection.manifestId, "manifest.coding.stable");
  assert.equal(inspection.identityId, "agent.coding");
  assert.equal(inspection.promptPack.promptPackId, "prompt.coding");
  assert.equal(inspection.mainLoop.formalLayer, true);
  assert.equal(inspection.frameworkCore.promptPackBindRef, "runtime.execEngine.bindPromptPack");
  assert.equal(inspection.governance.toolPolicyProfile, "standard");
  assert.equal(inspection.verificationGates.includes("no-raw-secrets"), true);
});

test("validateAgentManifest rejects malformed manifests with public-safe errors", () => {
  assert.equal(validateAgentManifest(undefined).ok, false);

  const compiled = compileAgent(ResearchAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.research.malformed",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const tamperedHash = validateAgentManifest({
    ...compiled.manifest,
    identity: { ...compiled.manifest.identity, id: "agent.tampered" },
  });
  assert.equal(tamperedHash.ok, false);
  if (!tamperedHash.ok) {
    assert.equal(tamperedHash.error.code, "HASH_MISMATCH");
    assert.equal(tamperedHash.error.publicSafe, true);
  }

  const mismatchedHarness = validateAgentManifest({
    ...compiled.manifest,
    manifestHash: compiled.manifest.manifestHash,
    harness: {
      ...compiled.manifest.harness,
      promptPack: {
        ...compiled.manifest.harness.promptPack,
        promptPackId: "wrong.prompt",
      },
    },
  });
  assert.equal(mismatchedHarness.ok, false);
  if (!mismatchedHarness.ok) {
    assert.equal(mismatchedHarness.error.code, "HASH_MISMATCH");
  }

  const rawSecret = compileAgent(ResearchAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.research.secret",
  });
  assert.equal(rawSecret.ok, true);
  if (!rawSecret.ok) return;
  const secretManifest = {
    ...rawSecret.manifest,
    model: {
      ...rawSecret.manifest.model,
      metadata: { apiKey: "sk-test" },
    },
  };
  const secretHash = validateAgentManifest({
    ...secretManifest,
    manifestHash: "0".repeat(64),
  });
  assert.equal(secretHash.ok, false);
  if (!secretHash.ok) {
    assert.equal(secretHash.error.code, "RAW_SECRET_REJECTED");
    assert.equal(secretHash.error.boundary, "security");
  }
});

test("tool policy profiles and host-observed sandbox compile into Manifest views", () => {
  const profiles = [
    ["bapr", toolPolicies.bapr(), "allow"],
    ["yolo", toolPolicies.yolo(), "guarded"],
    ["permissive", toolPolicies.permissive(), "guarded"],
    ["standard", toolPolicies.standard(), "guarded"],
    ["restricted", toolPolicies.restricted(), "approval"],
  ] as const;

  for (const [profile, profilePolicy, defaultDecision] of profiles) {
    class ProfileAgent extends PraxisAgent {
      identity = `agent.profile.${profile}`;
      model = model("gpt-5.4");
      sandbox = sandbox.hostObserved();
      toolPolicy = profilePolicy;
      harness = harness({ loop: loop.standard() });
    }

    const result = compileAgent(new ProfileAgent());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.manifest.sandbox.profile, "host-observed");
    assert.equal(result.manifest.harness.sandbox.profile, "host-observed");
    assert.equal(result.manifest.toolPolicy.profile, profile);
    assert.equal(result.manifest.toolPolicy.defaultDecision, defaultDecision);
    assert.equal(result.manifest.harness.toolPolicy.profile, profile);
  }
});

test("compileAgent rejects invalid sandbox and tool policy profile shapes", () => {
  class BadSandboxAgent extends PraxisAgent {
    identity = "agent.bad-sandbox";
    model = model("gpt-5.4");
    sandbox = { ...sandbox.hostObserved(), profile: "" };
    harness = harness({});
  }

  const badSandbox = compileAgent(new BadSandboxAgent());
  assert.equal(badSandbox.ok, false);
  if (!badSandbox.ok) {
    assert.equal(badSandbox.error.code, "INVALID_SANDBOX");
    assert.equal(badSandbox.error.publicSafe, true);
  }

  class BadToolPolicyAgent extends PraxisAgent {
    identity = "agent.bad-tool-policy";
    model = model("gpt-5.4");
    toolPolicy = { ...toolPolicies.standard(), profile: "" as BaseToolPolicyMatrixSpec["profile"] };
    harness = harness({});
  }

  const badToolPolicy = compileAgent(new BadToolPolicyAgent());
  assert.equal(badToolPolicy.ok, false);
  if (!badToolPolicy.ok) {
    assert.equal(badToolPolicy.error.code, "INVALID_TOOL_POLICY");
    assert.equal(badToolPolicy.error.publicSafe, true);
  }
});

test("compileAgent rejects unknown or mismatched BaseTool authoring with public-safe errors", () => {
  class UnknownToolAgent extends PraxisAgent {
    identity = "agent.unknown-tool";
    model = model("gpt-5.4");
    harness = harness({
      tools: tools([tool("code.noSuchTool")]),
    });
  }

  const unknownTool = compileAgent(new UnknownToolAgent());
  assert.equal(unknownTool.ok, false);
  if (!unknownTool.ok) {
    assert.equal(unknownTool.error.code, "INVALID_TOOL_SPEC");
    assert.equal(unknownTool.error.publicSafe, true);
  }

  class MismatchedToolAgent extends PraxisAgent {
    identity = "agent.mismatched-tool";
    model = model("gpt-5.4");
    harness = harness({
      tools: tools([tool("code.read", { family: "gitBase", group: "inspection" })]),
    });
  }

  const mismatchedTool = compileAgent(new MismatchedToolAgent());
  assert.equal(mismatchedTool.ok, false);
  if (!mismatchedTool.ok) {
    assert.equal(mismatchedTool.error.code, "INVALID_TOOL_SPEC");
    assert.equal(mismatchedTool.error.publicSafe, true);
  }
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

test("compileAgent supports custom sandbox, policy, mainLoop refs, and statePlane controls", () => {
  class FinalClosureAgent extends PraxisAgentArchetype {
    identity = "agent.final-closure";
    model = model("gpt-5.4");
    sandbox = sandbox.profile(sandbox.workspaceOnly({
      sandboxId: "sandbox.final.workspace",
      dependencyRefs: ["policy:workspace-only"],
    }));
    toolPolicy = toolPolicies.custom({
      matrixId: "toolPolicy.final.custom",
      defaultDecision: "approval",
      familyRules: [
        { scope: "family", family: "codeBase", decision: "allow", risk: "safe", log: "full", approval: "none" },
      ],
      toolRules: [
        { scope: "toolId", toolId: "shell.commandExecution", decision: "approval", risk: "dangerous", log: "full", approval: "required" },
      ],
    });
    mainLoop = mainLoop.standard({
      buildPromptRef: "loop.final.buildPrompt",
      chooseModelRef: "loop.final.chooseModel",
      onApprovalRef: "loop.final.approval",
      onErrorRef: "loop.final.error",
    });
    statePlane = statePlane({
      expose: ["phase", "approvals"],
      control: ["pause", "resume", "interrupt", "approve", "deny", "rollback", "inspect", "repair", "configure", "rotateSecretRef"],
      audit: "full",
    });
    harness = harness({
      tools: tools([
        tool("code.read"),
        tool("shell.commandExecution"),
      ]),
    });
  }

  const result = compileAgent(FinalClosureAgent, {
    compiledAt: "2026-05-06T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.sandbox.providerFamily, "workspace-policy");
  assert.equal(result.manifest.sandbox.isolationLevel, "workspace-policy");
  assert.deepEqual(result.manifest.sandbox.dependencyRefs, ["policy:workspace-only"]);
  assert.equal(result.manifest.toolPolicy.profile, "custom");
  assert.equal(result.manifest.toolPolicy.familyRules[0]?.family, "codeBase");
  assert.equal(result.manifest.mainLoop.hooks.some((hook) => hook.hook === "onApproval" && hook.handlerRef === "loop.final.approval"), true);
  assert.equal(result.manifest.statePlane.control.includes("rotateSecretRef"), true);
  assert.equal(result.manifest.harness.sandbox.providerFamily, "workspace-policy");
  assert.equal(result.manifest.harness.toolPolicy.matrixId, "toolPolicy.final.custom");
});

test("compileAgent rejects missing agent input with public-safe error", () => {
  const result = compileAgent(undefined);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MISSING_AGENT");
  assert.equal(result.error.publicSafe, true);
});
