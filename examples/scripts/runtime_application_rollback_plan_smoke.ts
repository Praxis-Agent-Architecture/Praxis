import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationRollbackPlanOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationRollbackPlanSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  rollbackPlan: {
    applicationCommandKind: string | undefined;
    publicSafe: boolean | undefined;
    checkpointTurnId: string | undefined;
    currentRevision: number | undefined;
    allowedCheckpointIds: readonly string[];
    resultOk: boolean | undefined;
    fromRevision: number | undefined;
    toRevision: number | undefined;
    checkpointId: string | undefined;
    controller: string | undefined;
    dispatch: string | undefined;
    unsafeSideEffects: boolean | undefined;
    reversible: boolean | undefined;
    requiresGovernance: boolean | undefined;
    contractChecked: boolean | undefined;
    governanceChecked: boolean | undefined;
    events: readonly string[];
  };
  rejectedPlan: {
    applicationCommandKind: string | undefined;
    publicSafe: boolean | undefined;
    resultOk: boolean | undefined;
    errorCode: string | undefined;
    errorBoundary: string | undefined;
    stateSafe: boolean | undefined;
    internalDetailExposed: boolean | undefined;
    events: readonly string[];
  };
};

export type RuntimeApplicationRollbackPlanSmokeInput = {
  now?: () => string;
};

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-rollback-plan-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-rollback-plan-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application rollback plan smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-rollback-plan-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-rollback-plan-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationRollbackPlanSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationRollbackPlanSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationRollbackPlanSmoke",
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

export default ApplicationRollbackPlanSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-rollback-plan-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationRollbackPlanSmokeAgent",
    application: { id: "application.rollback-plan-smoke" },
    agent: { id: "agent.example.applicationRollbackPlanSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function rollbackPlanOutput(value: unknown): PraxisApplicationRollbackPlanOutput {
  if ((value as { kind?: string } | undefined)?.kind !== "praxis.application.rollbackPlan") {
    throw new Error("application inspectRollbackPlan did not return rollback plan output.");
  }
  return value as PraxisApplicationRollbackPlanOutput;
}

export async function runApplicationRollbackPlanSmoke(
  input: RuntimeApplicationRollbackPlanSmokeInput = {},
): Promise<RuntimeApplicationRollbackPlanSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-rollback-plan-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async () => {
          providerCalls += 1;
          return { output_text: `application rollback plan turn ${providerCalls}` };
        },
      }),
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const transport = createLocalApplicationTransport(created.runtime);
    await transport.dispatch({
      type: "application.start",
      cwd: projectRoot,
      mode: "live",
    });
    await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "application rollback plan smoke first turn",
        cwd: projectRoot,
      },
    });
    const second = await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "application rollback plan smoke second turn",
        cwd: projectRoot,
      },
    });
    const planned = await transport.dispatch({
      type: "application.inspectRollbackPlan",
      checkpointTurnId: "turn.1",
      reason: "smoke rollback dry-run",
      trace: {
        correlationId: "application-rollback-plan-smoke",
        operatorId: "smoke-operator",
      },
    });
    const rejected = await transport.dispatch({
      type: "application.inspectRollbackPlan",
      checkpointTurnId: "turn.404",
      reason: "smoke missing checkpoint dry-run",
    });
    const view = second.view;
    const planOutput = rollbackPlanOutput(planned.output);
    const rejectedOutput = rollbackPlanOutput(rejected.output);
    const rollbackPlan = {
      applicationCommandKind: planOutput.kind,
      publicSafe: planOutput.publicSafe,
      checkpointTurnId: planOutput.checkpointTurnId,
      currentRevision: planOutput.currentRevision,
      allowedCheckpointIds: planOutput.allowedCheckpointIds,
      resultOk: planOutput.result.ok,
      fromRevision: planOutput.result.ok ? planOutput.result.plan.fromRevision : undefined,
      toRevision: planOutput.result.ok ? planOutput.result.plan.toRevision : undefined,
      checkpointId: planOutput.result.ok ? planOutput.result.plan.checkpoint.checkpointId : undefined,
      controller: planOutput.result.ok ? planOutput.result.plan.controller : undefined,
      dispatch: planOutput.result.ok ? planOutput.result.plan.dispatch : undefined,
      unsafeSideEffects: planOutput.result.ok ? planOutput.result.plan.unsafeSideEffects : undefined,
      reversible: planOutput.result.ok ? planOutput.result.plan.reversible : undefined,
      requiresGovernance: planOutput.result.ok ? planOutput.result.plan.audit.requiresGovernance : undefined,
      contractChecked: planOutput.result.ok ? planOutput.result.plan.audit.contractChecked : undefined,
      governanceChecked: planOutput.result.ok ? planOutput.result.plan.audit.governanceChecked : undefined,
      events: planOutput.result.events,
    };
    const rejectedPlan = {
      applicationCommandKind: rejectedOutput.kind,
      publicSafe: rejectedOutput.publicSafe,
      resultOk: rejectedOutput.result.ok,
      errorCode: rejectedOutput.result.ok ? undefined : rejectedOutput.result.error.code,
      errorBoundary: rejectedOutput.result.ok ? undefined : rejectedOutput.result.error.boundary,
      stateSafe: rejectedOutput.result.ok ? undefined : rejectedOutput.result.error.stateSafe,
      internalDetailExposed: rejectedOutput.result.ok ? undefined : rejectedOutput.result.error.internalDetailExposed,
      events: rejectedOutput.result.events,
    };
    return {
      status: second.ok &&
        planned.ok &&
        rejected.ok &&
        view.status === "completed" &&
        view.counters.turns === 2 &&
        providerCalls === 2 &&
        rollbackPlan.applicationCommandKind === "praxis.application.rollbackPlan" &&
        rollbackPlan.publicSafe === true &&
        rollbackPlan.checkpointTurnId === "turn.1" &&
        rollbackPlan.currentRevision === 2 &&
        rollbackPlan.allowedCheckpointIds.includes("turn.1") &&
        rollbackPlan.allowedCheckpointIds.includes("turn.2") &&
        rollbackPlan.resultOk === true &&
        rollbackPlan.fromRevision === 2 &&
        rollbackPlan.toRevision === 1 &&
        rollbackPlan.checkpointId === "turn.1" &&
        rollbackPlan.controller === "runtime.managementPlane.rollbackController" &&
        rollbackPlan.dispatch === "dry-run" &&
        rollbackPlan.unsafeSideEffects === false &&
        rollbackPlan.reversible === true &&
        rollbackPlan.requiresGovernance === true &&
        rollbackPlan.contractChecked === true &&
        rollbackPlan.governanceChecked === true &&
        rollbackPlan.events.includes("runtime.managementPlane.rollback.planned") &&
        rejectedPlan.applicationCommandKind === "praxis.application.rollbackPlan" &&
        rejectedPlan.publicSafe === true &&
        rejectedPlan.resultOk === false &&
        rejectedPlan.errorCode === "MISSING_TARGET_CHECKPOINT" &&
        rejectedPlan.errorBoundary === "input" &&
        rejectedPlan.stateSafe === true &&
        rejectedPlan.internalDetailExposed === false &&
        rejectedPlan.events.includes("runtime.managementPlane.rollback.rejected")
        ? "ok"
        : "failed",
      startedAt,
      finishedAt: now(),
      projectRoot,
      providerCalls,
      view: {
        status: view.status,
        finalOutput: view.finalOutput,
        counters: view.counters,
      },
      rollbackPlan,
      rejectedPlan,
    };
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationRollbackPlanSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
