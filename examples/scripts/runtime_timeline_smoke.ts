import {
  runApplicationFoundationRewindSmoke,
} from "./runtime_application_foundation_rewind_smoke.js";
import {
  runApplicationSqliteSmoke,
} from "./runtime_application_sqlite_smoke.js";

export type RuntimeTimelineSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  sqlitePath: string;
  sourceKind: string;
  timelineItems: number;
  expectedTimelineItems: number;
  hasRuntimeEvents: boolean;
  hasInvocations: boolean;
  hasMainLoopSteps: boolean;
  includesSessionCreated: boolean;
  includesFinalOutput: boolean;
  includesModelInvocation: boolean;
  includesPromptLoweringStep: boolean;
  checkpoint: {
    status: "ok" | "failed";
    sourceKind: string;
    hasFoundationSession: boolean;
    hasCheckpoints: boolean;
    hasSessionForks: boolean;
    checkpointCount: number;
    sessionForkCount: number;
    checkpointTurnIds: readonly string[];
    forkedFromTurnId: string | undefined;
  };
  query: {
    indexTotalItems: number;
    checkpointItems: number;
    turnOneItems: number;
    sessionForkRefs: number;
    replayStatus: "ready" | "unavailable";
    replayMode: "read-only-plan";
    replayRequiresExecution: "none";
    replayItemIds: readonly string[];
  };
};

export type RuntimeTimelineSmokeInput = {
  now?: () => string;
};

export async function runRuntimeTimelineSmoke(
  input: RuntimeTimelineSmokeInput = {},
): Promise<RuntimeTimelineSmokeResult> {
  const startedAt = input.now?.() ?? new Date().toISOString();
  const sqlite = await runApplicationSqliteSmoke(input);
  const foundationRewind = await runApplicationFoundationRewindSmoke(input);
  const timeline = sqlite.timeline;
  const checkpoint = foundationRewind.timeline;
  const query = foundationRewind.timelineQuery;
  return {
    status: sqlite.status === "ok" &&
      timeline.status === "ok" &&
      foundationRewind.status === "ok" &&
      checkpoint.status === "ok" &&
      query.status === "ok" &&
      query.indexTotalItems > 0 &&
      query.checkpointItems === 2 &&
      query.turnOneItems >= 2 &&
      query.sessionForkRefs >= 1 &&
      query.replayStatus === "ready" &&
      query.replayRequiresExecution === "none"
      ? "ok"
      : "failed",
    startedAt,
    finishedAt: input.now?.() ?? new Date().toISOString(),
    sqlitePath: sqlite.sqlitePath,
    sourceKind: timeline.sourceKind,
    timelineItems: timeline.timelineItems,
    expectedTimelineItems: timeline.expectedTimelineItems,
    hasRuntimeEvents: timeline.hasRuntimeEvents,
    hasInvocations: timeline.hasInvocations,
    hasMainLoopSteps: timeline.hasMainLoopSteps,
    includesSessionCreated: timeline.includesSessionCreated,
    includesFinalOutput: timeline.includesFinalOutput,
    includesModelInvocation: timeline.includesModelInvocation,
    includesPromptLoweringStep: timeline.includesPromptLoweringStep,
    checkpoint: {
      status: checkpoint.status,
      sourceKind: checkpoint.sourceKind,
      hasFoundationSession: checkpoint.hasFoundationSession,
      hasCheckpoints: checkpoint.hasCheckpoints,
      hasSessionForks: checkpoint.hasSessionForks,
      checkpointCount: checkpoint.checkpointCount,
      sessionForkCount: checkpoint.sessionForkCount,
      checkpointTurnIds: checkpoint.checkpointTurnIds,
      forkedFromTurnId: checkpoint.forkedFromTurnId,
    },
    query: {
      indexTotalItems: query.indexTotalItems,
      checkpointItems: query.checkpointItems,
      turnOneItems: query.turnOneItems,
      sessionForkRefs: query.sessionForkRefs,
      replayStatus: query.replayStatus,
      replayMode: query.replayMode,
      replayRequiresExecution: query.replayRequiresExecution,
      replayItemIds: query.replayItemIds,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runRuntimeTimelineSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
