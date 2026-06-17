import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommandResult,
  type PraxisApplicationEvent,
  type PraxisApplicationSessionReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationFoundationRewindSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
    sessionId: string;
  };
  rewind: {
    ok: boolean;
    eventId: string | undefined;
    targetTurnId: string | undefined;
    removedTurnIds: readonly string[];
    sourceSessionId: string | undefined;
    targetSessionId: string | undefined;
    foundationForked: boolean;
  };
  foundation: {
    sourceSessionId: string;
    forkSessionId: string | undefined;
    sourceTurnIds: readonly string[];
    forkTurnIds: readonly string[];
    sourceKeepsSecondTurn: boolean;
    forkKeepsFirstTurn: boolean;
    forkDropsSecondTurn: boolean;
    forkKeepsThirdTurn: boolean;
    sourceMessageCount: number;
    forkMessageCount: number;
  };
  timeline: {
    status: "ok" | "failed";
    sourceKind: string;
    hasFoundationSession: boolean;
    hasCheckpoints: boolean;
    hasSessionForks: boolean;
    checkpointCount: number;
    sessionForkCount: number;
    checkpointTurnIds: readonly string[];
    sourceSessionId: string | undefined;
    targetSessionId: string | undefined;
    forkedFromTurnId: string | undefined;
  };
  sessionReport: {
    status: "ok" | "failed";
    applicationCommandKind: string;
    publicSafe: boolean;
    applicationSessionId: string;
    sourceKind: string;
    hasSession: boolean;
    hasForkRelation: boolean;
    hasCopiedConversation: boolean;
    turns: number;
    messages: number;
    copiedMessages: number;
    checkpointTurnIds: readonly string[];
    sourceSessionId: string | undefined;
    targetSessionId: string | undefined;
    forkedFromTurnId: string | undefined;
    forkKind: string | undefined;
    messageTurnIdsKnown: boolean;
    forkSourceRecorded: boolean;
  };
  timelineQuery: {
    status: "ok" | "failed";
    indexTotalItems: number;
    checkpointItems: number;
    turnOneItems: number;
    sessionForkRefs: number;
    replayStatus: "ready" | "unavailable";
    replayMode: "read-only-plan";
    replayRequiresExecution: "none";
    replayItemIds: readonly string[];
  };
  afterRewind: {
    thirdProviderPromptIncludesFirstTurn: boolean;
    thirdProviderPromptIncludesSecondTurn: boolean;
    thirdProviderPromptIncludesCurrentTurn: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationFoundationRewindSmokeInput = {
  now?: () => string;
};

const firstUserText = "foundation rewind smoke unique first user request";
const firstAssistantText = "foundation rewind smoke unique first answer";
const secondUserText = "foundation rewind smoke unique second user request";
const secondAssistantText = "foundation rewind smoke unique second answer";
const thirdUserText = "foundation rewind smoke unique third user request";
const thirdAssistantText = "foundation rewind smoke final";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function sessionReportOutput(value: unknown): PraxisApplicationSessionReportOutput {
  if (record(value).kind !== "praxis.application.sessionReport") {
    throw new Error("application.inspectSessionReport did not return a session report output.");
  }
  return value as PraxisApplicationSessionReportOutput;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-foundation-rewind-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-foundation-rewind-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application foundation rewind smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-foundation-rewind-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-foundation-rewind-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationFoundationRewindSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationFoundationRewindSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationFoundationRewindSmoke",
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

export default ApplicationFoundationRewindSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-foundation-rewind-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationFoundationRewindSmokeAgent",
    application: { id: "application.foundation-rewind-smoke" },
    agent: { id: "agent.example.applicationFoundationRewindSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "runtime") return event.kind;
  return event.eventId;
}

async function submitText(input: {
  transport: ReturnType<typeof createLocalApplicationTransport>;
  sessionId: string;
  text: string;
  cwd: string;
}): Promise<PraxisApplicationCommandResult> {
  return await input.transport.dispatch({
    type: "application.submitTurn",
    mode: "live",
    sessionId: input.sessionId,
    input: {
      type: "application.input",
      text: input.text,
      cwd: input.cwd,
    },
  });
}

export async function runApplicationFoundationRewindSmoke(
  input: RuntimeApplicationFoundationRewindSmokeInput = {},
): Promise<RuntimeApplicationFoundationRewindSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-foundation-rewind-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const opened = await praxis.runtime.project.open({
      cwd: projectRoot,
      ownerId: "application-foundation-rewind-smoke",
      runtimeId: "runtime.application.foundationRewindSmoke",
      persistence: "memory",
      acquireLock: false,
      now,
    });
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    try {
      let providerCalls = 0;
      const providerBodies: unknown[] = [];
      const events: PraxisApplicationEvent[] = [];
      const sourceSessionId = "session.application.foundation-rewind-smoke";
      const created = await createApplicationProjectRuntime(projectRoot, {
        now,
        mode: "live",
        permissionProfile: "yolo",
        toolProfile: "codingCore",
        sessionId: sourceSessionId,
        foundationProject: opened.runtime,
        liveProviderResolver: async () => ({
          auth: authEnvelope(),
          providerCaller: async (envelope) => {
            providerCalls += 1;
            providerBodies.push(envelope.body);
            if (providerCalls === 1) return { output_text: firstAssistantText };
            if (providerCalls === 2) return { output_text: secondAssistantText };
            return { output_text: thirdAssistantText };
          },
        }),
      });
      if (!created.ok) {
        throw new Error(created.error.message);
      }

      const unsubscribe = created.runtime.subscribe((event) => events.push(event));
      try {
        const transport = createLocalApplicationTransport(created.runtime);
        await transport.dispatch({
          type: "application.start",
          cwd: projectRoot,
          mode: "live",
          sessionId: sourceSessionId,
        });
        await submitText({ transport, sessionId: sourceSessionId, text: firstUserText, cwd: projectRoot });
        await submitText({ transport, sessionId: sourceSessionId, text: secondUserText, cwd: projectRoot });
        const rewindResult = await transport.dispatch({
          type: "application.rewind",
          sessionId: sourceSessionId,
          turnId: "turn.1",
        });
        const rewindEvent = rewindResult.events[0];
        const rewindMetadata = record(rewindEvent?.metadata);
        const targetSessionId = stringValue(rewindMetadata.targetSessionId);
        const nextSessionId = targetSessionId ?? sourceSessionId;
        const thirdResult = await submitText({
          transport,
          sessionId: nextSessionId,
          text: thirdUserText,
          cwd: projectRoot,
        });
        const view = thirdResult.view;
        const thirdProviderPrompt = JSON.stringify(providerBodies[2]);
        const sourceSnapshot = await opened.runtime.store.readSessionSnapshot(sourceSessionId);
        const forkSnapshot = targetSessionId === undefined
          ? undefined
          : await opened.runtime.store.readSessionSnapshot(targetSessionId);
        if (forkSnapshot === undefined) {
          throw new Error("foundation rewind did not create a fork session snapshot.");
        }
        const sourceTurnIds = sourceSnapshot.turns.map((turn) => turn.turnId);
        const forkTurnIds = forkSnapshot.turns.map((turn) => turn.turnId);
        const forkMessages = forkSnapshot.messages;
        const foundation = {
          sourceSessionId,
          forkSessionId: targetSessionId,
          sourceTurnIds,
          forkTurnIds,
          sourceKeepsSecondTurn: sourceSnapshot.messages.some((message) =>
            message.turnId === "turn.2" &&
            (message.text === secondUserText || message.text === secondAssistantText)),
          forkKeepsFirstTurn: forkMessages.some((message) =>
            message.turnId === "turn.1" &&
            (message.text === firstUserText || message.text === firstAssistantText)),
          forkDropsSecondTurn: !forkMessages.some((message) =>
            message.turnId === "turn.2" ||
            message.text === secondUserText ||
            message.text === secondAssistantText),
          forkKeepsThirdTurn: forkMessages.some((message) =>
            message.turnId === "turn.3" &&
            (message.text === thirdUserText || message.text === thirdAssistantText)),
          sourceMessageCount: sourceSnapshot.messages.length,
          forkMessageCount: forkMessages.length,
        };
        const rewind = {
          ok: rewindResult.ok,
          eventId: rewindEvent?.eventId,
          targetTurnId: stringValue(rewindMetadata.targetTurnId),
          removedTurnIds: stringArrayValue(rewindMetadata.removedTurnIds),
          sourceSessionId: stringValue(rewindMetadata.sourceSessionId),
          targetSessionId,
          foundationForked: booleanValue(rewindMetadata.foundationForked),
        };
        const runtimeSnapshot = {
          session: undefined,
          states: [],
          events: [],
          invocations: [],
          mainLoopSteps: [],
          procedures: [],
          approvals: [],
          errors: [],
        };
        const timelineReport = praxis.runtime.createRuntimeTimelineReport({
          sourceKind: "foundation-memory",
          snapshot: runtimeSnapshot,
          foundationSnapshot: forkSnapshot,
        });
        const timelineFork = timelineReport.sessionForks[0];
        const timelineIndex = praxis.runtime.createRuntimeTimelineIndex(timelineReport);
        const checkpointItems = praxis.runtime.queryRuntimeTimeline({
          report: timelineReport,
          query: { itemKinds: ["checkpoint"] },
        });
        const turnOneItems = praxis.runtime.queryRuntimeTimeline({
          report: timelineReport,
          query: { turnId: "turn.1" },
        });
        const sessionForkRefs = praxis.runtime.queryRuntimeTimeline({
          report: timelineReport,
          query: { ref: targetSessionId },
        });
        const replayPlan = praxis.runtime.createRuntimeTimelineReplayPlan({
          report: timelineReport,
          checkpointTurnId: "turn.1",
          targetSessionId,
        });
        const timeline = {
          status: timelineReport.coverage.hasFoundationSession &&
            timelineReport.coverage.hasCheckpoints &&
            timelineReport.coverage.hasSessionForks &&
            timelineReport.foundation.checkpointCount === forkTurnIds.length &&
            timelineReport.foundation.sessionForkCount === 1 &&
            timelineReport.checkpointTurnIds.join(",") === forkTurnIds.join(",") &&
            timelineFork?.sourceSessionId === sourceSessionId &&
            timelineFork?.targetSessionId === targetSessionId &&
            timelineFork?.checkpointTurnId === "turn.1"
            ? "ok" as const
            : "failed" as const,
          sourceKind: timelineReport.sourceKind,
          hasFoundationSession: timelineReport.coverage.hasFoundationSession,
          hasCheckpoints: timelineReport.coverage.hasCheckpoints,
          hasSessionForks: timelineReport.coverage.hasSessionForks,
          checkpointCount: timelineReport.foundation.checkpointCount,
          sessionForkCount: timelineReport.foundation.sessionForkCount,
          checkpointTurnIds: timelineReport.checkpointTurnIds,
          sourceSessionId: timelineFork?.sourceSessionId,
          targetSessionId: timelineFork?.targetSessionId,
          forkedFromTurnId: timelineFork?.checkpointTurnId,
        };
        const sessionReportResult = await transport.dispatch({
          type: "application.inspectSessionReport",
          sessionId: targetSessionId,
        });
        if (!sessionReportResult.ok) {
          throw new Error(sessionReportResult.error.message);
        }
        const applicationSessionReport = sessionReportOutput(sessionReportResult.output);
        const sessionReport = applicationSessionReport.report;
        const sessionReportSummary = {
          status: sessionReport.coverage.hasSession &&
            sessionReport.coverage.hasForkRelation &&
            sessionReport.coverage.hasCopiedConversation &&
            sessionReport.counts.turns === forkTurnIds.length &&
            sessionReport.counts.messages === forkMessages.length &&
            sessionReport.counts.copiedMessages >= 2 &&
            sessionReport.checkpointTurnIds.join(",") === forkTurnIds.join(",") &&
            sessionReport.fork.sourceSessionId === sourceSessionId &&
            sessionReport.fork.targetSessionId === targetSessionId &&
            sessionReport.fork.forkedFromTurnId === "turn.1" &&
            sessionReport.fork.forkKind === "rewind" &&
            applicationSessionReport.kind === "praxis.application.sessionReport" &&
            applicationSessionReport.publicSafe &&
            applicationSessionReport.sessionId === targetSessionId &&
            sessionReport.publicSafe &&
            sessionReport.consistency.messageTurnIdsKnown &&
            sessionReport.consistency.forkSourceRecorded
            ? "ok" as const
            : "failed" as const,
          applicationCommandKind: applicationSessionReport.kind,
          publicSafe: applicationSessionReport.publicSafe && sessionReport.publicSafe,
          applicationSessionId: applicationSessionReport.sessionId,
          sourceKind: sessionReport.sourceKind,
          hasSession: sessionReport.coverage.hasSession,
          hasForkRelation: sessionReport.coverage.hasForkRelation,
          hasCopiedConversation: sessionReport.coverage.hasCopiedConversation,
          turns: sessionReport.counts.turns,
          messages: sessionReport.counts.messages,
          copiedMessages: sessionReport.counts.copiedMessages,
          checkpointTurnIds: sessionReport.checkpointTurnIds,
          sourceSessionId: sessionReport.fork.sourceSessionId,
          targetSessionId: sessionReport.fork.targetSessionId,
          forkedFromTurnId: sessionReport.fork.forkedFromTurnId,
          forkKind: sessionReport.fork.forkKind,
          messageTurnIdsKnown: sessionReport.consistency.messageTurnIdsKnown,
          forkSourceRecorded: sessionReport.consistency.forkSourceRecorded,
        };
        const timelineQuery = {
          status: timelineIndex.totalItems === timelineReport.timelineItems.length &&
            checkpointItems.matchedItems === 2 &&
            turnOneItems.matchedItems >= 2 &&
            sessionForkRefs.matchedItems >= 1 &&
            replayPlan.status === "ready" &&
            replayPlan.mode === "read-only-plan" &&
            replayPlan.requiredPolicy.execution === "none"
            ? "ok" as const
            : "failed" as const,
          indexTotalItems: timelineIndex.totalItems,
          checkpointItems: checkpointItems.matchedItems,
          turnOneItems: turnOneItems.matchedItems,
          sessionForkRefs: sessionForkRefs.matchedItems,
          replayStatus: replayPlan.status,
          replayMode: replayPlan.mode,
          replayRequiresExecution: replayPlan.requiredPolicy.execution,
          replayItemIds: replayPlan.replayItemIds,
        };
        const afterRewind = {
          thirdProviderPromptIncludesFirstTurn: thirdProviderPrompt.includes(firstUserText) &&
            thirdProviderPrompt.includes(firstAssistantText),
          thirdProviderPromptIncludesSecondTurn: thirdProviderPrompt.includes(secondUserText) ||
            thirdProviderPrompt.includes(secondAssistantText),
          thirdProviderPromptIncludesCurrentTurn: thirdProviderPrompt.includes(thirdUserText),
        };
        const eventNames = [...new Set(events.map(eventSummary))];
        return {
          status: rewind.ok &&
            rewind.eventId === "application.rewind.completed" &&
            rewind.targetTurnId === "turn.1" &&
            rewind.removedTurnIds.length === 1 &&
            rewind.removedTurnIds[0] === "turn.2" &&
            rewind.sourceSessionId === sourceSessionId &&
            rewind.targetSessionId !== undefined &&
            rewind.targetSessionId !== sourceSessionId &&
            rewind.foundationForked &&
            thirdResult.ok &&
            view.status === "completed" &&
            view.finalOutput === thirdAssistantText &&
            view.sessionId === rewind.targetSessionId &&
            providerCalls === 3 &&
            afterRewind.thirdProviderPromptIncludesFirstTurn &&
            !afterRewind.thirdProviderPromptIncludesSecondTurn &&
            afterRewind.thirdProviderPromptIncludesCurrentTurn &&
            foundation.sourceTurnIds.join(",") === "turn.1,turn.2" &&
            foundation.forkTurnIds.join(",") === "turn.1,turn.3" &&
            foundation.sourceKeepsSecondTurn &&
            foundation.forkKeepsFirstTurn &&
            foundation.forkDropsSecondTurn &&
            foundation.forkKeepsThirdTurn &&
            timeline.status === "ok" &&
            sessionReportSummary.status === "ok" &&
            timelineQuery.status === "ok" &&
            eventNames.includes("application.rewind.completed")
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
            sessionId: view.sessionId,
          },
          rewind,
          foundation,
          timeline,
          sessionReport: sessionReportSummary,
          timelineQuery,
          afterRewind,
          events: eventNames,
        };
      } finally {
        unsubscribe();
      }
    } finally {
      await opened.runtime.release();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationFoundationRewindSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
