import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeKeyboardInputEmulationCore,
  keyboardInputEmulationDescriptor,
  keyboardInputEmulationHandler,
  planKeyboardInputEmulation,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      text: "hello",
      inputMode: "text",
      targetHint: "active-input",
      maxTextLength: 32,
    },
    purpose: "enter text into the focused field",
    context: {
      runtimeId: "runtime-1",
      invocationId: "keyboard-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
  } as const;
}

test("planKeyboardInputEmulation creates a guarded dry-run typing envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planKeyboardInputEmulation({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(keyboardInputEmulationDescriptor.defaultDryRun, true);
  assert.equal(keyboardInputEmulationDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.keyboardInputEmulation");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.textCharacters, 5);
  assert.equal(result.output.target.textBytes, 5);
  assert.equal(result.output.target.inputMode, "text");
  assert.equal(result.output.target.targetHint, "active-input");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.emitted, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.keyboardAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planKeyboardInputEmulation classifies malformed JSON, missing fields, invalid text, scope, and governance gaps", async () => {
  const malformedRequest = await planKeyboardInputEmulation("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planKeyboardInputEmulation({ target: {}, context: "bad", purpose: "type" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planKeyboardInputEmulation({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "type",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planKeyboardInputEmulation({
    text: "hello",
    purpose: "type text",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planKeyboardInputEmulation({
    context: { runtimeId: "runtime-1" },
    text: "hello",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingText = await planKeyboardInputEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type text",
  });
  assert.equal(missingText.ok, false);
  if (!missingText.ok) assert.equal(missingText.error.code, "MISSING_TEXT");

  const invalidMode = await planKeyboardInputEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type text",
    text: "hello",
    inputMode: "key-sequence",
  });
  assert.equal(invalidMode.ok, false);
  if (!invalidMode.ok) assert.equal(invalidMode.error.code, "INVALID_INPUT_MODE");

  const invalidLimit = await planKeyboardInputEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type text",
    text: "hello",
    maxTextLength: 0,
  });
  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) assert.equal(invalidLimit.error.code, "INVALID_TEXT_LIMIT");

  const textLimitExceeded = await planKeyboardInputEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type text",
    text: "hello",
    maxTextLength: 3,
  });
  assert.equal(textLimitExceeded.ok, false);
  if (!textLimitExceeded.ok) assert.equal(textLimitExceeded.error.code, "TEXT_LIMIT_EXCEEDED");

  const deniedScope = await planKeyboardInputEmulation({
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

test("executeKeyboardInputEmulationCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeKeyboardInputEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeKeyboardInputEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeKeyboardInputEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private keyboard backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private keyboard"), false);
  }
});

test("keyboardInputEmulationHandler invokes runtime-owned executor.computeruse.keyboardAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async keyboardAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "keyboard-action-1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await keyboardInputEmulationHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "enter text into the focused field",
      target: {
        text: "hello",
        inputMode: "paste",
        targetHint: "active-input",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    action?: string;
    text?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.action, "type");
  assert.equal(runtimeCall.text, "hello");
  assert.equal(runtimeCall.metadata?.inputMode, "paste");
  assert.equal(runtimeCall.metadata?.targetHint, "active-input");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.actionEnvelope.actionId, "keyboard-action-1");
  assert.equal(result.output.actionEnvelope.inputMode, "paste");
});

test("createBaseToolRegistry resolves computeruse.keyboardInputEmulation handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardInputEmulation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "type into the focused field",
      text: "hello",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.keyboardInputEmulation keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.keyboardInputEmulation.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /keyboardInputEmulationHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.keyboardInputEmulation.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.keyboardAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
