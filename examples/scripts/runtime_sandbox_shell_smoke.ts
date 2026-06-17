import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import type {
  SandboxExecutionProviderPort,
  SandboxProviderRunRequest,
} from "@praxis-ai/praxis";

export type RuntimeSandboxShellSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  workspaceRollback: {
    ok: boolean;
    exitCode: number | null;
    fileRestored: boolean;
    providerFamily: string | undefined;
    rollbackProtects: readonly string[];
    rollbackRequired: boolean;
  };
  injectedProvider: {
    ok: boolean;
    exitCode: number | null;
    stdout: string;
    providerFamily: string | undefined;
    evidenceStatus: string;
    providerMounted: boolean;
    prepareRunCalls: number;
    runCalls: number;
    observedToolId: string | undefined;
  };
};

export type RuntimeSandboxShellSmokeInput = {
  now?: () => string;
};

function outputRecord(output: unknown): Readonly<Record<string, unknown>> {
  return typeof output === "object" && output !== null && !Array.isArray(output)
    ? output as Readonly<Record<string, unknown>>
    : {};
}

function metadataRecord(metadata: unknown): Readonly<Record<string, unknown>> {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? metadata as Readonly<Record<string, unknown>>
    : {};
}

function createInjectedProvider(input: {
  seen: SandboxProviderRunRequest[];
  counters: { prepareRunCalls: number; runCalls: number };
}): SandboxExecutionProviderPort {
  return {
    providerId: "runtime-sandbox-shell-smoke.injected-raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      input.counters.prepareRunCalls += 1;
      input.seen.push(request);
      return {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        denial: null,
        environmentGap: null,
        filesystemLowering: {
          declaredRoots: request.filesystem.read.map((root) => ({
            path: root,
            access: "read",
            source: "declared",
          })),
          runtimeRoots: [],
          policyGrants: request.policyGrants,
          warnings: [],
        },
        backendArtifacts: [],
        metadata: {
          smoke: "runtime-sandbox-shell",
        },
      };
    },
    async run(request) {
      input.counters.runCalls += 1;
      return {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: `provider-ok:${request.command.argv.join(" ")}`,
        stderr: "",
        timedOut: false,
        denial: null,
        filesystemLowering: null,
        metadata: {
          smoke: "runtime-sandbox-shell",
        },
      };
    },
  };
}

async function runWorkspaceRollbackSmoke(): Promise<RuntimeSandboxShellSmokeResult["workspaceRollback"]> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-sandbox-shell-rollback-"));
  const target = path.join(workspace, "state.txt");
  try {
    await writeFile(target, "before\n", "utf8");
    const executor = praxis.runtime.createBaseToolExecutorPort({
      runtimeId: "runtime.sandboxShellSmoke.rollback",
      sessionId: "session.sandboxShellSmoke.rollback",
      policy: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        allowShellExecution: true,
      },
      sandboxSpec: praxis.sandbox.hostObserved(),
      policyProfile: "yolo",
    });
    const result = await executor.shell?.run?.({
      command: "printf after > state.txt; exit 2",
      cwd: workspace,
    });
    const output = outputRecord(result?.output);
    const metadata = metadataRecord(result?.metadata);
    const sandboxPlan = metadataRecord(metadata.sandbox);
    const workspaceRollback = metadataRecord(sandboxPlan.workspaceRollback);
    const rollbackPlan = metadataRecord(workspaceRollback.plan);
    const rollbackProtects = Array.isArray(rollbackPlan.protects)
      ? rollbackPlan.protects.map(String)
      : [];
    return {
      ok: result?.ok === true,
      exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
      fileRestored: await readFile(target, "utf8") === "before\n",
      providerFamily: typeof sandboxPlan.providerFamily === "string" ? sandboxPlan.providerFamily : undefined,
      rollbackProtects,
      rollbackRequired: sandboxPlan.workspaceRollback !== undefined,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function runInjectedProviderSmoke(): Promise<RuntimeSandboxShellSmokeResult["injectedProvider"]> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-sandbox-shell-provider-"));
  const spec = praxis.sandbox.linuxBubblewrapReadonly();
  const seen: SandboxProviderRunRequest[] = [];
  const counters = { prepareRunCalls: 0, runCalls: 0 };
  try {
    const prepared = await praxis.sandboxPlane.prepareSandboxRuntime(spec, {
      cwd: workspace,
      providerReady: true,
      runSmoke: false,
    });
    const matrix = await praxis.runtime.inspectSandboxMountMatrix({
      sandbox: spec,
      policyProfile: "standard",
      preparedSandbox: prepared,
      sandboxProviderInjected: true,
      toolId: "shell.run",
      command: {
        program: "sh",
        args: ["-lc", "printf provider-ok"],
        cwd: workspace,
      },
    });
    const executor = praxis.runtime.createBaseToolExecutorPort({
      runtimeId: "runtime.sandboxShellSmoke.injectedProvider",
      sessionId: "session.sandboxShellSmoke.injectedProvider",
      policy: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        allowShellExecution: true,
      },
      sandboxSpec: spec,
      preparedSandbox: prepared,
      policyProfile: "standard",
      sandboxProvider: createInjectedProvider({ seen, counters }),
    });
    const result = await executor.shell?.run?.({
      command: "printf provider-ok",
      cwd: workspace,
    });
    const output = outputRecord(result?.output);
    const metadata = metadataRecord(result?.metadata);
    const sandboxPlan = metadataRecord(metadata.sandbox);
    return {
      ok: result?.ok === true,
      exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
      stdout: typeof output.stdout === "string" ? output.stdout : "",
      providerFamily: typeof sandboxPlan.providerFamily === "string" ? sandboxPlan.providerFamily : undefined,
      evidenceStatus: matrix.provider.evidenceStatus,
      providerMounted: matrix.raxcell.providerMounted,
      prepareRunCalls: counters.prepareRunCalls,
      runCalls: counters.runCalls,
      observedToolId: seen[0]?.action.toolId,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function runRuntimeSandboxShellSmoke(
  input: RuntimeSandboxShellSmokeInput = {},
): Promise<RuntimeSandboxShellSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const workspaceRollback = await runWorkspaceRollbackSmoke();
  const injectedProvider = await runInjectedProviderSmoke();
  return {
    status: workspaceRollback.ok &&
      workspaceRollback.fileRestored &&
      injectedProvider.ok &&
      injectedProvider.prepareRunCalls === 1 &&
      injectedProvider.runCalls === 1
      ? "ok"
      : "failed",
    startedAt,
    finishedAt: now(),
    workspaceRollback,
    injectedProvider,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runRuntimeSandboxShellSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
