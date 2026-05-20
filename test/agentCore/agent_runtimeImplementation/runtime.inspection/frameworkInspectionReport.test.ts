import assert from "node:assert/strict";
import test from "node:test";

import { createMainLoopStepRecord } from "../../../../src/executionEngine/coreLogic/mainLoop.js";
import {
  PraxisAgent,
  compileAgent,
  harness,
  loop,
  model,
  sandbox,
  tool,
  tools,
} from "../../../../src/agentCore/index.js";
import { createFrameworkInspectionReport } from "../../../../src/runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";

class InspectableAgent extends PraxisAgent {
  identity = "agent.inspectable";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      tool("code.read", { family: "codeBase", group: "explore" }),
    ]),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 1 }),
  });
}

test("frameworkInspectionReport aggregates manifest, readiness, prompt preview, trace, and repair plan safely", () => {
  const compiled = compileAgent(InspectableAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.inspectable",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const step = createMainLoopStepRecord({
    sessionId: "session.inspect",
    turnIndex: 0,
    stepIndex: 0,
    actionPrimitive: "handoffPromptPack",
    status: "completed",
    now: "2026-05-04T00:00:01.000Z",
  });

  const result = createFrameworkInspectionReport({
    runtimeId: "runtime.inspect",
    manifest: compiled.manifest,
    checkedAt: "2026-05-04T00:00:02.000Z",
    tools: [
      { toolId: "code.read", family: "codeBase", group: "explore", ready: true, required: true },
      { toolId: "shell.commandExecution", family: "shellBase", group: "shellExecution", ready: false, reason: "provider unavailable", required: false },
    ],
    providers: [
      { providerId: "codex_responses", role: "reasoning", ready: true, required: true },
    ],
    dependencies: [
      { dependencyId: "ripgrep", owner: "baseTool", ready: false, required: false, reason: "rg not installed" },
    ],
    promptPackPreview: {
      promptPackId: compiled.manifest.promptPack.promptPackId,
      cachePlan: {
        kind: "praxis.promptPack.cachePlan",
        format: "praxis.promptPack.cachePlan.v1",
        strategy: "stable-segment-prefix",
        orderedSegmentKinds: [
          "stableSystemCore",
          "declaredRuntimeContext",
          "toolDeclarations",
          "projectContext",
          "sessionSummary",
          "memoryContext",
          "retrievedContext",
          "observations",
          "userTurn",
          "assistantScratchpadPlan",
        ],
        providerVisibleSegmentKinds: [
          "stableSystemCore",
          "declaredRuntimeContext",
          "toolDeclarations",
          "projectContext",
          "sessionSummary",
          "memoryContext",
          "retrievedContext",
          "observations",
          "userTurn",
        ],
        segments: [
          {
            segmentId: "prompt.segment.stableSystemCore",
            segmentKind: "stableSystemCore",
            stability: "static",
            cachePolicy: "cacheable-prefix",
            segmentHash: "a".repeat(64),
            estimatedTokens: 12,
            materialRefs: ["material.secret"],
            sourceRefs: ["runtime"],
            providerHints: {},
          },
        ],
        cacheablePrefixSegmentKinds: ["stableSystemCore"],
        dynamicSegmentKinds: [],
        cacheUnit: "prompt-pack-section",
        cachePriority: ["context-quality", "cost", "latency"],
        cacheRiskWarnings: ["dynamic-tool-declaration-in-capability-prefix"],
        providerPayloadCreated: false,
      },
      materials: [
        {
          materialId: "tool:code.read",
          kind: "tool",
          sourceCategory: "declared",
          preview: "Tool: code.read",
          trusted: true,
        },
        {
          materialId: "material.secret",
          kind: "runtime",
          sourceCategory: "declared",
          preview: "token=private-value should be redacted",
          trusted: true,
        },
      ],
    },
    mainLoopSteps: [step],
    selfRepairSignal: {
      faultId: "fault.provider",
      kind: "provider",
      severity: "degraded",
      message: "provider readiness degraded",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.report.runtimeId, "runtime.inspect");
  assert.equal(result.report.status, "degraded");
  assert.equal(result.report.audit.unsafeSideEffects, false);
  assert.equal(result.report.promptPackPreview?.providerPayloadBuilt, false);
  assert.match(result.report.promptPackPreview?.materials[1]?.preview ?? "", /token=\[redacted\]/);
  assert.equal(result.report.promptPackPreview?.cachePlan?.segmentCount, 1);
  assert.deepEqual(result.report.promptPackPreview?.cachePlan?.cacheRiskWarnings, ["dynamic-tool-declaration-in-capability-prefix"]);
  assert.equal(result.report.findings.some((finding) => finding.findingId === "promptPack.cache.dynamic-tool-declaration-in-capability-prefix"), true);
  assert.equal(result.report.providerToolSchema.praxisToolCount, 1);
  assert.equal(result.report.providerToolSchema.expandedToolCount, 1);
  assert.equal(result.report.providerToolSchema.foldedToolCount, 0);
  assert.deepEqual(
    result.report.providerToolSchema.targets.map((target) => target.providerFamily),
    ["openaiResponses", "anthropicMessages", "geminiGenerateContent"],
  );
  assert.equal(result.report.providerToolSchema.targets[0]?.providerToolCount, 4);
  assert.equal(result.report.providerToolSchema.targets[0]?.mappingCount, 1);
  assert.equal(result.report.providerToolSchema.targets[0]?.runtimeDecisionToolCount, 3);
  assert.match(result.report.providerToolSchema.targets[0]?.declarationHash ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(result.report.providerToolSchema.targets[0]?.schemaRejectedRisk, "low");
  assert.deepEqual(result.report.mainLoopTrace.actionPrimitives, ["handoffPromptPack"]);
  assert.deepEqual(result.report.toolReadiness.missing, ["shell.commandExecution"]);
  assert.deepEqual(result.report.dependencyGraph.missing, ["ripgrep"]);
  assert.match(result.report.storage.homeRoot, /\/\.rax$/);
  assert.match(result.report.storage.workspaceRoot, /\/\.rax_workspace$/);
  assert.equal(result.report.storage.writesSecrets, false);
  assert.equal(result.report.storage.initPlanDirectoryCount > 0, true);
  assert.equal(result.report.selfRepair?.unsafeSideEffects, false);
});

test("frameworkInspectionReport exposes linux bubblewrap sandbox readiness and isolation details", () => {
  class BubblewrapInspectableAgent extends PraxisAgent {
    identity = "agent.inspectable.bwrap";
    model = model("gpt-5.4");
    sandbox = sandbox.linuxBubblewrapReadonly();
    harness = harness({
      tools: tools([
        tool("shell.commandExecution", { family: "shellBase", group: "shellExecution" }),
      ]),
      loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 1 }),
    });
  }

  const compiled = compileAgent(BubblewrapInspectableAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.inspectable.bwrap",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const result = createFrameworkInspectionReport({
    runtimeId: "runtime.inspect.bwrap",
    manifest: compiled.manifest,
    sandbox: {
      ready: false,
      required: true,
      reason: "binary:bwrap is missing",
      probeStatus: "missingDependency",
      smokeStatus: "skipped",
      missingDependencies: ["binary:bwrap"],
      selfRepairHints: ["Install bubblewrap through the system package manager, then rerun rax test."],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.sandbox.realIsolation, true);
  assert.equal(result.report.sandbox.linuxBubblewrap?.providerVersion, "v2");
  assert.equal(result.report.sandbox.linuxBubblewrap?.fallback, "explicit-only");
  assert.equal(result.report.sandbox.linuxBubblewrap?.home, ".rax_workspace/sandbox/home");
  assert.equal(result.report.sandbox.linuxBubblewrap?.networkMode, "deny");
  assert.equal(result.report.sandbox.linuxBubblewrap?.deviceExposure, "minimal-by-default");
  assert.deepEqual(result.report.sandbox.readiness.missingDependencies, ["binary:bwrap"]);
  assert.equal(result.report.findings.some((finding) => finding.findingId === "sandbox.provider.not-ready"), true);
});

test("frameworkInspectionReport rejects missing public inputs without leaking internals", () => {
  const missingRuntime = createFrameworkInspectionReport();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.internalDetailExposed, false);
  }

  const missingManifest = createFrameworkInspectionReport({ runtimeId: "runtime.inspect" });
  assert.equal(missingManifest.ok, false);
  if (!missingManifest.ok) {
    assert.equal(missingManifest.error.code, "MISSING_MANIFEST");
    assert.equal(missingManifest.error.publicSafe, true);
  }
});
