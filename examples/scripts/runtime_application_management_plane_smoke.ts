import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationManagementPlaneOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationManagementPlaneSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    counters: PraxisApplicationViewModel["counters"];
  };
  managementPlane: {
    applicationCommandKind: string | undefined;
    publicSafe: boolean | undefined;
    resultOk: boolean | undefined;
    route: string | undefined;
    dryRun: boolean | undefined;
    unsafeSideEffects: boolean | undefined;
    totalComponents: number;
    readyComponents: number;
    surfaces: readonly string[];
    readyComponentIds: readonly string[];
    grantedScopes: readonly string[];
    events: readonly string[];
  };
  subplanes: {
    accessSessionOk: boolean | undefined;
    operatorConsoleOk: boolean | undefined;
    policyGateOk: boolean | undefined;
    commandRouterOk: boolean | undefined;
    resourceGovernorOk: boolean | undefined;
    mutationPlannerOk: boolean | undefined;
    rollbackPlanOk: boolean | undefined;
    governanceBridgeOk: boolean | undefined;
    governanceBridgeStatus: string | undefined;
  };
};

export type RuntimeApplicationManagementPlaneSmokeInput = {
  now?: () => string;
};

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationManagementPlaneSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationManagementPlaneSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationManagementPlaneSmoke",
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

export default ApplicationManagementPlaneSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-management-plane-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationManagementPlaneSmokeAgent",
    application: { id: "application.management-plane-smoke" },
    agent: { id: "agent.example.applicationManagementPlaneSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function managementPlaneOutput(value: unknown): PraxisApplicationManagementPlaneOutput {
  if ((value as { kind?: string } | undefined)?.kind !== "praxis.application.managementPlane") {
    throw new Error("application inspectManagementPlane did not return management plane output.");
  }
  return value as PraxisApplicationManagementPlaneOutput;
}

export async function runApplicationManagementPlaneSmoke(
  input: RuntimeApplicationManagementPlaneSmokeInput = {},
): Promise<RuntimeApplicationManagementPlaneSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-management-plane-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "dry-run",
      permissionProfile: "standard",
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
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
    const view = inspected.view;
    const output = managementPlaneOutput(inspected.output);
    const managementPlane = {
      applicationCommandKind: output.kind,
      publicSafe: output.publicSafe,
      resultOk: output.result.ok,
      route: output.result.ok ? output.result.managementPlane.route : undefined,
      dryRun: output.result.ok ? output.result.managementPlane.dryRun : undefined,
      unsafeSideEffects: output.result.ok ? output.result.managementPlane.unsafeSideEffects : undefined,
      totalComponents: output.componentSummary.totalComponents,
      readyComponents: output.componentSummary.readyComponents,
      surfaces: output.componentSummary.surfaces,
      readyComponentIds: output.componentSummary.readyComponentIds,
      grantedScopes: output.result.ok ? output.result.managementPlane.grantedScopes : [],
      events: output.result.events,
    };
    const subplanes = {
      accessSessionOk: output.accessSession.ok,
      operatorConsoleOk: output.operatorConsole.ok,
      policyGateOk: output.policyGate.ok,
      commandRouterOk: output.commandRouter.ok,
      resourceGovernorOk: output.resourceGovernor.ok,
      mutationPlannerOk: output.mutationPlanner.ok,
      rollbackPlanOk: output.rollbackPlan.ok,
      governanceBridgeOk: output.governanceBridge.ok,
      governanceBridgeStatus: output.governanceBridge.ok ? output.governanceBridge.envelope.bridgeStatus : undefined,
    };
    return {
      status: inspected.ok &&
        view.status === "ready" &&
        view.counters.turns === 0 &&
        managementPlane.applicationCommandKind === "praxis.application.managementPlane" &&
        managementPlane.publicSafe === true &&
        managementPlane.resultOk === true &&
        managementPlane.route === "runtime.managementPlane" &&
        managementPlane.dryRun === true &&
        managementPlane.unsafeSideEffects === false &&
        managementPlane.totalComponents === 8 &&
        managementPlane.readyComponents === 8 &&
        managementPlane.surfaces.join(",") === [
          "accessSession",
          "operatorConsole",
          "commandRouter",
          "policyGate",
          "resourceGovernor",
          "mutationPlanner",
          "rollbackController",
          "governanceBridge",
        ].join(",") &&
        managementPlane.readyComponentIds.length === 8 &&
        managementPlane.grantedScopes.includes("runtime.read") &&
        managementPlane.grantedScopes.includes("runtime.inspect") &&
        managementPlane.events.includes("runtime.managementPlane.ready") &&
        subplanes.accessSessionOk === true &&
        subplanes.operatorConsoleOk === true &&
        subplanes.policyGateOk === true &&
        subplanes.commandRouterOk === true &&
        subplanes.resourceGovernorOk === true &&
        subplanes.mutationPlannerOk === true &&
        subplanes.rollbackPlanOk === true &&
        subplanes.governanceBridgeOk === true &&
        subplanes.governanceBridgeStatus === "ready"
        ? "ok"
        : "failed",
      startedAt,
      finishedAt: now(),
      projectRoot,
      view: {
        status: view.status,
        counters: view.counters,
      },
      managementPlane,
      subplanes,
    };
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationManagementPlaneSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
