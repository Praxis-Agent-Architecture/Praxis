import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";
import {
  createRuntimeTimelineReport,
} from "@praxis-ai/praxis";

export type RuntimeApplicationSqliteSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  sqlitePath: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  providerCalls: number;
  persistence: {
    sqliteExists: boolean;
    snapshot: {
      sessionStatus: string | undefined;
      storageWorkspaceRef: string | undefined;
      eventCount: number;
      stateCount: number;
      invocationCount: number;
      mainLoopStepCount: number;
      publicSafeErrors: number;
      includesSessionCreated: boolean;
      includesFinalOutput: boolean;
      includesModelInvocation: boolean;
      includesPromptLoweringStep: boolean;
    };
    sqliteTableCounts: {
      sessions: number;
      events: number;
      states: number;
      invocations: number;
      mainLoopSteps: number;
      errors: number;
    };
  };
  timeline: {
    status: "ok" | "failed";
    sourceKind: string;
    hasRuntimeEvents: boolean;
    hasInvocations: boolean;
    hasMainLoopSteps: boolean;
    hasPublicSafeErrors: boolean;
    timelineItems: number;
    expectedTimelineItems: number;
    eventTypes: readonly string[];
    invocationKinds: readonly string[];
    mainLoopActions: readonly string[];
    includesSessionCreated: boolean;
    includesFinalOutput: boolean;
    includesModelInvocation: boolean;
    includesPromptLoweringStep: boolean;
  };
};

export type RuntimeApplicationSqliteSmokeInput = {
  now?: () => string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-sqlite-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-sqlite-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application SQLite smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-sqlite-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-sqlite-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationSqliteSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationSqliteSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationSqliteSmoke",
  });
  storage = praxis.storage.raxWorkspace();
  session = praxis.session({
    persistence: "sqlite",
    resume: "auto",
    thread: "durable",
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

export default ApplicationSqliteSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-sqlite-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationSqliteSmokeAgent",
    application: { id: "application.sqlite-smoke" },
    agent: { id: "agent.example.applicationSqliteSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function sqliteTableCounts(sqlitePath: string): Promise<RuntimeApplicationSqliteSmokeResult["persistence"]["sqliteTableCounts"]> {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(sqlitePath);
  try {
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number };
      return numberValue(row.count);
    };
    return {
      sessions: count("runtime_sessions"),
      events: count("runtime_events"),
      states: count("runtime_states"),
      invocations: count("runtime_invocations"),
      mainLoopSteps: count("runtime_main_loop_steps"),
      errors: count("runtime_public_safe_errors"),
    };
  } finally {
    db.close();
  }
}

