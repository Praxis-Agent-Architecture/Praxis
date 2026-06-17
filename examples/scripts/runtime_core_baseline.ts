import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import type { RuntimeSessionSnapshot, RuntimeSessionStateEventStore } from "@praxis-ai/praxis";

import { MinimalRepoInspectorAgent } from "../minimal/repoInspectorAgent.js";

export type RuntimeCoreBaselineMemorySnapshot = {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
};

export type RuntimeCoreBaselineMemoryBudget = {
  maxRssDeltaBytes?: number;
  maxHeapUsedDeltaBytes?: number;
  maxHeapTotalDeltaBytes?: number;
  maxExternalDeltaBytes?: number;
  maxArrayBuffersDeltaBytes?: number;
};

export type RuntimeCoreBaselineMemoryBudgetCheck = {
  name:
    | "rssDeltaBytes"
    | "heapUsedDeltaBytes"
    | "heapTotalDeltaBytes"
    | "externalDeltaBytes"
    | "arrayBuffersDeltaBytes";
  actualBytes: number;
  limitBytes: number;
  ok: boolean;
};

export type RuntimeCoreBaselineMemoryBudgetSummary = {
  status: "not-configured" | "within-budget" | "exceeded";
  checks: readonly RuntimeCoreBaselineMemoryBudgetCheck[];
};

export type RuntimeCoreBaselineCountSummary = {
  states: number;
  events: number;
  invocations: number;
  mainLoopSteps: number;
  procedures: number;
  approvals: number;
  errors: number;
};

export type RuntimeCoreBaselineStoreMode = "memory" | "sqlite";

export type RuntimeCoreBaselineSqliteStorageBytes = {
  databaseBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
};

export type RuntimeCoreBaselineStoreSummary =
  | {
      mode: "memory";
    }
  | {
      mode: "sqlite";
      databasePath: string;
      storageBytes: RuntimeCoreBaselineSqliteStorageBytes;
    };

type RuntimeCoreBaselineStoreDraftSummary =
  | Extract<RuntimeCoreBaselineStoreSummary, { mode: "memory" }>
  | Omit<Extract<RuntimeCoreBaselineStoreSummary, { mode: "sqlite" }>, "storageBytes">;

export type RuntimeCoreBaselineResult = {
  status: "ok" | "failed";
  runtimeId: string;
  runId: string;
  store: RuntimeCoreBaselineStoreSummary;
  sessions: {
    requested: number;
    concurrency: number;
    ok: number;
    failed: number;
  };
  timing: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  memory: {
    before: RuntimeCoreBaselineMemorySnapshot;
    after: RuntimeCoreBaselineMemorySnapshot;
    delta: RuntimeCoreBaselineMemorySnapshot;
  };
  memoryBudget: RuntimeCoreBaselineMemoryBudgetSummary;
  aggregate: RuntimeCoreBaselineCountSummary;
  perSessionAverage: RuntimeCoreBaselineCountSummary;
  sampleSessionIds: readonly string[];
  failures: readonly {
    sessionId: string;
    message: string;
  }[];
};

export type RuntimeCoreBaselineSeriesResult = {
  status: "ok" | "failed";
  runtimeId: string;
  runIdPrefix: string;
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
  timing: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  memory: {
    before: RuntimeCoreBaselineMemorySnapshot;
    after: RuntimeCoreBaselineMemorySnapshot;
    delta: RuntimeCoreBaselineMemorySnapshot;
  };
  totalMemoryBudget: RuntimeCoreBaselineMemoryBudgetSummary;
  aggregate: RuntimeCoreBaselineCountSummary;
  perSessionAverage: RuntimeCoreBaselineCountSummary;
  roundResults: readonly RuntimeCoreBaselineResult[];
  failures: readonly {
    round: number;
    runId: string;
    message: string;
  }[];
};

export type RuntimeCoreBaselineInput = {
  sessions?: number;
  concurrency?: number;
  runtimeId?: string;
  runId?: string;
  storeMode?: RuntimeCoreBaselineStoreMode;
  sqlitePath?: string;
  task?: string;
  now?: () => string;
  memorySampler?: () => RuntimeCoreBaselineMemorySnapshot;
  memoryBudget?: RuntimeCoreBaselineMemoryBudget;
};

