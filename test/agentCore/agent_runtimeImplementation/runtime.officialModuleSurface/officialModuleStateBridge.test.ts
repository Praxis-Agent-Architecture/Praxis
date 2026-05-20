import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialModuleStateBridge } from "../../../../src/runtimeImplementation/runtime.officialModuleSurface/officialModuleStateBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.officialModuleSurface/officialModuleStateBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleStateBridge.md",
  testFileUrl: import.meta.url,
});

test("createOfficialModuleStateBridge returns a controlled readonly runtime state view", () => {
  const sourceState = {
    phase: "ready",
    activeSessionId: "session-1",
    publicConfig: {
      retryLimit: 2,
      featureFlags: ["tap"],
    },
    "internal.token": "hidden",
    _mutableRuntimeHandle: { shouldNotLeak: true },
  };

  const result = createOfficialModuleStateBridge({
    runtimeId: "runtime-1",
    moduleId: "tap",
    moduleKind: "TAP",
    mountedModuleIds: ["tap", "cmp"],
    visibleState: sourceState,
    requestedStateKeys: ["phase", "activeSessionId", "internal.token", "_mutableRuntimeHandle"],
    traceId: "trace-1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.view.runtimeId, "runtime-1");
  assert.equal(result.view.moduleId, "tap");
  assert.equal(result.view.moduleKind, "TAP");
  assert.equal(result.view.readonly, true);
  assert.equal(result.view.unsafeSideEffects, false);
  assert.deepEqual(result.view.exposedKeys, ["phase", "activeSessionId"]);
  assert.deepEqual(result.view.state, {
    phase: "ready",
    activeSessionId: "session-1",
  });
  assert.equal(Object.isFrozen(result.view.state), true);
});

test("createOfficialModuleStateBridge snapshots nested public state before exposing it", () => {
  const sourceState = {
    publicConfig: {
      retryLimit: 2,
      featureFlags: ["tap"],
    },
  };

  const result = createOfficialModuleStateBridge({
    runtimeId: "runtime-1",
    moduleId: "tap",
    moduleKind: "TAP",
    visibleState: sourceState,
    requestedStateKeys: ["publicConfig"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const publicConfig = result.view.state.publicConfig as {
    retryLimit: number;
    featureFlags: string[];
  };

  assert.notEqual(publicConfig, sourceState.publicConfig);
  assert.equal(Object.isFrozen(publicConfig), true);
  assert.equal(Object.isFrozen(publicConfig.featureFlags), true);
  assert.throws(() => {
    publicConfig.retryLimit = 3;
  }, TypeError);
  assert.throws(() => {
    publicConfig.featureFlags.push("cmp");
  }, TypeError);
  assert.deepEqual(sourceState.publicConfig, {
    retryLimit: 2,
    featureFlags: ["tap"],
  });
});

test("createOfficialModuleStateBridge rejects missing, unready, and unmounted state access", () => {
  const missingRuntime = createOfficialModuleStateBridge({
    moduleId: "cmp",
    moduleKind: "CMP",
    visibleState: {},
  });

  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const notReady = createOfficialModuleStateBridge({
    runtimeId: "runtime-1",
    moduleId: "mp",
    moduleKind: "MP",
    runtimeReady: false,
    visibleState: {},
  });

  assert.equal(notReady.ok, false);
  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");

  const unmounted = createOfficialModuleStateBridge({
    runtimeId: "runtime-1",
    moduleId: "multiagent",
    moduleKind: "multiagent",
    mountedModuleIds: ["tap"],
    visibleState: {},
  });

  assert.equal(unmounted.ok, false);
  assert.equal(unmounted.error.code, "MODULE_NOT_MOUNTED");
  assert.equal(unmounted.error.publicSafe, true);
});
