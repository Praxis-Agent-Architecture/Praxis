import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommandResult,
} from "@praxis-ai/praxis/application";

import type {
  RuntimeCoreBaselineMemoryBudgetCheck,
  RuntimeCoreBaselineMemoryBudgetSummary,
  RuntimeCoreBaselineMemorySnapshot,
} from "./runtime_core_baseline.js";

export type RuntimeApplicationCoreBaselineRoundResult = {
  round: number;
  status: "ok" | "failed";
  sessions: {
    requested: number;
    ok: number;
    failed: number;
  };
  providerCalls: number;
  turns: number;
  modelCalls: number;
  toolCalls: number;
  mainLoopSteps: number;
  applicationEvents: number;
  sampleSessionIds: readonly string[];
  failures: readonly {
    sessionId: string;
    message: string;
  }[];
};

export type RuntimeApplicationCoreBaselineSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  rounds: {
    requested: number;
    ok: number;
    failed: number;
  };
  sessions: {
    requestedPerRound: number;
    concurrency: number;
    ok: number;
    failed: number;
  };
  providerCalls: number;
  memory: {
    before: RuntimeCoreBaselineMemorySnapshot;
    after: RuntimeCoreBaselineMemorySnapshot;
    delta: RuntimeCoreBaselineMemorySnapshot;
  };
  totalMemoryBudget: RuntimeCoreBaselineMemoryBudgetSummary;
  aggregate: {
    turns: number;
    modelCalls: number;
    toolCalls: number;
    mainLoopSteps: number;
    applicationEvents: number;
  };
  roundResults: readonly RuntimeApplicationCoreBaselineRoundResult[];
  sampleSessionIds: readonly string[];
  failures: readonly {
    round: number;
    sessionId: string;
    message: string;
  }[];
};

export type RuntimeApplicationCoreBaselineSmokeInput = {
  rounds?: number;
  sessions?: number;
  concurrency?: number;
  maxTotalRssDeltaBytes?: number;
  maxTotalHeapUsedDeltaBytes?: number;
  maxTotalRssDeltaMb?: number;
  maxTotalHeapUsedDeltaMb?: number;
  now?: () => string;
  memorySampler?: () => RuntimeCoreBaselineMemorySnapshot;
};

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function megabytesToBytes(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.floor(value * 1024 * 1024);
}

function readNumberFlag(args: readonly string[], name: string): number | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) return Number(inline.slice(prefix.length));
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] !== undefined) return Number(args[index + 1]);
  return undefined;
}

function readMemory(): RuntimeCoreBaselineMemorySnapshot {
  const memory = process.memoryUsage();
  return {
    rssBytes: memory.rss,
    heapTotalBytes: memory.heapTotal,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  };
}

function subtractMemory(
  after: RuntimeCoreBaselineMemorySnapshot,
  before: RuntimeCoreBaselineMemorySnapshot,
): RuntimeCoreBaselineMemorySnapshot {
  return {
    rssBytes: after.rssBytes - before.rssBytes,
    heapTotalBytes: after.heapTotalBytes - before.heapTotalBytes,
    heapUsedBytes: after.heapUsedBytes - before.heapUsedBytes,
    externalBytes: after.externalBytes - before.externalBytes,
    arrayBuffersBytes: after.arrayBuffersBytes - before.arrayBuffersBytes,
  };
}

function budgetCheck(
  name: RuntimeCoreBaselineMemoryBudgetCheck["name"],
  actualBytes: number,
  limitBytes: number | undefined,
): RuntimeCoreBaselineMemoryBudgetCheck | undefined {
  if (limitBytes === undefined || !Number.isFinite(limitBytes) || limitBytes < 0) return undefined;
  const limit = Math.floor(limitBytes);
  return {
    name,
    actualBytes,
    limitBytes: limit,
    ok: actualBytes <= limit,
  };
}