export type RuntimeCoreBaselineSeriesInput = Omit<RuntimeCoreBaselineInput, "runId"> & {
  rounds?: number;
  runIdPrefix?: string;
  totalMemoryBudget?: RuntimeCoreBaselineMemoryBudget;
};

type RunRecord = {
  sessionId: string;
  ok: boolean;
  message?: string;
};

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
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

function validBudgetLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value < 0 ? undefined : Math.floor(value);
}

function budgetCheck(
  name: RuntimeCoreBaselineMemoryBudgetCheck["name"],
  actualBytes: number,
  limitBytes: number | undefined,
): RuntimeCoreBaselineMemoryBudgetCheck | undefined {
  const limit = validBudgetLimit(limitBytes);
  if (limit === undefined) return undefined;
  return {
    name,
    actualBytes,
    limitBytes: limit,
    ok: actualBytes <= limit,
  };
}

function evaluateMemoryBudget(
  delta: RuntimeCoreBaselineMemorySnapshot,
  budget: RuntimeCoreBaselineMemoryBudget | undefined,
): RuntimeCoreBaselineMemoryBudgetSummary {
  if (budget === undefined) return { status: "not-configured", checks: [] };

  const checks = [
    budgetCheck("rssDeltaBytes", delta.rssBytes, budget.maxRssDeltaBytes),
    budgetCheck("heapUsedDeltaBytes", delta.heapUsedBytes, budget.maxHeapUsedDeltaBytes),
    budgetCheck("heapTotalDeltaBytes", delta.heapTotalBytes, budget.maxHeapTotalDeltaBytes),
    budgetCheck("externalDeltaBytes", delta.externalBytes, budget.maxExternalDeltaBytes),
    budgetCheck("arrayBuffersDeltaBytes", delta.arrayBuffersBytes, budget.maxArrayBuffersDeltaBytes),
  ].filter((check): check is RuntimeCoreBaselineMemoryBudgetCheck => check !== undefined);

  if (checks.length === 0) return { status: "not-configured", checks: [] };
  return {
    status: checks.every((check) => check.ok) ? "within-budget" : "exceeded",
    checks,
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

function emptyCounts(): RuntimeCoreBaselineCountSummary {
  return {
    states: 0,
    events: 0,
    invocations: 0,
    mainLoopSteps: 0,
    procedures: 0,
    approvals: 0,
    errors: 0,
  };
}

function addCounts(
  current: RuntimeCoreBaselineCountSummary,
  next: RuntimeCoreBaselineCountSummary,
): RuntimeCoreBaselineCountSummary {
  return {
    states: current.states + next.states,
    events: current.events + next.events,
    invocations: current.invocations + next.invocations,
    mainLoopSteps: current.mainLoopSteps + next.mainLoopSteps,
    procedures: current.procedures + next.procedures,
    approvals: current.approvals + next.approvals,
    errors: current.errors + next.errors,
  };
}

function divideCounts(
  counts: RuntimeCoreBaselineCountSummary,
  divisor: number,
): RuntimeCoreBaselineCountSummary {
  if (divisor <= 0) return emptyCounts();
  return {
    states: counts.states / divisor,
    events: counts.events / divisor,
    invocations: counts.invocations / divisor,
    mainLoopSteps: counts.mainLoopSteps / divisor,
    procedures: counts.procedures / divisor,
    approvals: counts.approvals / divisor,
    errors: counts.errors / divisor,
  };
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

function sessionCounts(snapshot: RuntimeSessionSnapshot): RuntimeCoreBaselineCountSummary {
  return {
    states: snapshot.states.length,
    events: snapshot.events.length,
    invocations: snapshot.invocations.length,
    mainLoopSteps: snapshot.mainLoopSteps.length,
    procedures: snapshot.procedures.length,
    approvals: snapshot.approvals.length,
    errors: snapshot.errors.length,
  };
}

async function createBaselineStore(input: {
  storeMode: RuntimeCoreBaselineStoreMode;
  sqlitePath?: string;
}): Promise<{
  store: RuntimeSessionStateEventStore;
  summary: RuntimeCoreBaselineStoreDraftSummary;
}> {
  if (input.storeMode === "memory") {
    return {
      store: praxis.runtime.createInMemorySessionStateEventStore(),
      summary: { mode: "memory" },
    };
  }

  const databasePath = input.sqlitePath ?? path.join(
    await mkdtemp(path.join(os.tmpdir(), "praxis-runtime-core-baseline-")),
    "runtime-baseline.sqlite",
  );
  await mkdir(path.dirname(databasePath), { recursive: true });
  return {
    store: await praxis.runtime.createSqliteSessionStateEventStore(databasePath),
    summary: {
      mode: "sqlite",
      databasePath,
    },
  };
}

async function fileSizeOrZero(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function readSqliteStorageBytes(databasePath: string): Promise<RuntimeCoreBaselineSqliteStorageBytes> {
  const databaseBytes = await fileSizeOrZero(databasePath);
  const walBytes = await fileSizeOrZero(`${databasePath}-wal`);
  const shmBytes = await fileSizeOrZero(`${databasePath}-shm`);
  return {
    databaseBytes,
    walBytes,
    shmBytes,
    totalBytes: databaseBytes + walBytes + shmBytes,
  };
}

async function completeStoreSummary(
  summary: RuntimeCoreBaselineStoreDraftSummary,
): Promise<RuntimeCoreBaselineStoreSummary> {
  if (summary.mode === "memory") return summary;
  return {
    ...summary,
    storageBytes: await readSqliteStorageBytes(summary.databasePath),
  };
}

function baselineStoreSummaryFor(input: {
  storeMode: RuntimeCoreBaselineStoreMode;
  sqlitePath?: string;
}): RuntimeCoreBaselineStoreSummary {
  if (input.storeMode === "memory") return { mode: "memory" };
  return {
    mode: "sqlite",
    databasePath: input.sqlitePath ?? ":auto-temp:",
    storageBytes: {
      databaseBytes: 0,
      walBytes: 0,
      shmBytes: 0,
      totalBytes: 0,
    },
  };
}

export async function runRuntimeCoreBaseline(
  input: RuntimeCoreBaselineInput = {},
): Promise<RuntimeCoreBaselineResult> {
  const sessions = clampPositiveInteger(input.sessions, 10);
  const concurrency = Math.min(clampPositiveInteger(input.concurrency, 4), sessions);
  const runtimeId = input.runtimeId ?? "runtime.baseline.agentCore";
  const runId = input.runId ?? `run-${randomUUID()}`;
  const storeMode = input.storeMode ?? "memory";
  const task = input.task ?? "Run a dry-run repository inspection for runtime core baseline measurement.";
  const now = input.now ?? (() => new Date().toISOString());
  const memorySampler = input.memorySampler ?? readMemory;
  const startedAt = now();
  const startNs = process.hrtime.bigint();
  const before = memorySampler();

  const compiled = praxis.compileAgent(new MinimalRepoInspectorAgent(), {
    compiledAt: "2026-05-06T00:00:00.000Z",
  });
  if (!compiled.ok) {
    const after = memorySampler();
    const memoryDelta = subtractMemory(after, before);
    return {
      status: "failed",
      runtimeId,
      runId,
      store: baselineStoreSummaryFor({
        storeMode,
        sqlitePath: input.sqlitePath,
      }),
      sessions: { requested: sessions, concurrency, ok: 0, failed: sessions },
      timing: {
        startedAt,
        finishedAt: now(),
        durationMs: Number(process.hrtime.bigint() - startNs) / 1_000_000,
      },
      memory: { before, after, delta: memoryDelta },
      memoryBudget: evaluateMemoryBudget(memoryDelta, input.memoryBudget),
      aggregate: emptyCounts(),
      perSessionAverage: emptyCounts(),
      sampleSessionIds: [],
      failures: [{ sessionId: "compile", message: compiled.error.message }],
    };
  }

  const { store, summary: storeSummary } = await createBaselineStore({
    storeMode,
    sqlitePath: input.sqlitePath,
  });
  const kernel = praxis.runtime.createPraxisRuntimeKernel({ runtimeId });
  const sessionIds = Array.from(
    { length: sessions },
    (_, index) => `${runtimeId}:${runId}:session:${index}`,
  );
  let storeClosed = false;
  async function closeStore(): Promise<void> {
    if (storeClosed) return;
    storeClosed = true;
    await store.close?.();
  }
  try {
    const records = await runWithConcurrency(sessions, concurrency, async (index): Promise<RunRecord> => {
      const sessionId = sessionIds[index] ?? `${runtimeId}:session:${index}`;
      const result = await kernel.runManifest(compiled.manifest, task, {
        sessionId,
        dryRun: true,
        store,
        storage: {
          cwd: process.cwd(),
          initMode: "never",
        },
        now,
      });

      return result.ok
        ? { sessionId, ok: true }
        : { sessionId, ok: false, message: result.error.message };
    });

    let aggregate = emptyCounts();
    for (const sessionId of sessionIds) {
      const snapshot = await store.readSession(sessionId);
      aggregate = addCounts(aggregate, sessionCounts(snapshot));
    }

    const failures = records
      .filter((record) => !record.ok)
      .map((record) => ({
        sessionId: record.sessionId,
        message: record.message ?? "unknown runtime failure",
      }));
    const ok = records.length - failures.length;
    const after = memorySampler();
    const memoryDelta = subtractMemory(after, before);
    const memoryBudget = evaluateMemoryBudget(memoryDelta, input.memoryBudget);

    return {
      status: failures.length === 0 && aggregate.errors === 0 && memoryBudget.status !== "exceeded"
        ? "ok"
        : "failed",
      runtimeId,
      runId,
      store: await (async () => {
        await closeStore();
        return completeStoreSummary(storeSummary);
      })(),
      sessions: {
        requested: sessions,
        concurrency,
        ok,
        failed: failures.length,
      },
      timing: {
        startedAt,
        finishedAt: now(),
        durationMs: Number(process.hrtime.bigint() - startNs) / 1_000_000,
      },
      memory: {
        before,
        after,
        delta: memoryDelta,
      },
      memoryBudget,
      aggregate,
      perSessionAverage: divideCounts(aggregate, ok),
      sampleSessionIds: sessionIds.slice(0, 5),
      failures,
    };
  } finally {
    await closeStore();
  }
}

export async function runRuntimeCoreBaselineSeries(
  input: RuntimeCoreBaselineSeriesInput = {},
): Promise<RuntimeCoreBaselineSeriesResult> {
  const rounds = clampPositiveInteger(input.rounds, 3);
  const sessions = clampPositiveInteger(input.sessions, 10);
  const concurrency = Math.min(clampPositiveInteger(input.concurrency, 4), sessions);
  const runtimeId = input.runtimeId ?? "runtime.baseline.agentCore";
  const runIdPrefix = input.runIdPrefix ?? `series-${randomUUID()}`;
  const now = input.now ?? (() => new Date().toISOString());
  const memorySampler = input.memorySampler ?? readMemory;
  const startedAt = now();
  const startNs = process.hrtime.bigint();
  const before = memorySampler();
  const roundResults: RuntimeCoreBaselineResult[] = [];

  for (let index = 0; index < rounds; index += 1) {
    roundResults.push(await runRuntimeCoreBaseline({
      sessions,
      concurrency,
      runtimeId,
      runId: `${runIdPrefix}-round-${index + 1}`,
      storeMode: input.storeMode,
      sqlitePath: input.sqlitePath,
      task: input.task,
      now,
      memorySampler,
      memoryBudget: input.memoryBudget,
    }));
  }

  let aggregate = emptyCounts();
  for (const round of roundResults) {
    aggregate = addCounts(aggregate, round.aggregate);
  }
  const okRounds = roundResults.filter((round) => round.status === "ok").length;
  const failedRounds = roundResults.length - okRounds;
  const sessionsOk = roundResults.reduce((total, round) => total + round.sessions.ok, 0);
  const sessionsFailed = roundResults.reduce((total, round) => total + round.sessions.failed, 0);
  const after = memorySampler();
  const memoryDelta = subtractMemory(after, before);
  const totalMemoryBudget = evaluateMemoryBudget(memoryDelta, input.totalMemoryBudget);
  const failures = roundResults
    .flatMap((round, index) => {
      if (round.status === "ok") return [];
      const roundFailures = round.failures.length > 0
        ? round.failures.map((failure) => failure.message)
        : [`round status ${round.status}`];
      return roundFailures.map((message) => ({
        round: index + 1,
        runId: round.runId,
        message,
      }));
    });

  return {
    status: failedRounds === 0 && totalMemoryBudget.status !== "exceeded" ? "ok" : "failed",
    runtimeId,
    runIdPrefix,
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
    timing: {
      startedAt,
      finishedAt: now(),
      durationMs: Number(process.hrtime.bigint() - startNs) / 1_000_000,
    },
    memory: {
      before,
      after,
      delta: memoryDelta,
    },
    totalMemoryBudget,
    aggregate,
    perSessionAverage: divideCounts(aggregate, sessionsOk),
    roundResults,
    failures,
  };
}

function megabytesToBytes(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.floor(value * 1024 * 1024);
}

function readNumberFlag(args: readonly string[], name: string): number | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) {
    return Number(inline.slice(prefix.length));
  }
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] !== undefined) {
    return Number(args[index + 1]);
  }
  return undefined;
}

