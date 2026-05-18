import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  checkboxConfirmDescriptor,
  checkboxConfirmHandler,
  executeCheckboxConfirmCore,
  planCheckboxConfirm,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      label: "I agree",
      point: { x: 120.2, y: 240.7 },
      expectedState: "checked",
      currentState: "unchecked",
      coordinateSpace: "screen",
      displayId: "display-1",
    },
    purpose: "confirm the visible I agree checkbox is checked",
    context: {
      runtimeId: "runtime-1",
      invocationId: "checkbox-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  } as const;
}

test("planCheckboxConfirm creates a governed dry-run checkbox confirmation envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCheckboxConfirm({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(checkboxConfirmDescriptor.defaultDryRun, true);
  assert.equal(checkboxConfirmDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.checkboxConfirm");
  assert.equal(result.output.dispatch, "dry-run");
  assert.deepEqual(result.output.target, {
    expectedState: "checked",
    currentState: "unchecked",
    label: "I agree",
    selectorHint: undefined,
    point: { x: 120, y: 241 },
    coordinateSpace: "screen",
    displayId: "display-1",
    windowId: undefined,
    clickMode: "single-click",
    clickCount: 1,
    wouldToggle: true,
  });
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.executed, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.pointerAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCheckboxConfirm accepts top-level target hints and defaults state and click mode", async () => {
  const result = await planCheckboxConfirm({
    label: "I agree",
    purpose: "confirm checkbox",
    context: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.target.label, "I agree");
  assert.equal(result.output.target.expectedState, "checked");
  assert.equal(result.output.target.clickMode, "single-click");
  assert.equal(result.output.target.clickCount, 1);
  assert.equal(result.output.target.coordinateSpace, "screen");
  assert.equal(result.output.target.wouldToggle, true);
});

test("planCheckboxConfirm classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planCheckboxConfirm("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCheckboxConfirm({ target: { label: "I agree" }, context: "bad", purpose: "confirm" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCheckboxConfirm({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "confirm",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCheckboxConfirm({ target: { label: "I agree" }, purpose: "confirm" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planCheckboxConfirm({ target: { label: "I agree" }, context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingTarget = await planCheckboxConfirm({ context: { runtimeId: "runtime-1" }, purpose: "confirm" });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error.code, "MISSING_TARGET");

  const invalidPoint = await planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm",
    target: { point: { x: -1, y: 20 } },
  });
  assert.equal(invalidPoint.ok, false);
  if (!invalidPoint.ok) assert.equal(invalidPoint.error.code, "INVALID_POINT");

  const invalidState = await planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm",
    target: { label: "I agree", expectedState: "mixed" },
  });
  assert.equal(invalidState.ok, false);
  if (!invalidState.ok) assert.equal(invalidState.error.code, "INVALID_STATE");

  const invalidClickMode = await planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm",
    target: { label: "I agree", clickMode: "triple-click" },
  });
  assert.equal(invalidClickMode.ok, false);
  if (!invalidClickMode.ok) assert.equal(invalidClickMode.error.code, "INVALID_CLICK_MODE");

  const deniedScope = await planCheckboxConfirm({
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

test("executeCheckboxConfirmCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCheckboxConfirmCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCheckboxConfirmCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCheckboxConfirmCore({
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

test("checkboxConfirmHandler invokes runtime-owned executor.computeruse.pointerAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async pointerAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "action:pointer:confirm:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await checkboxConfirmHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "confirm the visible I agree checkbox is checked",
      target: {
        label: "I agree",
        point: { x: 120, y: 240 },
        expectedState: "checked",
        currentState: "unchecked",
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
  assert.equal(runtimeCall.action, "confirm");
  assert.deepEqual(runtimeCall.target, {
    expectedState: "checked",
    currentState: "unchecked",
    label: "I agree",
    selectorHint: undefined,
    point: { x: 120, y: 240 },
    coordinateSpace: "screen",
    displayId: undefined,
    windowId: undefined,
    clickMode: "single-click",
    clickCount: 1,
    wouldToggle: true,
  });
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "confirm the visible I agree checkbox is checked");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.actionEnvelope.actionId, "action:pointer:confirm:1");
});

test("createBaseToolRegistry resolves computeruse.checkboxConfirm handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.checkboxConfirm");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "confirm checkbox",
      target: { label: "I agree" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.checkboxConfirm keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.checkboxConfirm");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.checkboxConfirm.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /checkboxConfirmHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.checkboxConfirm.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.pointerAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
