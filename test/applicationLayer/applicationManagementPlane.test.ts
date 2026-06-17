import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationManagementPlaneOutput,
} from "../../src/applicationLayer/index.js";

function agentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationManagementPlaneTestAgent extends praxis.Agent {
  identity = "agent.example.applicationManagementPlane";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationManagementPlane",
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    policy: praxis.policy({
      allowProviderCall: false,
      scopes: ["agent.invoke"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 1,
      maxToolCalls: 0,
    }),
  });
}

export default ApplicationManagementPlaneTestAgent;
`;
}

async function createProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-management-plane-test",
    entry: "praxis.agent.ts",
    export: "ApplicationManagementPlaneTestAgent",
    application: { id: "application.management-plane-test" },
    agent: { id: "agent.example.applicationManagementPlane" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), agentSource());
}

function managementPlaneOutput(value: unknown): PraxisApplicationManagementPlaneOutput {
  assert.equal((value as { kind?: string } | undefined)?.kind, "praxis.application.managementPlane");
  return value as PraxisApplicationManagementPlaneOutput;
}

test("application.inspectManagementPlane exposes the runtime management plane as a public dry-run application view", async () => {
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-management-plane-test-"));
  try {
    await createProject(projectRoot);
    const created = await createApplicationProjectRuntime(projectRoot, {
      now: () => "2026-06-09T00:00:00.000Z",
      mode: "dry-run",
      permissionProfile: "standard",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    await transport.dispatch({
      type: "application.start",
      cwd: projectRoot,
      mode: "dry-run",
    });

    const inspected = await transport.dispatch({
      type: "application.inspectManagementPlane",
      requestedScopes: ["runtime.read", "runtime.inspect"],
    });

    assert.equal(inspected.ok, true);
    const output = managementPlaneOutput(inspected.output);
    assert.equal(output.publicSafe, true);
    assert.equal(output.sessionId, inspected.view.sessionId);
    assert.equal(output.runtimeId, inspected.view.runtimeId);
    assert.equal(output.result.ok, true);
    if (!output.result.ok) return;
    assert.equal(output.result.managementPlane.route, "runtime.managementPlane");
    assert.equal(output.result.managementPlane.dryRun, true);
    assert.equal(output.result.managementPlane.unsafeSideEffects, false);
    assert.deepEqual(output.result.managementPlane.grantedScopes, ["runtime.read", "runtime.inspect"]);
    assert.deepEqual(output.componentSummary.surfaces, [
      "accessSession",
      "operatorConsole",
      "commandRouter",
      "policyGate",
      "resourceGovernor",
      "mutationPlanner",
      "rollbackController",
      "governanceBridge",
    ]);
    assert.deepEqual(output.componentSummary.readyComponentIds, [
      "runtime-access-session",
      "runtime-operator-console",
      "runtime-command-router",
      "runtime-policy-gate",
      "runtime-resource-governor",
      "runtime-mutation-planner",
      "runtime-rollback-controller",
      "runtime-governance-bridge",
    ]);
    assert.equal(output.componentSummary.readyComponents, 8);
    assert.equal(output.componentSummary.totalComponents, 8);
    assert.equal(output.accessSession.ok, true);
    assert.equal(output.operatorConsole.ok, true);
    assert.equal(output.commandRouter.ok, true);
    assert.equal(output.policyGate.ok, true);
    assert.equal(output.resourceGovernor.ok, true);
    assert.equal(output.mutationPlanner.ok, true);
    assert.equal(output.rollbackPlan.ok, true);
    assert.equal(output.governanceBridge.ok, true);
    assert.equal(output.governanceBridge.ok ? output.governanceBridge.envelope.bridgeStatus : undefined, "ready");
    assert.equal(created.runtime.getView().status, inspected.view.status);
    assert.equal(created.runtime.getView().counters.turns, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
