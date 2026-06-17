import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { praxis } from "../../src/agentCore/index.js";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationRollbackPlanOutput,
} from "../../src/applicationLayer/index.js";

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-rollback-plan-test",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-rollback-plan-test" },
  });
  if (!ref.ok) throw new Error("failed to create test credential ref");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-rollback-plan-test-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-rollback-plan-test-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function agentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationRollbackPlanTestAgent extends praxis.Agent {
  identity = "agent.example.applicationRollbackPlan";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationRollbackPlan",
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
      allowProviderCall: true,
      scopes: ["agent.invoke"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 1,
      maxToolCalls: 0,
    }),
  });
}

export default ApplicationRollbackPlanTestAgent;
`;
}

async function createProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-rollback-plan-test",
    entry: "praxis.agent.ts",
    export: "ApplicationRollbackPlanTestAgent",
    application: { id: "application.rollback-plan-test" },
    agent: { id: "agent.example.applicationRollbackPlan" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), agentSource());
}

function rollbackPlanOutput(value: unknown): PraxisApplicationRollbackPlanOutput {
  assert.equal((value as { kind?: string } | undefined)?.kind, "praxis.application.rollbackPlan");
  return value as PraxisApplicationRollbackPlanOutput;
}

test("application.inspectRollbackPlan exposes a governed dry-run runtime rollback plan for a conversation checkpoint", async () => {
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-rollback-plan-test-"));
  try {
    await createProject(projectRoot);
    let providerCalls = 0;
    const created = await createApplicationProjectRuntime(projectRoot, {
      now: () => "2026-06-09T00:00:00.000Z",
      mode: "live",
      permissionProfile: "yolo",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async () => {
          providerCalls += 1;
          return { output_text: `rollback plan answer ${providerCalls}` };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    await transport.dispatch({
      type: "application.start",
      cwd: projectRoot,
      mode: "live",
    });
    const first = await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "first rollback plan turn",
        cwd: projectRoot,
      },
    });
    assert.equal(first.ok, true);
    const second = await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "second rollback plan turn",
        cwd: projectRoot,
      },
    });
    assert.equal(second.ok, true);

    const inspected = await transport.dispatch({
      type: "application.inspectRollbackPlan",
      checkpointTurnId: "turn.1",
      reason: " operator requested checkpoint dry-run ",
      trace: {
        correlationId: " corr-rollback-plan ",
        operatorId: " operator-1 ",
      },
    });

    assert.equal(inspected.ok, true);
    const output = rollbackPlanOutput(inspected.output);
    assert.equal(output.publicSafe, true);
    assert.equal(output.sessionId, inspected.view.sessionId);
    assert.equal(output.runtimeId, inspected.view.runtimeId);
    assert.equal(output.checkpointTurnId, "turn.1");
    assert.equal(output.currentRevision, 2);
    assert.equal(output.allowedCheckpointIds.includes("turn.1"), true);
    assert.equal(output.result.ok, true);
    if (!output.result.ok) return;
    assert.equal(output.result.plan.runtimeId, inspected.view.runtimeId);
    assert.equal(output.result.plan.fromRevision, 2);
    assert.equal(output.result.plan.toRevision, 1);
    assert.equal(output.result.plan.checkpoint.checkpointId, "turn.1");
    assert.equal(output.result.plan.checkpoint.revision, 1);
    assert.equal(output.result.plan.reason, "operator requested checkpoint dry-run");
    assert.equal(output.result.plan.controller, "runtime.managementPlane.rollbackController");
    assert.equal(output.result.plan.dispatch, "dry-run");
    assert.equal(output.result.plan.unsafeSideEffects, false);
    assert.equal(output.result.plan.reversible, true);
    assert.equal(output.result.plan.audit.requiresGovernance, true);
    assert.equal(output.result.plan.audit.contractChecked, true);
    assert.equal(output.result.plan.audit.governanceChecked, true);
    assert.deepEqual(output.result.events, ["runtime.managementPlane.rollback.planned"]);
    assert.deepEqual(output.result.plan.trace, {
      correlationId: "corr-rollback-plan",
      callerId: undefined,
      operatorId: "operator-1",
    });
    assert.equal(created.runtime.getView().sessionId, inspected.view.sessionId);
    assert.equal(created.runtime.getView().counters.turns, 2);
    assert.equal(providerCalls, 2);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
