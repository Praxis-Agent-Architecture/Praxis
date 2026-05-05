import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeKeyboardEmulationCore,
  keyboardEmulationDescriptor,
  keyboardEmulationHandler,
  planKeyboardEmulation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      targetHint: "focused-editor",
      actions: [
        { kind: "shortcut", keys: ["Control", "Shift", "P"] },
        { kind: "text", text: "Format Document" },
        { kind: "key-press", key: "Enter", repeat: 2 },
      ],
    },
    purpose: "open command palette and submit a command",
    context: {
      runtimeId: "runtime-1",
      invocationId: "keyboard-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
  } as const;
}

test("planKeyboardEmulation creates a guarded dry-run keyboard sequence envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planKeyboardEmulation({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { actionId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(keyboardEmulationDescriptor.defaultDryRun, true);
  assert.equal(keyboardEmulationDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.keyboardEmulation");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.targetHint, "focused-editor");
  assert.equal(result.output.target.actions.length, 3);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.actionEnvelope.emitted, false);
  assert.equal(result.output.actionEnvelope.metadataOnly, true);
  assert.equal(result.output.actionEnvelope.actionCount, 4);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.keyboardAction");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planKeyboardEmulation classifies malformed JSON, missing fields, invalid actions, scope, and governance gaps", async () => {
  const malformedRequest = await planKeyboardEmulation("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planKeyboardEmulation({ actions: [], context: "bad", purpose: "type" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planKeyboardEmulation({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "type",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planKeyboardEmulation({
    purpose: "type",
    actions: [{ kind: "key-press", key: "Enter" }],
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planKeyboardEmulation({
    context: { runtimeId: "runtime-1" },
    actions: [{ kind: "key-press", key: "Enter" }],
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingActions = await planKeyboardEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type",
  });
  assert.equal(missingActions.ok, false);
  if (!missingActions.ok) assert.equal(missingActions.error.code, "MISSING_ACTIONS");

  const invalidActions = await planKeyboardEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type",
    actions: "bad",
  });
  assert.equal(invalidActions.ok, false);
  if (!invalidActions.ok) assert.equal(invalidActions.error.code, "INVALID_ACTIONS");

  const invalidAction = await planKeyboardEmulation({
    context: { runtimeId: "runtime-1" },
    purpose: "type",
    actions: [{ kind: "shortcut", keys: ["Control"] }],
  });
  assert.equal(invalidAction.ok, false);
  if (!invalidAction.ok) assert.equal(invalidAction.error.code, "INVALID_ACTION");

  const deniedScope = await planKeyboardEmulation({
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

test("executeKeyboardEmulationCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeKeyboardEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeKeyboardEmulationCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeKeyboardEmulationCore({
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

test("keyboardEmulationHandler invokes runtime-owned executor.computeruse.keyboardAction when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async keyboardAction(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            actionId: "keyboard-action-" + calls.length,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await keyboardEmulationHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "type and submit a command",
      actions: [
        { kind: "text", text: "hello" },
        { kind: "shortcut", keys: ["Control", "Enter"] },
        { kind: "key-press", key: "Escape", repeat: 2 },
      ],
      targetHint: "active-input",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 4);
  const firstRuntimeCall = calls[0] as {
    action?: string;
    text?: string;
    keys?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  assert.equal(firstRuntimeCall.action, "type");
  assert.equal(firstRuntimeCall.text, "hello");
  assert.equal(firstRuntimeCall.metadata?.targetHint, "active-input");
  assert.equal(firstRuntimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(firstRuntimeCall.metadata?.sessionId, "session-1");
  assert.equal(firstRuntimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(firstRuntimeCall.metadata?.actionIndex, 0);

  const thirdRuntimeCall = calls[2] as {
    action?: string;
    keys?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  assert.equal(thirdRuntimeCall.action, "press");
  assert.deepEqual(thirdRuntimeCall.keys, ["Escape"]);
  assert.equal(thirdRuntimeCall.metadata?.repeat, 1);
  assert.equal(thirdRuntimeCall.metadata?.actionIndex, 2);

  const fourthRuntimeCall = calls[3] as {
    action?: string;
    keys?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  assert.equal(fourthRuntimeCall.action, "press");
  assert.deepEqual(fourthRuntimeCall.keys, ["Escape"]);
  assert.equal(fourthRuntimeCall.metadata?.repeat, 1);
  assert.equal(fourthRuntimeCall.metadata?.actionIndex, 3);
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.deepEqual(result.output.actionEnvelope.actionIds, [
    "keyboard-action-1",
    "keyboard-action-2",
    "keyboard-action-3",
    "keyboard-action-4",
  ]);
  assert.equal(result.output.actionEnvelope.actionCount, 4);
});

test("createBaseToolRegistry resolves computeruse.keyboardEmulation handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardEmulation");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "press escape",
      actions: [{ kind: "key-press", key: "Escape" }],
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.keyboardEmulation keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.keyboardEmulation.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /keyboardEmulationHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.keyboardEmulation.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.keyboardAction/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /context\.contract/u);
  assert.match(docText, /context\.governance/u);
  assert.match(docText, /INVALID_TARGET_HINT/u);
  assert.match(docText, /CONTRACT_REJECTED/u);
  assert.match(docText, /Do not hide local shell/u);
});
