import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeAuthority } from "../../../../src/agentCore_runtimeImplementation/runtime.governancePlane/runtimeAuthorityResolver.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.governancePlane/runtimeAuthorityResolver.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeAuthorityResolver.md",
  testFileUrl: import.meta.url,
});

test("resolveRuntimeAuthority combines caller, session, module source, and policy scopes", () => {
  const result = resolveRuntimeAuthority({
    runtimeId: " runtime-1 ",
    caller: {
      kind: "official-module",
      id: " tap ",
      moduleId: " tap.module ",
      sessionId: " session-a ",
    },
    moduleSource: " TAP ",
    grantedScopes: ["runtime.read", "tool.invoke"],
    policyScopes: ["tool.approve", " tool.approve "],
    deniedScopes: ["tool.invoke"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.authority.runtimeId, "runtime-1");
  assert.deepEqual(result.authority.caller, {
    kind: "official-module",
    id: "tap",
    moduleId: "tap.module",
    sessionId: "session-a",
  });
  assert.equal(result.authority.sessionId, "session-a");
  assert.equal(result.authority.moduleSource, "TAP");
  assert.deepEqual(result.authority.scopes, ["runtime.read", "tool.approve"]);
  assert.deepEqual(result.authority.policyScopes, ["tool.approve"]);
  assert.deepEqual(result.authority.deniedScopes, ["tool.invoke"]);
  assert.equal(result.authority.unsafeSideEffects, false);
});

test("resolveRuntimeAuthority returns classified failures for missing input and rejected governance", () => {
  assert.deepEqual(resolveRuntimeAuthority(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "runtime authority resolution requires a runtimeId",
      boundary: "input",
      publicSafe: true,
    },
    events: ["runtime.authority.rejected"],
  });

  const rejected = resolveRuntimeAuthority({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app.main" },
    governance: { accepted: false, reason: "caller outside runtime scope" },
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
