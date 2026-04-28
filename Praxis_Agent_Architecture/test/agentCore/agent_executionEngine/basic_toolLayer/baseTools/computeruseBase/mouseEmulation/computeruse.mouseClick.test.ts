import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMouseClickCore,
  mouseClickDescriptor,
  mouseClickHandler,
  planMouseClick,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      button: "right",
      clickCount: 2,
      at: { x: 10.2, y: 20.7 },
      coordinateSpace: "window",
      displayId: "display-1",
    },
    purpose: "activate the selected control",
    context: {
      runtimeId: "runtime-1",
      invocationId: "click-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  } as const;
}

test("planMouseClick creates a governed dry-run pointer action envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMouseClick({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(mouseClickDescriptor.defaultDryRun, true);
  assert.equal(mouseClickDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.mouseClick");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.button, "right");
  assert.equal(result.output.target.clickCount, 2);
  assert.deepEqual(result.output.target.at, { x: 10, y: 21 });
  assert.equal(result.output.target.coordinateSpace, "window");
  assert.equal(result.output.target.usesCurrentCursor, false);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.executed, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.pointerAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMouseClick supports current-cursor default click while remaining dry-run", async () => {
  const result = await planMouseClick({
    purpose: "click the focused control",
    context: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.target.button, "left");
  assert.equal(result.output.target.clickCount, 1);
  assert.equal(result.output.target.coordinateSpace, "screen");
  assert.equal(result.output.target.usesCurrentCursor, true);
});

test("planMouseClick classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMouseClick("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMouseClick({ target: {}, context: "bad", purpose: "click" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMouseClick({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "click",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMouseClick({ purpose: "click" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planMouseClick({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidButton = await planMouseClick({
    context: { runtimeId: "runtime-1" },
    purpose: "click",
    button: "primary",
  });
  assert.equal(invalidButton.ok, false);
  if (!invalidButton.ok) assert.equal(invalidButton.error.code, "INVALID_BUTTON");

  const invalidCount = await planMouseClick({
    context: { runtimeId: "runtime-1" },
    purpose: "click",
    clickCount: 4,
  });
  assert.equal(invalidCount.ok, false);
  if (!invalidCount.ok) assert.equal(invalidCount.error.code, "INVALID_CLICK_COUNT");

  const invalidPoint = await planMouseClick({
    context: { runtimeId: "runtime-1" },
    purpose: "click",
    at: { x: Number.NaN, y: 1 },
  });
  assert.equal(invalidPoint.ok, false);
  if (!invalidPoint.ok) assert.equal(invalidPoint.error.code, "INVALID_POINT");

  const invalidCoordinateSpace = await planMouseClick({
    context: { runtimeId: "runtime-1" },
    purpose: "click",
    coordinateSpace: "viewport",
  });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");

  const deniedScope = await planMouseClick({
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

test("executeMouseClickCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMouseClickCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMouseClickCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMouseClickCore({
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

test("mouseClickHandler invokes runtime-owned executor.computeruse.pointerAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async pointerAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "action:pointer:click:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await mouseClickHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "activate the selected control",
      target: {
        button: "left",
        clickCount: 1,
        at: { x: 320, y: 240 },
        coordinateSpace: "screen",
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
  assert.equal(runtimeCall.action, "click");
  assert.deepEqual(runtimeCall.target, {
    button: "left",
    clickCount: 1,
    at: { x: 320, y: 240 },
    coordinateSpace: "screen",
    displayId: undefined,
    windowId: undefined,
    usesCurrentCursor: false,
  });
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "activate the selected control");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.actionEnvelope.actionId, "action:pointer:click:1");
});

test("createBaseToolRegistry resolves computeruse.mouseClick handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.mouseClick");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "activate the selected control",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.mouseClick keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseClick");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.mouseClick.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseClick.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /mouseClickHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.mouseClick.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.pointerAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
