import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  runRuntimeCoreBaselineSeries,
  type RuntimeCoreBaselineMemoryBudget,
  type RuntimeCoreBaselineSeriesInput,
  type RuntimeCoreBaselineSeriesResult,
} from "./runtime_core_baseline.js";
import {
  runApplicationCoreBaselineSmoke,
  type RuntimeApplicationCoreBaselineSmokeInput,
  type RuntimeApplicationCoreBaselineSmokeResult,
} from "./runtime_application_core_baseline_smoke.js";

export type RuntimeCoreAcceptanceSuiteResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  runtimeCore: RuntimeCoreBaselineSeriesResult;
  applicationCore: RuntimeApplicationCoreBaselineSmokeResult;
  summary: {
    sections: number;
    okSections: number;
    failedSections: number;
    runtimeSessionsOk: number;
    applicationSessionsOk: number;
    providerCalls: number;
  };
};

export type RuntimeCoreAcceptanceSuiteInput = {
  runtime?: RuntimeCoreBaselineSeriesInput;
  application?: RuntimeApplicationCoreBaselineSmokeInput;
  now?: () => string;
};

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

function byteOrMbFlag(args: readonly string[], byteName: string, mbName: string): number | undefined {
  return readNumberFlag(args, byteName) ?? megabytesToBytes(readNumberFlag(args, mbName));
}

function memoryBudgetFromFlags(args: readonly string[], prefix: string): RuntimeCoreBaselineMemoryBudget {
  return {
    maxRssDeltaBytes: byteOrMbFlag(args, `--${prefix}max-rss-delta-bytes`, `--${prefix}max-rss-delta-mb`),
    maxHeapUsedDeltaBytes: byteOrMbFlag(
      args,
      `--${prefix}max-heap-used-delta-bytes`,
      `--${prefix}max-heap-used-delta-mb`,
    ),
  };
}

function defaultRuntimeInput(now: () => string): RuntimeCoreBaselineSeriesInput {
  return {
    rounds: 1,
    sessions: 10,
    concurrency: 4,
    now,
  };
}

function defaultApplicationInput(now: () => string): RuntimeApplicationCoreBaselineSmokeInput {
  return {
    rounds: 1,
    sessions: 10,
    concurrency: 4,
    now,
  };
}

export async function runRuntimeCoreAcceptanceSuite(
  input: RuntimeCoreAcceptanceSuiteInput = {},
): Promise<RuntimeCoreAcceptanceSuiteResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const runtimeCore = await runRuntimeCoreBaselineSeries({
    ...defaultRuntimeInput(now),
    ...(input.runtime ?? {}),
    now,
  });
  const applicationCore = await runApplicationCoreBaselineSmoke({
    ...defaultApplicationInput(now),
    ...(input.application ?? {}),
    now,
  });
  const okSections = [runtimeCore.status, applicationCore.status].filter((status) => status === "ok").length;
  const failedSections = 2 - okSections;
  return {
    status: failedSections === 0 ? "ok" : "failed",
    startedAt,
    finishedAt: now(),
    runtimeCore,
    applicationCore,
    summary: {
      sections: 2,
      okSections,
      failedSections,
      runtimeSessionsOk: runtimeCore.sessions.ok,
      applicationSessionsOk: applicationCore.sessions.ok,
      providerCalls: applicationCore.providerCalls,
    },
  };
}

function inputFromCli(args: readonly string[]): RuntimeCoreAcceptanceSuiteInput {
  const rounds = readNumberFlag(args, "--rounds");
  const sessions = readNumberFlag(args, "--sessions");
  const concurrency = readNumberFlag(args, "--concurrency");
  const runtimeRounds = readNumberFlag(args, "--runtime-rounds") ?? rounds;
  const runtimeSessions = readNumberFlag(args, "--runtime-sessions") ?? sessions;
  const runtimeConcurrency = readNumberFlag(args, "--runtime-concurrency") ?? concurrency;
  const applicationRounds = readNumberFlag(args, "--application-rounds") ?? rounds;
  const applicationSessions = readNumberFlag(args, "--application-sessions") ?? sessions;
  const applicationConcurrency = readNumberFlag(args, "--application-concurrency") ?? concurrency;
  const totalRssDeltaBytes = byteOrMbFlag(args, "--max-total-rss-delta-bytes", "--max-total-rss-delta-mb");
  const totalHeapUsedDeltaBytes = byteOrMbFlag(
    args,
    "--max-total-heap-used-delta-bytes",
    "--max-total-heap-used-delta-mb",
  );

  return {
    runtime: {
      rounds: runtimeRounds,
      sessions: runtimeSessions,
      concurrency: runtimeConcurrency,
      memoryBudget: memoryBudgetFromFlags(args, "runtime-"),
      totalMemoryBudget: {
        ...memoryBudgetFromFlags(args, "runtime-total-"),
        maxRssDeltaBytes:
          byteOrMbFlag(args, "--runtime-max-total-rss-delta-bytes", "--runtime-max-total-rss-delta-mb")
          ?? totalRssDeltaBytes,
        maxHeapUsedDeltaBytes:
          byteOrMbFlag(
            args,
            "--runtime-max-total-heap-used-delta-bytes",
            "--runtime-max-total-heap-used-delta-mb",
          )
          ?? totalHeapUsedDeltaBytes,
      },
    },
    application: {
      rounds: applicationRounds,
      sessions: applicationSessions,
      concurrency: applicationConcurrency,
      maxTotalRssDeltaBytes:
        byteOrMbFlag(args, "--application-max-total-rss-delta-bytes", "--application-max-total-rss-delta-mb")
        ?? totalRssDeltaBytes,
      maxTotalHeapUsedDeltaBytes:
        byteOrMbFlag(
          args,
          "--application-max-total-heap-used-delta-bytes",
          "--application-max-total-heap-used-delta-mb",
        )
        ?? totalHeapUsedDeltaBytes,
    },
  };
}

async function main(): Promise<void> {
  const result = await runRuntimeCoreAcceptanceSuite(inputFromCli(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
