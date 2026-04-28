import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMouseEmulationCore,
  mouseEmulationDescriptor,
  mouseEmulationHandler,
  planMouseEmulation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    purpose: "move to the selected control and click",
    steps: [
      { kind: "locate", coordinateSpace: "screen" },
      { kind: "move", target: { x: 20.2, y: 30.8 }, durationMs: 50 },
      { kind: "click", button: "left", clickCount: 1 },
    ],
    context: {
      runtimeId: "runtime-1",
      invocationId: "mouse-seq-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  } as const;
}

test("planMouseEmulation creates a governed dry-run mouse sequence envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMouseEmulation({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { stepResults: [] };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(mouseEmulationDescriptor.defaultDryRun, true);
  assert.equal(mouseEmulationDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.mouseEmulation");
  assert.equal(result.output.operation, "simulate-mouse-operations");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.sequenceEnvelope.executed, false);
  assert.equal(result.output.sequenceEnvelope.metadataOnly, true);
  assert.equal(result.output.sequenceEnvelope.stepResults.length, 3);
  assert.deepEqual(result.output.steps[1], {
    kind: "move",
    target: { x: 20, y: 31 },
    coordinateSpace: "screen",
    displayId: undefined,
    windowId: undefined,
    durationMs: 50,
  });
  assert.equal(result.output.runtimeEntry.ports[0], "BaseToolExecutorPort.computeruse.locateCursor");
  assert.equal(result.output.runtimeEntry.ports[1], "BaseToolExecutorPort.computeruse.pointerAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMouseEmulation classifies malformed JSON, missing fields, invalid steps, scope, and governance gaps", async () => {
  const malformedRequest = await planMouseEmulation("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const missingSteps = await planMouseEmulation({ purpose: "move", context: { runtimeId: "runtime-1" } });
  assert.equal(missingSteps.ok, false);
  if (!missingSteps.ok) assert.equal(missingSteps.error.code, "MISSING_STEPS");

  const malformedContext = await planMouseEmulation({ steps: [{ kind: "locate" }], context: "bad", purpose: "move" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const missingRuntime = await planMouseEmulation({ purpose: "move", steps: [{ kind: "locate" }] });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planMouseEmulation({ context: { runtimeId: "runtime-1" }, steps: [{ kind: "locate" }] });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidMove = await planMouseEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "move",
    steps: [{ kind: "move", target: { x: -1, y: 0 } }],
  });
  assert.equal(invalidMove.ok, false);
  if (!invalidMove.ok) assert.equal(invalidMove.error.code, "INVALID_TARGET");

  const invalidCoordinateSpace = await planMouseEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "move",
    steps: [{ kind: "locate", coordinateSpace: "viewport" }],
  });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");

  const invalidClickCount = await planMouseEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "click",
    steps: [{ kind: "click", clickCount: 4 }],
  });
  assert.equal(invalidClickCount.ok, false);
  if (!invalidClickCount.ok) assert.equal(invalidClickCount.error.code, "INVALID_CLICK_COUNT");

  const tooMany = await planMouseEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "move",
    maxSteps: 1,
    steps: [{ kind: "locate" }, { kind: "click" }],
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.error.code, "STEP_LIMIT_EXCEEDED");

  const deniedScope = await planMouseEmulation({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeMouseEmulationCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMouseEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMouseEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMouseEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private pointer backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private pointer"), false);
  }

  const malformedLocateProvider = await executeMouseEmulationCore({
    purpose: "review malformed provider output",
    steps: [{ kind: "locate" }],
    context: { runtimeId: "runtime-1", dryRun: false, guard: { accepted: true } },
    provider: () => ({
      stepResults: [{ index: 0, kind: "locate", position: { x: 1, y: 2 } }],
    }),
  });
  assert.equal(malformedLocateProvider.ok, false);
  if (!malformedLocateProvider.ok) {
    assert.equal(malformedLocateProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(malformedLocateProvider.error.publicSafe, true);
    assert.equal(malformedLocateProvider.error.internalDetailExposed, false);
  }
});

test("mouseEmulationHandler invokes runtime-owned locateCursor and pointerAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async locateCursor(request) {
        calls.push({ port: "locateCursor", request });
        return {
          ok: true,
          output: { x: 10, y: 20, coordinateSpace: request.coordinateSpace ?? "screen" },
          metadata: { adapter: "fake-locate" },
        };
      },
      async pointerAction(request) {
        calls.push({ port: "pointerAction", request });
        return {
          ok: true,
          output: {
            actionId: `action:pointer:${request.action}:${calls.length}`,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-pointer" },
        };
      },
    },
  };

  const result = await mouseEmulationHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "move to the selected control and click",
      steps: [
        { kind: "locate", coordinateSpace: "screen" },
        { kind: "move", target: { x: 320, y: 240 }, coordinateSpace: "screen" },
        { kind: "click", button: "left", clickCount: 1 },
      ],
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.equal((calls[0] as { port: string }).port, "locateCursor");
  assert.equal((calls[1] as { port: string; request: { action?: string } }).request.action, "move");
  assert.equal((calls[2] as { port: string; request: { action?: string } }).request.action, "click");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.sequenceEnvelope.executed, true);
  assert.equal(result.output.sequenceEnvelope.stepResults.length, 3);
  assert.equal(result.output.sequenceEnvelope.stepResults[0]?.position?.x, 10);
  assert.match(result.output.sequenceEnvelope.stepResults[1]?.actionId ?? "", /^action:pointer:move:/u);
});

test("createBaseToolRegistry resolves computeruse.mouseEmulation handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.mouseEmulation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      ...legalDryRunInput(),
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.mouseEmulation keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseEmulation",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.mouseEmulation.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), `missing canonical storage file ${fileName}`);
  }

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /mouseEmulationHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.mouseEmulation.md"), "utf8");
  for (const heading of [
    "## Use This Tool",
    "## Call Shape",
    "## Required Inputs",
    "## Optional Inputs",
    "## Runtime Behavior",
    "## Returns",
    "## Example",
    "## Avoid",
  ]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.locateCursor/u);
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.pointerAction/u);
  assert.match(docText, /TAP\/agent/u);
});
