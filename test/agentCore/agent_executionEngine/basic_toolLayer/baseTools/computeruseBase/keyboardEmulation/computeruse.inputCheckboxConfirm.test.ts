import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeInputCheckboxConfirmCore,
  inputCheckboxConfirmDescriptor,
  inputCheckboxConfirmHandler,
  planInputCheckboxConfirm,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      label: "I agree",
      expectedState: "checked",
      currentState: "unchecked",
      confirmationKey: "space",
    },
    purpose: "confirm the agreement checkbox",
    context: {
      runtimeId: "runtime-1",
      invocationId: "checkbox-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
  } as const;
}

test("planInputCheckboxConfirm creates a guarded dry-run checkbox envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planInputCheckboxConfirm({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(inputCheckboxConfirmDescriptor.defaultDryRun, true);
  assert.equal(inputCheckboxConfirmDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.inputCheckboxConfirm");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.label, "I agree");
  assert.equal(result.output.target.expectedState, "checked");
  assert.equal(result.output.target.currentState, "unchecked");
  assert.equal(result.output.target.wouldToggle, true);
  assert.deepEqual(result.output.target.keySequence, ["Space"]);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.emitted, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.keyboardAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planInputCheckboxConfirm classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planInputCheckboxConfirm("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planInputCheckboxConfirm({ target: {}, context: "bad", purpose: "confirm" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const missingRuntime = await planInputCheckboxConfirm({
    purpose: "confirm checkbox",
    target: { label: "I agree" },
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    target: { label: "I agree" },
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingTarget = await planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm checkbox",
  });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error.code, "MISSING_TARGET");

  const malformedTarget = await planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm checkbox",
    target: "bad",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const invalidState = await planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm checkbox",
    target: { label: "I agree", expectedState: "maybe" },
  });
  assert.equal(invalidState.ok, false);
  if (!invalidState.ok) assert.equal(invalidState.error.code, "INVALID_STATE");

  const invalidKey = await planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    purpose: "confirm checkbox",
    target: { label: "I agree", confirmationKey: "tab" },
  });
  assert.equal(invalidKey.ok, false);
  if (!invalidKey.ok) assert.equal(invalidKey.error.code, "INVALID_CONFIRMATION_KEY");

  const deniedScope = await planInputCheckboxConfirm({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeInputCheckboxConfirmCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeInputCheckboxConfirmCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeInputCheckboxConfirmCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeInputCheckboxConfirmCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private checkbox backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private checkbox"), false);
  }
});

test("executeInputCheckboxConfirmCore does not dispatch when current state already matches expected state", async () => {
  let providerCalled = false;
  const result = await executeInputCheckboxConfirmCore({
    ...legalDryRunInput(),
    target: { label: "I agree", expectedState: "checked", currentState: "checked" },
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-toggle" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) return;
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.emitted, false);
  assert.equal(result.output.actionEnvelope.wouldToggle, false);
});

test("inputCheckboxConfirmHandler invokes runtime-owned executor.computeruse.keyboardAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async keyboardAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "checkbox-confirm-action",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await inputCheckboxConfirmHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "confirm agreement",
      target: {
        selectorHint: "input[type=checkbox][name=agree]",
        expectedState: "checked",
        currentState: "unchecked",
        confirmationKey: "enter",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    action?: string;
    keys?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.action, "confirm");
  assert.deepEqual(runtimeCall.keys, ["Enter"]);
  assert.equal(runtimeCall.metadata?.selectorHint, "input[type=checkbox][name=agree]");
  assert.equal(runtimeCall.metadata?.expectedState, "checked");
  assert.equal(runtimeCall.metadata?.currentState, "unchecked");
  assert.equal(runtimeCall.metadata?.confirmationKey, "enter");
  assert.equal(runtimeCall.metadata?.wouldToggle, true);
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.actionEnvelope.actionId, "checkbox-confirm-action");
});

test("createBaseToolRegistry resolves computeruse.inputCheckboxConfirm handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.inputCheckboxConfirm");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "confirm checkbox",
      target: { label: "I agree", currentState: "unchecked", expectedState: "checked" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.inputCheckboxConfirm keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.inputCheckboxConfirm.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /inputCheckboxConfirmHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.inputCheckboxConfirm.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.keyboardAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