function evaluateTotalMemoryBudget(input: {
  delta: RuntimeCoreBaselineMemorySnapshot;
  maxTotalRssDeltaBytes?: number;
  maxTotalHeapUsedDeltaBytes?: number;
}): RuntimeCoreBaselineMemoryBudgetSummary {
  const checks = [
    budgetCheck("rssDeltaBytes", input.delta.rssBytes, input.maxTotalRssDeltaBytes),
    budgetCheck("heapUsedDeltaBytes", input.delta.heapUsedBytes, input.maxTotalHeapUsedDeltaBytes),
  ].filter((check): check is RuntimeCoreBaselineMemoryBudgetCheck => check !== undefined);
  if (checks.length === 0) return { status: "not-configured", checks: [] };
  return {
    status: checks.every((check) => check.ok) ? "within-budget" : "exceeded",
    checks,
  };
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-core-baseline-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-core-baseline-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application core baseline smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-core-baseline-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-core-baseline-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationCoreBaselineSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationCoreBaselineSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationCoreBaselineSmoke",
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

export default ApplicationCoreBaselineSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-core-baseline-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationCoreBaselineSmokeAgent",
    application: { id: "application.core-baseline-smoke" },
    agent: { id: "agent.example.applicationCoreBaselineSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function runWithConcurrency<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<readonly T[]> {
  const results = new Array<T>(count);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(index);
    }
  });
  await Promise.all(workers);
  return results;
}

type SessionRunResult = {
  sessionId: string;
  ok: boolean;
  providerCalls: number;
  result?: PraxisApplicationCommandResult;
  message?: string;
};

