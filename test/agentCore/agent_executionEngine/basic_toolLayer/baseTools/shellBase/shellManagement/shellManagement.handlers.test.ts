import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeShellLifecycleManagement,
  shellLifecycleManagementHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellLifecycleManagement.js";
import {
  executeShellProcessManagement,
  shellProcessManagementHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellProcessManagement.js";
import {
  executeShellResourceManagement,
  shellResourceManagementHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellResourceManagement.js";
import {
  executeShellSessionManagement,
  shellSessionManagementHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellSessionManagement.js";

const shellManagementExecuteCases = [
  {
    toolId: "shell.shellLifecycleManagement",
    request: { target: { action: "create" } },
    providerOutput: { resultEnvelope: { planned: false, sessionHandle: "shell-1" } },
    execute: (request: unknown) => executeShellLifecycleManagement(request as Parameters<typeof executeShellLifecycleManagement>[0]),
  },
  {
    toolId: "shell.shellProcessManagement",
    request: { target: { action: "inspect", processId: 123 } },
    providerOutput: { resultEnvelope: { observedStatus: "running" } },
    execute: (request: unknown) => executeShellProcessManagement(request as Parameters<typeof executeShellProcessManagement>[0]),
  },
  {
    toolId: "shell.shellResourceManagement",
    request: { target: { action: "inspect", resourceKind: "pty" } },
    providerOutput: { resourceEnvelope: { operation: "inspect", resourceKind: "pty", allocationDelta: 0 } },
    execute: (request: unknown) => executeShellResourceManagement(request as Parameters<typeof executeShellResourceManagement>[0]),
  },
  {
    toolId: "shell.shellSessionManagement",
    request: { target: { action: "inspect", sessionId: "shell-1" } },
    providerOutput: { sessionEnvelope: { operation: "inspect", runtimeSessionState: "active" } },
    execute: (request: unknown) => executeShellSessionManagement(request as Parameters<typeof executeShellSessionManagement>[0]),
  },
] as const;

test("shellManagement handlers are mounted in the builtin baseTool registry", () => {
  const registry = createBaseToolRegistry();

  for (const handler of [
    shellLifecycleManagementHandler,
    shellProcessManagementHandler,
    shellResourceManagementHandler,
    shellSessionManagementHandler,
  ]) {
    const lookup = registry.lookupHandler(handler.definition.toolId);
    assert.equal(lookup.ok, true);
    if (!lookup.ok) throw new Error("registry lookup should succeed");
    assert.equal(lookup.handler.definition.toolId, handler.definition.toolId);
  }
});

test("shellManagement registry handlers are invokable through lookupHandler(...).handler.invoke", async () => {
  const registry = createBaseToolRegistry();

  for (const testCase of shellManagementExecuteCases) {
    const lookup = registry.lookupHandler(testCase.toolId);
    assert.equal(lookup.ok, true);
    if (!lookup.ok) throw new Error(`registry lookup should succeed for ${testCase.toolId}`);

    const result = await lookup.handler.invoke({
      toolCallId: `${testCase.toolId}:handler-test`,
      runtimeId: "runtime-handler-test",
      sessionId: "agent-session-handler-test",
      input: testCase.request,
      executor: {},
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(`${testCase.toolId} handler invoke should succeed`);
    assert.equal((result.output as { dryRun: boolean }).dryRun, true);
  }
});

test("shellManagement dry-run execution never calls injected providers", async () => {
  for (const testCase of shellManagementExecuteCases) {
    let providerCalled = false;
    const result = await testCase.execute({
      ...testCase.request,
      provider: async () => {
        providerCalled = true;
        return testCase.providerOutput;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(providerCalled, false, `${testCase.toolId} should not call provider during dry-run`);
  }
});

test("shellManagement bestPractice rejects malformed top-level JSON requests", async () => {
  for (const malformedRequest of [null, 1, "invalid", []] as const) {
    for (const testCase of shellManagementExecuteCases) {
      const result = await testCase.execute(malformedRequest);

      assert.equal(result.ok, false);
      if (result.ok) throw new Error(`${testCase.toolId} malformed top-level request should reject`);
      assert.equal(result.error.code, "INVALID_REQUEST");
      assert.equal(result.error.boundary, "input");
      assert.equal(result.error.safeForRuntimeInspection, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});

test("shellManagement real execution requires an affirmative runtime guard", async () => {
  const result = await executeShellSessionManagement({
    target: { action: "inspect", sessionId: "shell-1" },
    context: { runtimeId: "runtime-1", dryRun: false },
    provider: async () => ({ sessionEnvelope: { runtimeSessionState: "active" } }),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("real execution without guard should fail");
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
});

test("shellManagement malformed or denied real-execution guards reject before provider dispatch", async () => {
  for (const guard of ["allowed", { allowed: false, reason: 1 }] as const) {
    for (const testCase of shellManagementExecuteCases) {
      let providerCalled = false;
      const result = await testCase.execute({
        ...testCase.request,
        context: { runtimeId: "runtime-1", dryRun: false, guard },
        provider: async () => {
          providerCalled = true;
          return testCase.providerOutput;
        },
      });

      assert.equal(result.ok, false);
      if (result.ok) throw new Error(`${testCase.toolId} should reject malformed or denied guard`);
      assert.equal(result.error.code, "GOVERNANCE_REJECTED");
      assert.equal(providerCalled, false, `${testCase.toolId} should reject before provider dispatch`);
    }
  }
});

test("shellManagement invalid actions reject before real provider dispatch", async () => {
  let resourceProviderCalled = false;
  const resource = await executeShellResourceManagement({
    target: { action: "delete" as "inspect", resourceKind: "pty", resourceId: "pty:1" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => {
      resourceProviderCalled = true;
      return { resourceEnvelope: { operation: "delete", resourceKind: "pty", allocationDelta: 0 } };
    },
  });
  assert.equal(resource.ok, false);
  if (resource.ok) throw new Error("invalid resource action should reject");
  assert.equal(resource.error.code, "INVALID_ACTION");
  assert.equal(resourceProviderCalled, false);

  let sessionProviderCalled = false;
  const session = await executeShellSessionManagement({
    target: { action: "shutdown" as "inspect", sessionId: "shell-1" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => {
      sessionProviderCalled = true;
      return { sessionEnvelope: { operation: "shutdown", runtimeSessionState: "closed" } };
    },
  });
  assert.equal(session.ok, false);
  if (session.ok) throw new Error("invalid session action should reject");
  assert.equal(session.error.code, "INVALID_ACTION");
  assert.equal(sessionProviderCalled, false);
});

test("shellManagement real providers receive normalized targets", async () => {
  const resource = await executeShellResourceManagement({
    target: { resourceKind: "pty", resourceId: "pty:default" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async (request) => {
      assert.equal(request.target?.action, "inspect");
      assert.equal(request.target?.resourceKind, "pty");
      assert.equal(request.target?.amount, 1);
      return { resourceEnvelope: { operation: "inspect", resourceKind: "pty", resourceId: "pty:default", allocationDelta: 0 } };
    },
  });
  assert.equal(resource.ok, true);

  const session = await executeShellSessionManagement({
    target: { sessionId: "shell-1" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async (request) => {
      assert.equal(request.target?.action, "inspect");
      assert.equal(request.target?.sessionId, "shell-1");
      return { sessionEnvelope: { operation: "inspect", runtimeSessionState: "active" } };
    },
  });
  assert.equal(session.ok, true);
});

test("shellManagement real execution reports missing providers without hidden local fallback", async () => {
  for (const testCase of shellManagementExecuteCases) {
    const result = await testCase.execute({
      ...testCase.request,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error(`${testCase.toolId} should require provider for real execution`);
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("shellManagement provider failures map to public-safe PROVIDER_REJECTED", async () => {
  const secret = "SECRET_RUNTIME_DETAIL_DO_NOT_EXPOSE";

  for (const testCase of shellManagementExecuteCases) {
    const result = await testCase.execute({
      ...testCase.request,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
      provider: async () => {
        throw new Error(secret);
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error(`${testCase.toolId} provider failure should reject`);
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.equal(result.error.message.includes(secret), false);
  }
});

test("shellManagement real execution can call injected runtime providers", async () => {
  const lifecycle = await executeShellLifecycleManagement({
    target: { action: "create" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: { planned: false, sessionHandle: "shell-1" } }),
  });
  assert.equal(lifecycle.ok, true);
  if (!lifecycle.ok) throw new Error("lifecycle provider should succeed");
  assert.equal(lifecycle.output.dryRun, false);

  const process = await executeShellProcessManagement({
    target: { action: "inspect", processId: 123 },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { accepted: true } },
    provider: async () => ({ resultEnvelope: { observedStatus: "running" } }),
  });
  assert.equal(process.ok, true);

  const processSignal = await executeShellProcessManagement({
    target: { action: "signal", processId: 123, signal: "SIGTERM" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async (request) => {
      assert.equal(request.target?.action, "signal");
      assert.equal(request.target?.signal, "SIGTERM");
      return { resultEnvelope: { observedStatus: "signaled" } };
    },
  });
  assert.equal(processSignal.ok, true);

  const resource = await executeShellResourceManagement({
    target: { action: "reserve", resourceKind: "pty", resourceId: "pty-1", amount: 1 },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resourceEnvelope: { operation: "reserve", resourceKind: "pty", resourceId: "pty-1", allocationDelta: 1 } }),
  });
  assert.equal(resource.ok, true);

  const session = await executeShellSessionManagement({
    target: { action: "attach", sessionId: "shell-1" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ sessionEnvelope: { operation: "attach", runtimeSessionState: "attached" } }),
  });
  assert.equal(session.ok, true);

  const lifecycleClose = await executeShellLifecycleManagement({
    target: { action: "close", sessionId: "shell-1" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:lifecycle:manage"] },
    provider: async (request) => {
      assert.equal(request.target?.action, "close");
      assert.equal(request.target?.sessionId, "shell-1");
      return { resultEnvelope: { planned: false, state: "closed" } };
    },
  });
  assert.equal(lifecycleClose.ok, true);
});