export async function runApplicationSqliteSmoke(
  input: RuntimeApplicationSqliteSmokeInput = {},
): Promise<RuntimeApplicationSqliteSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-sqlite-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "codingCore",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async () => {
          providerCalls += 1;
          return { output_text: "application sqlite smoke completed" };
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
    const result = await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "Run the application SQLite persistence smoke.",
        cwd: projectRoot,
      },
    });
    const view = result.view;
    const sqlitePath = path.join(projectRoot, ".raxode", "sessions", "praxis.sqlite");
    const sqliteExists = existsSync(sqlitePath);
    const reopenedStore = await praxis.runtime.createSqliteSessionStateEventStore(sqlitePath);
    try {
      const snapshot = await reopenedStore.readSession("session.application.sqlite-smoke.default");
      const tableCounts = await sqliteTableCounts(sqlitePath);
      const sessionMetadata = record(snapshot.session?.metadata);
      const storageMetadata = record(sessionMetadata.storage);
      const eventTypes = snapshot.events.map((event) => event.type);
      const invocationKinds = snapshot.invocations.map((invocation) => invocation.kind);
      const mainLoopActions = snapshot.mainLoopSteps.map((step) => step.actionPrimitive);
      const timelineReport = createRuntimeTimelineReport({
        sourceKind: "sqlite",
        snapshot,
      });
      const expectedTimelineItems =
        (snapshot.session === undefined ? 0 : 1) +
        snapshot.states.length +
        snapshot.events.length +
        snapshot.invocations.length +
        snapshot.mainLoopSteps.length +
        snapshot.procedures.length +
        snapshot.approvals.length +
        snapshot.errors.length;
      const timeline = {
        status: timelineReport.sourceKind === "sqlite" &&
          timelineReport.coverage.hasRuntimeEvents &&
          timelineReport.coverage.hasInvocations &&
          timelineReport.coverage.hasMainLoopSteps &&
          timelineReport.timelineItems.length === expectedTimelineItems &&
          timelineReport.eventTypes.includes("runtime.session.created") &&
          timelineReport.eventTypes.includes("runtime.output.final") &&
          timelineReport.invocationKinds.includes("model") &&
          timelineReport.mainLoopActions.includes("lowerPrompt")
          ? "ok" as const
          : "failed" as const,
        sourceKind: timelineReport.sourceKind,
        hasRuntimeEvents: timelineReport.coverage.hasRuntimeEvents,
        hasInvocations: timelineReport.coverage.hasInvocations,
        hasMainLoopSteps: timelineReport.coverage.hasMainLoopSteps,
        hasPublicSafeErrors: timelineReport.coverage.hasPublicSafeErrors,
        timelineItems: timelineReport.counts.timelineItems,
        expectedTimelineItems,
        eventTypes: timelineReport.eventTypes,
        invocationKinds: timelineReport.invocationKinds,
        mainLoopActions: timelineReport.mainLoopActions,
        includesSessionCreated: timelineReport.eventTypes.includes("runtime.session.created"),
        includesFinalOutput: timelineReport.eventTypes.includes("runtime.output.final"),
        includesModelInvocation: timelineReport.invocationKinds.includes("model"),
        includesPromptLoweringStep: timelineReport.mainLoopActions.includes("lowerPrompt"),
      };
      const persistence = {
        sqliteExists,
        snapshot: {
          sessionStatus: snapshot.session?.status,
          storageWorkspaceRef: stringValue(storageMetadata.workspaceRef),
          eventCount: snapshot.events.length,
          stateCount: snapshot.states.length,
          invocationCount: snapshot.invocations.length,
          mainLoopStepCount: snapshot.mainLoopSteps.length,
          publicSafeErrors: snapshot.errors.length,
          includesSessionCreated: eventTypes.includes("runtime.session.created"),
          includesFinalOutput: eventTypes.includes("runtime.output.final"),
          includesModelInvocation: invocationKinds.includes("model"),
          includesPromptLoweringStep: mainLoopActions.includes("lowerPrompt"),
        },
        sqliteTableCounts: tableCounts,
      };
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application sqlite smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 1 &&
          providerCalls === 1 &&
          persistence.sqliteExists &&
          persistence.snapshot.sessionStatus === "completed" &&
          persistence.snapshot.storageWorkspaceRef === "rax.workspace" &&
          persistence.snapshot.eventCount === persistence.sqliteTableCounts.events &&
          persistence.snapshot.stateCount === persistence.sqliteTableCounts.states &&
          persistence.snapshot.invocationCount === persistence.sqliteTableCounts.invocations &&
          persistence.snapshot.mainLoopStepCount === persistence.sqliteTableCounts.mainLoopSteps &&
          persistence.snapshot.publicSafeErrors === 0 &&
          persistence.snapshot.includesSessionCreated &&
          persistence.snapshot.includesFinalOutput &&
          persistence.snapshot.includesModelInvocation &&
          persistence.snapshot.includesPromptLoweringStep &&
          timeline.status === "ok"
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        sqlitePath,
        view: {
          status: view.status,
          finalOutput: view.finalOutput,
          counters: view.counters,
        },
        providerCalls,
        persistence,
        timeline,
      };
    } finally {
      await reopenedStore.close?.();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationSqliteSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