async function runApplicationSession(input: {
  projectRoot: string;
  sessionId: string;
  now: () => string;
}): Promise<SessionRunResult> {
  let providerCalls = 0;
  try {
    const created = await createApplicationProjectRuntime(input.projectRoot, {
      now: input.now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "codingCore",
      sessionId: input.sessionId,
      runtimeId: `runtime.application.coreBaseline.${input.sessionId.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}`,
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async () => {
          providerCalls += 1;
          return { output_text: `application baseline completed for ${input.sessionId}` };
        },
      }),
    });
    if (!created.ok) {
      return { sessionId: input.sessionId, ok: false, providerCalls, message: created.error.message };
    }
    const transport = createLocalApplicationTransport(created.runtime);
    const started = await transport.dispatch({
      type: "application.start",
      cwd: input.projectRoot,
      mode: "live",
      sessionId: input.sessionId,
    });
    if (!started.ok) {
      return { sessionId: input.sessionId, ok: false, providerCalls, result: started, message: started.error.message };
    }
    const result = await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      sessionId: input.sessionId,
      input: {
        type: "application.input",
        text: "Run the application core baseline smoke.",
        cwd: input.projectRoot,
      },
    });
    return {
      sessionId: input.sessionId,
      ok: result.ok && result.view.status === "completed" && result.view.counters.modelCalls === 1,
      providerCalls,
      result,
      message: result.ok ? undefined : result.error.message,
    };
  } catch (error) {
    return {
      sessionId: input.sessionId,
      ok: false,
      providerCalls,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runApplicationCoreBaselineSmoke(
  input: RuntimeApplicationCoreBaselineSmokeInput = {},
): Promise<RuntimeApplicationCoreBaselineSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const rounds = clampPositiveInteger(input.rounds, 2);
  const sessions = clampPositiveInteger(input.sessions, 10);
  const concurrency = Math.min(clampPositiveInteger(input.concurrency, 4), sessions);
  const memorySampler = input.memorySampler ?? readMemory;
  const before = memorySampler();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-core-baseline-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const roundResults: RuntimeApplicationCoreBaselineRoundResult[] = [];
    for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
      const sessionRuns = await runWithConcurrency(sessions, concurrency, async (sessionIndex) => {
        const sessionId = `session.application.coreBaseline.round${roundIndex + 1}.session${sessionIndex}`;
        return runApplicationSession({ projectRoot, sessionId, now });
      });
      const ok = sessionRuns.filter((run) => run.ok).length;
      const failed = sessionRuns.length - ok;
      const providerCalls = sessionRuns.reduce((total, run) => total + run.providerCalls, 0);
      const successfulResults = sessionRuns
        .filter((run): run is SessionRunResult & { result: Extract<PraxisApplicationCommandResult, { ok: true }> } =>
          run.ok && run.result?.ok === true);
      const roundResult: RuntimeApplicationCoreBaselineRoundResult = {
        round: roundIndex + 1,
        status: failed === 0 && providerCalls === sessions ? "ok" : "failed",
        sessions: { requested: sessions, ok, failed },
        providerCalls,
        turns: successfulResults.reduce((total, run) => total + run.result.view.counters.turns, 0),
        modelCalls: successfulResults.reduce((total, run) => total + run.result.view.counters.modelCalls, 0),
        toolCalls: successfulResults.reduce((total, run) => total + run.result.view.counters.toolCalls, 0),
        mainLoopSteps: successfulResults.reduce((total, run) => total + run.result.view.counters.mainLoopSteps, 0),
        applicationEvents: successfulResults.reduce((total, run) => total + run.result.view.counters.events, 0),
        sampleSessionIds: sessionRuns.slice(0, 5).map((run) => run.sessionId),
        failures: sessionRuns
          .filter((run) => !run.ok)
          .map((run) => ({
            sessionId: run.sessionId,
            message: run.message ?? "unknown application baseline failure",
          })),
      };
      roundResults.push(roundResult);
    }

    const after = memorySampler();
    const memoryDelta = subtractMemory(after, before);
    const maxTotalRssDeltaBytes = input.maxTotalRssDeltaBytes
      ?? megabytesToBytes(input.maxTotalRssDeltaMb);
    const maxTotalHeapUsedDeltaBytes = input.maxTotalHeapUsedDeltaBytes
      ?? megabytesToBytes(input.maxTotalHeapUsedDeltaMb);
    const totalMemoryBudget = evaluateTotalMemoryBudget({
      delta: memoryDelta,
      maxTotalRssDeltaBytes,
      maxTotalHeapUsedDeltaBytes,
    });
    const okRounds = roundResults.filter((round) => round.status === "ok").length;
    const failedRounds = roundResults.length - okRounds;
    const sessionsOk = roundResults.reduce((total, round) => total + round.sessions.ok, 0);
    const sessionsFailed = roundResults.reduce((total, round) => total + round.sessions.failed, 0);
    const providerCalls = roundResults.reduce((total, round) => total + round.providerCalls, 0);
    const aggregate = {
      turns: roundResults.reduce((total, round) => total + round.turns, 0),
      modelCalls: roundResults.reduce((total, round) => total + round.modelCalls, 0),
      toolCalls: roundResults.reduce((total, round) => total + round.toolCalls, 0),
      mainLoopSteps: roundResults.reduce((total, round) => total + round.mainLoopSteps, 0),
      applicationEvents: roundResults.reduce((total, round) => total + round.applicationEvents, 0),
    };
    const failures = roundResults.flatMap((round) =>
      round.failures.map((failure) => ({
        round: round.round,
        sessionId: failure.sessionId,
        message: failure.message,
      })));
    const sampleSessionIds = roundResults.flatMap((round) => round.sampleSessionIds).slice(0, 10);

    return {
      status: failedRounds === 0 && totalMemoryBudget.status !== "exceeded" ? "ok" : "failed",
      startedAt,
      finishedAt: now(),
      projectRoot,
      rounds: {
        requested: rounds,
        ok: okRounds,
        failed: failedRounds,
      },
      sessions: {
        requestedPerRound: sessions,
        concurrency,
        ok: sessionsOk,
        failed: sessionsFailed,
      },
      providerCalls,
      memory: {
        before,
        after,
        delta: memoryDelta,
      },
      totalMemoryBudget,
      aggregate,
      roundResults,
      sampleSessionIds,
      failures,
    };
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const result = await runApplicationCoreBaselineSmoke({
    rounds: readNumberFlag(args, "--rounds"),
    sessions: readNumberFlag(args, "--sessions"),
    concurrency: readNumberFlag(args, "--concurrency"),
    maxTotalRssDeltaBytes:
      readNumberFlag(args, "--max-total-rss-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-rss-delta-mb")),
    maxTotalHeapUsedDeltaBytes:
      readNumberFlag(args, "--max-total-heap-used-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-heap-used-delta-mb")),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
