import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeKeyboardSubmitInputCore,
  keyboardSubmitInputDescriptor,
  keyboardSubmitInputHandler,
  planKeyboardSubmitInput,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      submitKey: "NumpadEnter",
      repeat: 2,
      targetHint: "active-input",
    },
    purpose: "submit the focused input",
    context: {
      runtimeId: "runtime-1",
      invocationId: "submit-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
  } as const;
}

test("planKeyboardSubmitInput creates a guarded dry-run submit envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planKeyboardSubmitInput({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(keyboardSubmitInputDescriptor.defaultDryRun, true);
  assert.equal(keyboardSubmitInputDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.keyboardSubmitInput");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.submitKey, "NumpadEnter");
  assert.equal(result.output.target.repeat, 2);
  assert.equal(result.output.target.targetHint, "active-input");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.emitted, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.keyboardAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planKeyboardSubmitInput classifies malformed JSON, missing fields, invalid submit target, scope, and governance gaps", async () => {
  const malformedRequest = await planKeyboardSubmitInput("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planKeyboardSubmitInput({ target: {}, context: "bad", purpose: "submit" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planKeyboardSubmitInput({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "submit",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planKeyboardSubmitInput({
    purpose: "submit input",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planKeyboardSubmitInput({
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidSubmitKey = await planKeyboardSubmitInput({
    context: { runtimeId: "runtime-1" },
    purpose: "submit input",
    submitKey: "Escape",
  });
  assert.equal(invalidSubmitKey.ok, false);
  if (!invalidSubmitKey.ok) assert.equal(invalidSubmitKey.error.code, "INVALID_SUBMIT_KEY");

  const invalidRepeat = await planKeyboardSubmitInput({
    context: { runtimeId: "runtime-1" },
    purpose: "submit input",
    repeat: 0,
  });
  assert.equal(invalidRepeat.ok, false);
  if (!invalidRepeat.ok) assert.equal(invalidRepeat.error.code, "INVALID_REPEAT");

  const deniedScope = await planKeyboardSubmitInput({
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

test("executeKeyboardSubmitInputCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeKeyboardSubmitInputCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeKeyboardSubmitInputCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeKeyboardSubmitInputCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private keyboard submit backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private keyboard"), false);
  }
});

test("keyboardSubmitInputHandler invokes runtime-owned executor.computeruse.keyboardAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async keyboardAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "keyboard-submit-action-" + calls.length,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await keyboardSubmitInputHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "submit the focused input",
      target: {
        submitKey: "NumpadEnter",
        targetHint: "active-input",
        repeat: 2,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  const firstRuntimeCall = calls[0] as {
    action?: string;
    keys?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  assert.equal(firstRuntimeCall.action, "submit");
  assert.deepEqual(firstRuntimeCall.keys, ["NumpadEnter"]);
  assert.equal(firstRuntimeCall.metadata?.targetHint, "active-input");
  assert.equal(firstRuntimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(firstRuntimeCall.metadata?.sessionId, "session-1");
  assert.equal(firstRuntimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(firstRuntimeCall.metadata?.repeat, 2);
  assert.equal(firstRuntimeCall.metadata?.actionIndex, 0);
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.deepEqual(result.output.actionEnvelope.actionIds, ["keyboard-submit-action-1", "keyboard-submit-action-2"]);
  assert.equal(result.output.actionEnvelope.submitKey, "NumpadEnter");
});

test("createBaseToolRegistry resolves computeruse.keyboardSubmitInput handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardSubmitInput");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "submit focused input",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.keyboardSubmitInput keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.keyboardSubmitInput.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /keyboardSubmitInputHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.keyboardSubmitInput.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.keyboardAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
