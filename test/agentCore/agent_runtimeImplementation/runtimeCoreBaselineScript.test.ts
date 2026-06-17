import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runRuntimeCoreBaseline,
  runRuntimeCoreBaselineSeries,
} from "../../../examples/scripts/runtime_core_baseline.js";

test("runtime core baseline runs multiple dry-run sessions and reports retained records", async () => {
  const result = await runRuntimeCoreBaseline({
    sessions: 3,
    concurrency: 2,
    runtimeId: "runtime.baseline.test",
    task: "Inspect the repository in dry-run mode for baseline testing.",
    now: () => "2026-05-06T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.sessions.requested, 3);
  assert.equal(result.sessions.ok, 3);
  assert.equal(result.sessions.failed, 0);
  assert.equal(result.aggregate.errors, 0);
  assert.ok(result.aggregate.events >= result.sessions.ok);
  assert.ok(result.aggregate.mainLoopSteps >= result.sessions.ok);
  assert.ok(result.perSessionAverage.events >= 1);
  assert.ok(result.perSessionAverage.mainLoopSteps >= 1);
  assert.equal(result.sampleSessionIds.length, 3);
  assert.ok(result.memory.before.heapUsedBytes > 0);
  assert.ok(result.memory.after.heapUsedBytes > 0);
});

test("runtime core baseline fails when configured memory budget is exceeded", async () => {
  const memorySamples = [
    {
      rssBytes: 100,
      heapTotalBytes: 200,
      heapUsedBytes: 100,
      externalBytes: 10,
      arrayBuffersBytes: 5,
    },
    {
      rssBytes: 160,
      heapTotalBytes: 220,
      heapUsedBytes: 135,
      externalBytes: 12,
      arrayBuffersBytes: 5,
    },
  ];
  let memorySampleIndex = 0;

  const result = await runRuntimeCoreBaseline({
    sessions: 1,
    concurrency: 1,
    runtimeId: "runtime.baseline.memory-budget.test",
    runId: "run-memory-budget",
    task: "Inspect the repository in dry-run mode for memory budget testing.",
    now: () => "2026-05-06T00:00:00.000Z",
    memorySampler: () => memorySamples[Math.min(memorySampleIndex++, memorySamples.length - 1)]!,
    memoryBudget: {
      maxRssDeltaBytes: 1_000,
      maxHeapUsedDeltaBytes: 10,
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.sessions.ok, 1);
  assert.equal(result.sessions.failed, 0);
  assert.equal(result.memoryBudget.status, "exceeded");
  assert.deepEqual(
    result.memoryBudget.checks.map((check) => [check.name, check.actualBytes, check.limitBytes, check.ok]),
    [
      ["rssDeltaBytes", 60, 1_000, true],
      ["heapUsedDeltaBytes", 35, 10, false],
    ],
  );
});

test("runtime core baseline can persist the same dry-run session chain through SQLite", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-runtime-baseline-"));
  const sqlitePath = path.join(tempRoot, "runtime-baseline.sqlite");
  try {
    const result = await runRuntimeCoreBaseline({
      sessions: 2,
      concurrency: 1,
      runtimeId: "runtime.baseline.sqlite.test",
      runId: "run-sqlite-persistence-test",
      storeMode: "sqlite",
      sqlitePath,
      task: "Inspect the repository in dry-run mode for SQLite baseline testing.",
      now: () => "2026-05-06T00:00:00.000Z",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.runId, "run-sqlite-persistence-test");
    assert.equal(result.store.mode, "sqlite");
    assert.equal(result.store.databasePath, sqlitePath);
    assert.ok(result.store.storageBytes.databaseBytes > 0);
    assert.ok(result.store.storageBytes.totalBytes >= result.store.storageBytes.databaseBytes);
    assert.equal(result.sessions.ok, 2);
    assert.equal(result.sessions.failed, 0);
    assert.equal(result.aggregate.errors, 0);
    assert.ok(result.aggregate.events >= result.sessions.ok);
    assert.ok(result.aggregate.mainLoopSteps >= result.sessions.ok);

    const sqlite = await import("node:sqlite");
    const db = new sqlite.DatabaseSync(sqlitePath);
    try {
      const sessions = db.prepare("SELECT COUNT(*) AS count FROM runtime_sessions").get() as { count: number };
      const events = db.prepare("SELECT COUNT(*) AS count FROM runtime_events").get() as { count: number };
      const mainLoopSteps = db.prepare("SELECT COUNT(*) AS count FROM runtime_main_loop_steps").get() as { count: number };
      assert.equal(sessions.count, 2);
      assert.ok(events.count >= result.sessions.ok);
      assert.ok(mainLoopSteps.count >= result.sessions.ok);
    } finally {
      db.close();
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runtime core baseline isolates aggregate counts by run id when a SQLite file is reused", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-runtime-baseline-reuse-"));
  const sqlitePath = path.join(tempRoot, "runtime-baseline.sqlite");
  try {
    const first = await runRuntimeCoreBaseline({
      sessions: 2,
      concurrency: 1,
      runtimeId: "runtime.baseline.sqlite.reuse.test",
      runId: "run-first",
      storeMode: "sqlite",
      sqlitePath,
      task: "Inspect the repository in dry-run mode for SQLite reuse testing.",
      now: () => "2026-05-06T00:00:00.000Z",
    });
    const second = await runRuntimeCoreBaseline({
      sessions: 1,
      concurrency: 1,
      runtimeId: "runtime.baseline.sqlite.reuse.test",
      runId: "run-second",
      storeMode: "sqlite",
      sqlitePath,
      task: "Inspect the repository in dry-run mode for SQLite reuse testing.",
      now: () => "2026-05-06T00:00:00.000Z",
    });

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(second.sessions.ok, 1);
    assert.equal(second.aggregate.events, first.aggregate.events / first.sessions.ok);
    assert.equal(second.aggregate.mainLoopSteps, first.aggregate.mainLoopSteps / first.sessions.ok);
    assert.deepEqual(second.sampleSessionIds, [
      "runtime.baseline.sqlite.reuse.test:run-second:session:0",
    ]);

    const sqlite = await import("node:sqlite");
    const db = new sqlite.DatabaseSync(sqlitePath);
    try {
      const sessions = db.prepare("SELECT COUNT(*) AS count FROM runtime_sessions").get() as { count: number };
      assert.equal(sessions.count, 3);
    } finally {
      db.close();
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runtime core baseline series runs repeated rounds and fails on total memory growth budget", async () => {
  const memorySamples = [
    {
      rssBytes: 1_000,
      heapTotalBytes: 2_000,
      heapUsedBytes: 1_000,
      externalBytes: 10,
      arrayBuffersBytes: 5,
    },
    {
      rssBytes: 1_100,
      heapTotalBytes: 2_050,
      heapUsedBytes: 1_030,
      externalBytes: 12,
      arrayBuffersBytes: 5,
    },
    {
      rssBytes: 1_110,
      heapTotalBytes: 2_060,
      heapUsedBytes: 1_040,
      externalBytes: 12,
      arrayBuffersBytes: 5,
    },
    {
      rssBytes: 1_180,
      heapTotalBytes: 2_120,
      heapUsedBytes: 1_090,
      externalBytes: 12,
      arrayBuffersBytes: 5,
    },
  ];
  let memorySampleIndex = 0;

  const result = await runRuntimeCoreBaselineSeries({
    rounds: 2,
    sessions: 1,
    concurrency: 1,
    runtimeId: "runtime.baseline.series.test",
    runIdPrefix: "series-budget",
    task: "Inspect the repository in dry-run mode for series budget testing.",
    now: () => "2026-05-06T00:00:00.000Z",
    memorySampler: () => memorySamples[Math.min(memorySampleIndex++, memorySamples.length - 1)]!,
    memoryBudget: {
      maxRssDeltaBytes: 1_000,
      maxHeapUsedDeltaBytes: 1_000,
    },
    totalMemoryBudget: {
      maxRssDeltaBytes: 150,
      maxHeapUsedDeltaBytes: 1_000,
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.rounds.requested, 2);
  assert.equal(result.rounds.ok, 2);
  assert.equal(result.rounds.failed, 0);
  assert.deepEqual(result.roundResults.map((round) => round.runId), [
    "series-budget-round-1",
    "series-budget-round-2",
  ]);
  assert.equal(result.totalMemoryBudget.status, "exceeded");
  assert.deepEqual(
    result.totalMemoryBudget.checks.map((check) => [check.name, check.actualBytes, check.limitBytes, check.ok]),
    [
      ["rssDeltaBytes", 180, 150, false],
      ["heapUsedDeltaBytes", 90, 1_000, true],
    ],
  );
  assert.equal(result.aggregate.events, 56);
  assert.equal(result.aggregate.mainLoopSteps, 34);
});
