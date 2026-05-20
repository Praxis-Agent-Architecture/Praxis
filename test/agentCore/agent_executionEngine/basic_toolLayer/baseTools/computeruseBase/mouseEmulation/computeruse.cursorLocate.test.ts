import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cursorLocateDescriptor,
  cursorLocateHandler,
  executeCursorLocateCore,
  planCursorLocate,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      coordinateSpace: "window",
      displayId: "display-1",
    },
    purpose: "record cursor position before a guarded click",
    context: {
      runtimeId: "runtime-1",
      invocationId: "cursor-1",
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  } as const;
}

test("planCursorLocate creates a governed dry-run cursor observation envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCursorLocate({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { position: { x: 1, y: 2, coordinateSpace: "screen" } };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cursorLocateDescriptor.defaultDryRun, true);
  assert.equal(cursorLocateDescriptor.unsafeSideEffects, false);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cursorLocate");
  assert.equal(result.output.dispatch, "dry-run");
  assert.deepEqual(result.output.target, {
    coordinateSpace: "window",
    displayId: "display-1",
  });
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.observationEnvelope.observed, false);
  assert.equal(result.output.observationEnvelope.metadataOnly, true);
  assert.equal(result.output.position, undefined);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.locateCursor");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCursorLocate accepts top-level target options and defaults coordinate space", async () => {
  const result = await planCursorLocate({
    purpose: "locate cursor",
    context: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.target.coordinateSpace, "screen");
  assert.equal(result.output.target.displayId, undefined);
});

test("planCursorLocate classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planCursorLocate("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCursorLocate({ context: "bad", purpose: "locate" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCursorLocate({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "locate",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCursorLocate({ purpose: "locate" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planCursorLocate({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidCoordinateSpace = await planCursorLocate({
    context: { runtimeId: "runtime-1" },
    purpose: "locate",
    target: { coordinateSpace: "viewport" },
  });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");

  const invalidDisplayId = await planCursorLocate({
    context: { runtimeId: "runtime-1" },
    purpose: "locate",
    target: { displayId: "\0bad" },
  });
  assert.equal(invalidDisplayId.ok, false);
  if (!invalidDisplayId.ok) assert.equal(invalidDisplayId.error.code, "INVALID_DISPLAY_ID");

  const deniedScope = await planCursorLocate({
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

test("executeCursorLocateCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCursorLocateCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCursorLocateCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCursorLocateCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private display server detail");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private display"), false);
  }

  const badPosition = await executeCursorLocateCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => ({ position: { x: -1, y: 2, coordinateSpace: "screen" } }),
  });
  assert.equal(badPosition.ok, false);
  if (!badPosition.ok) assert.equal(badPosition.error.code, "INVALID_CURSOR_POSITION");
});

test("cursorLocateHandler invokes runtime-owned executor.computeruse.locateCursor when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async locateCursor(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            x: 320,
            y: 240,
            coordinateSpace: request.coordinateSpace ?? "screen",
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cursorLocateHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "record cursor position before a guarded click",
      target: {
        coordinateSpace: "screen",
        displayId: "display-1",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    coordinateSpace?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.coordinateSpace, "screen");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "record cursor position before a guarded click");
  assert.equal(runtimeCall.metadata?.displayId, "display-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.deepEqual(result.output.position, {
    x: 320,
    y: 240,
    coordinateSpace: "screen",
    displayId: "display-1",
  });
});

test("createBaseToolRegistry resolves computeruse.cursorLocate handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cursorLocate");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "locate cursor",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cursorLocate keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.cursorLocate");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cursorLocate.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.cursorLocate.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cursorLocateHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cursorLocate.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.locateCursor/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
