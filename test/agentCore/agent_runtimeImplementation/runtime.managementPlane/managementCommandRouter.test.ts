import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeAccessSession } from "../../../../src/runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import {
  managementCommandRouterDescriptor,
  routeManagementCommand,
} from "../../../../src/runtimeImplementation/runtime.managementPlane/managementCommandRouter.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.managementPlane/managementCommandRouter.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/managementCommandRouter.md",
  testFileUrl: import.meta.url,
});

test("routeManagementCommand returns a dry-run route plan after policy checks", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "operator.main" },
    grantedScopes: ["runtime.read", "runtime.manage", "runtime.inspect"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const result = routeManagementCommand({
    session: session.session,
    command: {
      runtimeId: "runtime-1",
      commandId: "cmd-1",
      commandName: "inspect-runtime",
      targetSurface: "runtime.inspection",
      requestedEffects: ["inspect-runtime"],
    },
    routes: [
      {
        routeId: "inspection-route",
        commandNames: ["inspect-runtime"],
        targetSurfaces: ["runtime.inspection"],
        handlerRef: "runtime.inspection.inspect",
      },
    ],
  });

  assert.equal(managementCommandRouterDescriptor.mode, "dry-run");
  assert.equal(result.ok, true);
  assert.equal(result.plan.routeId, "inspection-route");
  assert.equal(result.plan.dispatchMode, "dry-run");
  assert.equal(result.plan.policyStatus, "allow");
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("routeManagementCommand blocks denied policy decisions and missing routes", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "application", id: "app.main" },
    grantedScopes: ["runtime.read"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const denied = routeManagementCommand({
    session: session.session,
    command: {
      commandId: "cmd-2",
      commandName: "manage-runtime",
      requestedEffects: ["manage-runtime"],
    },
    routes: [{ routeId: "management-route", commandNames: ["manage-runtime"] }],
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "POLICY_DENIED");
  assert.equal(denied.error.boundary, "governance");

  const noRoute = routeManagementCommand({
    session: session.session,
    command: {
      commandId: "cmd-3",
      commandName: "read-runtime",
      targetSurface: "runtime.managementPlane",
      requestedEffects: ["read-runtime"],
    },
    routes: [],
  });

  assert.equal(noRoute.ok, false);
  assert.equal(noRoute.error.code, "ROUTE_NOT_FOUND");
  assert.equal(noRoute.policy?.status, "allow");
});
