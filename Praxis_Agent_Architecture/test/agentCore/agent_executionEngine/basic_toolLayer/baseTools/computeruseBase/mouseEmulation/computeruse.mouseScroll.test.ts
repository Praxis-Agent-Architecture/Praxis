import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMouseScrollCore,
  mouseScrollDescriptor,
  mouseScrollHandler,
  planMouseScroll,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      deltaX: 0,
      deltaY: 640.2,
      at: { x: 120.2, y: 80.7 },
      coordinateSpace: "window",
      displayId: "display-1",
      durationMs: 150,
    },
    purpose: "scroll the selected list down",
    context: {
      runtimeId: "runtime-1",
      invocationId: "scroll-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  } as const;
}

test("planMouseScroll creates a governed dry-run pointer scroll envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMouseScroll({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(mouseScrollDescriptor.defaultDryRun, true);
  assert.equal(mouseScrollDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.mouseScroll");
  assert.equal(result.output.dispatch, "dry-run");
  assert.deepEqual(result.output.target, {
    deltaX: 0,
    deltaY: 640,
    unit: "pixel",
    coordinateSpace: "window",
    at: { x: 120, y: 81 },
    displayId: "display-1",
    windowId: undefined,
    durationMs: 150,
    usesCurrentCursor: false,
  });
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.executed, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.pointerAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMouseScroll accepts top-level deltas and defaults to current cursor", async () => {
  const result = await planMouseScroll({
    deltaY: -120,
    purpose: "scroll up",
    context: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.target.deltaX, 0);
  assert.equal(result.output.target.deltaY, -120);
  assert.equal(result.output.target.coordinateSpace, "screen");
  assert.equal(result.output.target.durationMs, 0);
  assert.equal(result.output.target.usesCurrentCursor, true);
});

test("planMouseScroll classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMouseScroll("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMouseScroll({ target: { deltaY: 1 }, context: "bad", purpose: "scroll" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMouseScroll({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "scroll",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMouseScroll({ target: { deltaY: 1 }, purpose: "scroll" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planMouseScroll({ target: { deltaY: 1 }, context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingDelta = await planMouseScroll({ context: { runtimeId: "runtime-1" }, purpose: "scroll" });
  assert.equal(missingDelta.ok, false);
  if (!missingDelta.ok) assert.equal(missingDelta.error.code, "MISSING_SCROLL_DELTA");

  const invalidDelta = await planMouseScroll({
    context: { runtimeId: "runtime-1" },
    purpose: "scroll",
    target: { deltaX: 0, deltaY: 0 },
  });
  assert.equal(invalidDelta.ok, false);
  if (!invalidDelta.ok) assert.equal(invalidDelta.error.code, "INVALID_SCROLL_DELTA");

  const invalidPoint = await planMouseScroll({
    context: { runtimeId: "runtime-1" },
    purpose: "scroll",
    target: { deltaY: 1, at: { x: -1, y: 2 } },
  });
  assert.equal(invalidPoint.ok, false);
  if (!invalidPoint.ok) assert.equal(invalidPoint.error.code, "INVALID_POINT");

  const invalidDuration = await planMouseScroll({
    context: { runtimeId: "runtime-1" },
    purpose: "scroll",
    target: { deltaY: 1, durationMs: -1 },
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) assert.equal(invalidDuration.error.code, "INVALID_DURATION");

  const invalidCoordinateSpace = await planMouseScroll({
    context: { runtimeId: "runtime-1" },
    purpose: "scroll",
    target: { deltaY: 1, coordinateSpace: "viewport" },
  });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");

  const deniedScope = await planMouseScroll({
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

test("executeMouseScrollCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMouseScrollCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMouseScrollCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMouseScrollCore({
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
});

test("mouseScrollHandler invokes runtime-owned executor.computeruse.pointerAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async pointerAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "action:pointer:scroll:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await mouseScrollHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "scroll the selected list down",
      target: {
        deltaY: 640,
        at: { x: 320, y: 240 },
        coordinateSpace: "screen",
        durationMs: 120,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    action?: string;
    target?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.action, "scroll");
  assert.deepEqual(runtimeCall.target, {
    deltaX: 0,
    deltaY: 640,
    unit: "pixel",
    at: { x: 320, y: 240 },
    coordinateSpace: "screen",
    displayId: undefined,
    windowId: undefined,
    durationMs: 120,
  });
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "scroll the selected list down");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.actionEnvelope.actionId, "action:pointer:scroll:1");
});

test("createBaseToolRegistry resolves computeruse.mouseScroll handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.mouseScroll");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "scroll",
      target: { deltaY: 120 },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.mouseScroll keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseScroll");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.mouseScroll.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseScroll.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /mouseScrollHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.mouseScroll.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.pointerAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