function readStringFlag(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] !== undefined) {
    return args[index + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rawStore = readStringFlag(args, "--store");
  const storeMode = rawStore === "sqlite" ? "sqlite" : "memory";
  const sessions = readNumberFlag(args, "--sessions");
  const concurrency = readNumberFlag(args, "--concurrency");
  const memoryBudget = {
    maxRssDeltaBytes:
      readNumberFlag(args, "--max-rss-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-rss-delta-mb")),
    maxHeapUsedDeltaBytes:
      readNumberFlag(args, "--max-heap-used-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-heap-used-delta-mb")),
    maxHeapTotalDeltaBytes:
      readNumberFlag(args, "--max-heap-total-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-heap-total-delta-mb")),
    maxExternalDeltaBytes:
      readNumberFlag(args, "--max-external-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-external-delta-mb")),
    maxArrayBuffersDeltaBytes:
      readNumberFlag(args, "--max-array-buffers-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-array-buffers-delta-mb")),
  };
  const totalMemoryBudget = {
    maxRssDeltaBytes:
      readNumberFlag(args, "--max-total-rss-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-rss-delta-mb")),
    maxHeapUsedDeltaBytes:
      readNumberFlag(args, "--max-total-heap-used-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-heap-used-delta-mb")),
    maxHeapTotalDeltaBytes:
      readNumberFlag(args, "--max-total-heap-total-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-heap-total-delta-mb")),
    maxExternalDeltaBytes:
      readNumberFlag(args, "--max-total-external-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-external-delta-mb")),
    maxArrayBuffersDeltaBytes:
      readNumberFlag(args, "--max-total-array-buffers-delta-bytes")
      ?? megabytesToBytes(readNumberFlag(args, "--max-total-array-buffers-delta-mb")),
  };
  const rounds = readNumberFlag(args, "--rounds");
  const result = rounds === undefined
    ? await runRuntimeCoreBaseline({
      sessions,
      concurrency,
      storeMode,
      runId: readStringFlag(args, "--run-id"),
      sqlitePath: readStringFlag(args, "--sqlite-path"),
      memoryBudget,
    })
    : await runRuntimeCoreBaselineSeries({
      rounds,
      sessions,
      concurrency,
      storeMode,
      runIdPrefix: readStringFlag(args, "--run-id-prefix") ?? readStringFlag(args, "--run-id"),
      sqlitePath: readStringFlag(args, "--sqlite-path"),
      memoryBudget,
      totalMemoryBudget,
    });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
