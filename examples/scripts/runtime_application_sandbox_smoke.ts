import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createApplicationProjectRuntime,
  type PraxisApplicationSandboxMountMatrixOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationSandboxSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    counters: PraxisApplicationViewModel["counters"];
  };
  sandboxMountMatrix: {
    kind: PraxisApplicationSandboxMountMatrixOutput["kind"];
    runtimeSurface: PraxisApplicationSandboxMountMatrixOutput["matrix"]["surface"];
    status: PraxisApplicationSandboxMountMatrixOutput["matrix"]["status"];
    providerFamily: string | undefined;
    evidenceStatus: string;
    providerPrepared: boolean;
    providerReady: boolean;
    isolationEvidence: string;
    effectiveMode: string;
    planStatus: string;
    commandPreviewExecutesCommand: false;
    commandPreviewProviderFamily: string;
    raxcellExpected: boolean;
    raxcellProviderMounted: boolean;
    raxcellPolicyOwner: "praxis";
    raxcellProviderRole: "environment-and-execution";
    policyMiddlewareMounted: true;
    falseReadyGuards: PraxisApplicationSandboxMountMatrixOutput["matrix"]["falseReadyGuards"];
    publicSafe: true;
  };
};

export type RuntimeApplicationSandboxSmokeInput = {
  now?: () => string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function sandboxMountMatrixOutput(value: unknown): PraxisApplicationSandboxMountMatrixOutput {
  const output = record(value);
  if (output.kind !== "praxis.application.sandboxMountMatrix") {
    throw new Error("application.inspectSandboxMountMatrix did not return praxis.application.sandboxMountMatrix");
  }
  return value as PraxisApplicationSandboxMountMatrixOutput;
}

async function createProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-sandbox-smoke",
    entry: "praxis.agent.ts",
    export: "SandboxSmokeAgent",
    application: { id: "application.sandboxSmoke" },
    agent: { id: "agent.application.sandboxSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), `import { praxis } from "@praxis-ai/praxis";

export class SandboxSmokeAgent extends praxis.Agent {
  identity = "agent.application.sandboxSmoke";
  model = praxis.model("gpt-test");
  storage = praxis.storage.memory();
  session = praxis.session({ persistence: "memory" });
  sandbox = praxis.sandbox.linuxBubblewrapReadonly();
  toolPolicy = praxis.toolPolicies.standard();
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.basetool.core.shellRun({ profileName: "runtimeCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "shell:run"],
    }),
    loop: praxis.loop.standard(),
  });
}

export default SandboxSmokeAgent;
`);
}

export async function runApplicationSandboxSmoke(
  input: RuntimeApplicationSandboxSmokeInput = {},
): Promise<RuntimeApplicationSandboxSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-sandbox-smoke-"));
  try {
    await createProject(projectRoot);
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      runtimeId: "runtime.application.sandboxSmoke",
      sessionId: "session.application.sandboxSmoke",
    });
    if (!created.ok) {
      return {
        status: "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          status: "failed",
          counters: {
            turns: 0,
            events: 0,
            modelCalls: 0,
            toolCalls: 0,
            mainLoopSteps: 0,
          },
        },
        sandboxMountMatrix: {
          kind: "praxis.application.sandboxMountMatrix",
          runtimeSurface: "runtime.sandboxPlane.mountMatrix",
          status: "degraded",
          providerFamily: undefined,
          evidenceStatus: "missing",
          providerPrepared: false,
          providerReady: false,
          isolationEvidence: "unknown",
          effectiveMode: "none",
          planStatus: "degraded",
          commandPreviewExecutesCommand: false,
          commandPreviewProviderFamily: "unknown",
          raxcellExpected: false,
          raxcellProviderMounted: false,
          raxcellPolicyOwner: "praxis",
          raxcellProviderRole: "environment-and-execution",
          policyMiddlewareMounted: true,
          falseReadyGuards: {
            hostObservedNeverClaimsIsolation: true,
            strongSandboxRequiresReadyProvider: true,
            commandPreviewDoesNotExecute: true,
            workspaceRollbackIsDegradedIsolation: true,
          },
          publicSafe: true,
        },
      };
    }

    const inspected = await created.runtime.dispatch({
      type: "application.inspectSandboxMountMatrix",
      command: {
        program: "sh",
        args: ["-lc", "printf sandbox-smoke"],
        cwd: projectRoot,
      },
    });
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    const output = sandboxMountMatrixOutput(inspected.output);
    const matrix = output.matrix;
    const result: RuntimeApplicationSandboxSmokeResult = {
      status: "ok",
      startedAt,
      finishedAt: now(),
      projectRoot,
      view: {
        status: inspected.view.status,
        counters: inspected.view.counters,
      },
      sandboxMountMatrix: {
        kind: output.kind,
        runtimeSurface: matrix.surface,
        status: matrix.status,
        providerFamily: matrix.sandbox.providerFamily,
        evidenceStatus: matrix.provider.evidenceStatus,
        providerPrepared: matrix.provider.prepared,
        providerReady: matrix.provider.ready,
        isolationEvidence: matrix.sandbox.isolationEvidence,
        effectiveMode: matrix.baseToolSandboxPlan.effectiveMode,
        planStatus: matrix.baseToolSandboxPlan.status,
        commandPreviewExecutesCommand: matrix.commandPlanPreview.executesCommand,
        commandPreviewProviderFamily: matrix.commandPlanPreview.providerFamily,
        raxcellExpected: matrix.raxcell.expectedForProvider,
        raxcellProviderMounted: matrix.raxcell.providerMounted,
        raxcellPolicyOwner: matrix.raxcell.policyOwner,
        raxcellProviderRole: matrix.raxcell.providerRole,
        policyMiddlewareMounted: matrix.policyMiddleware.mounted,
        falseReadyGuards: matrix.falseReadyGuards,
        publicSafe: output.publicSafe,
      },
    };
    return result;
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationSandboxSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
