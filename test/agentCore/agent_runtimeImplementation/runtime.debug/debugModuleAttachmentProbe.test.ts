import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { probeDebugModuleAttachment } from "../../../../src/runtimeImplementation/runtime.debug/debugModuleAttachmentProbe.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.debug/debugModuleAttachmentProbe.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugModuleAttachmentProbe.md",
  testFileUrl: import.meta.url,
});

test("debugModuleAttachmentProbe reports attached and paused modules as readonly observations", () => {
  const result = probeDebugModuleAttachment({
    runtimeId: " runtime:alpha ",
    caller: { kind: "debug", id: " debugger " },
    attachments: [
      {
        moduleId: " cmp ",
        moduleKind: "cmp",
        phase: "attached",
        requiredScopes: ["module.bridge"],
        grantedScopes: ["module.bridge"],
      },
      {
        moduleId: " tap ",
        moduleKind: "tap",
        phase: "paused",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.runtimeId, "runtime:alpha");
  assert.equal(result.report.status, "needs-attention");
  assert.equal(result.report.observations[0]?.status, "attached");
  assert.equal(result.report.observations[1]?.status, "paused");
  assert.equal(result.report.observations[1]?.mounted, true);
  assert.equal(result.report.unsafeSideEffects, false);
});

test("debugModuleAttachmentProbe fails when a required module is not attached", () => {
  const result = probeDebugModuleAttachment({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspector" },
    requiredModuleIds: ["cmp"],
    attachments: [
      {
        moduleId: "cmp",
        moduleKind: "cmp",
        phase: "detached",
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MODULE_NOT_MOUNTED");
  assert.equal(result.error.boundary, "module");
});

test("debugModuleAttachmentProbe classifies scope and governance denials", () => {
  const result = probeDebugModuleAttachment({
    runtimeId: "runtime:alpha",
    caller: { kind: "official-module", id: "tap", moduleId: "tap" },
    attachments: [
      {
        moduleId: "tap",
        moduleKind: "tap",
        phase: "attached",
        governanceAccepted: false,
        requiredScopes: ["tool.invoke"],
        grantedScopes: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.observations[0]?.status, "denied");
  assert.deepEqual(result.report.observations[0]?.missingScopes, ["tool.invoke"]);
  assert.match(result.report.observations[0]?.reasons.join("\n") ?? "", /governance gate rejected/);
});
