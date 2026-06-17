import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationSessionReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationFoundationLifecycleSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    startStatus: PraxisApplicationViewModel["status"];
    createStatus: PraxisApplicationViewModel["status"];
    renameStatus: PraxisApplicationViewModel["status"];
    closeStatus: PraxisApplicationViewModel["status"];
    resumeStatus: PraxisApplicationViewModel["status"];
    autoResumeStatus: PraxisApplicationViewModel["status"];
    autoResumeSessionId: string;
    createLocked: boolean | undefined;
    closeLocked: boolean | undefined;
  };
  foundation: {
    sessionPresent: boolean;
    startedStatus: string | undefined;
    startSource: unknown;
    sessionStatus: string | undefined;
    closedStatus: string | undefined;
    resumedStatus: string | undefined;
    sessionTitle: string | undefined;
    createdTitle: string | undefined;
    renamedTitle: string | undefined;
    externalTitle: string | undefined;
    autoResumeTitle: string | undefined;
    autoResumeStatus: string | undefined;
    lockedAfterClose: boolean | undefined;
  };
  sessionReport: {
    status: "ok" | "failed";
    applicationCommandKind: string;
    publicSafe: boolean;
    applicationSessionId: string;
    sourceKind: string;
    hasSession: boolean;
    hasProject: boolean;
    hasForkRelation: boolean;
    sessionStatus: string | undefined;
    sessionTitle: string | undefined;
    projectSessions: number;
    activeLeases: number;
    allBindingsBelongToSession: boolean;
  };
};

export type RuntimeApplicationFoundationLifecycleSmokeInput = {
  now?: () => string;
};

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationFoundationLifecycleSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationFoundationLifecycleSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationFoundationLifecycleSmoke",
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

export default ApplicationFoundationLifecycleSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-foundation-lifecycle-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationFoundationLifecycleSmokeAgent",
    application: { id: "application.foundation-lifecycle-smoke" },
    agent: { id: "agent.example.applicationFoundationLifecycleSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
  await mkdir(path.join(root, ".rax_workspace"), { recursive: true });
}

function addMilliseconds(iso: string, milliseconds: number): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? new Date(parsed + milliseconds).toISOString()
    : new Date(Date.now() + milliseconds).toISOString();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function sessionReportOutput(value: unknown): PraxisApplicationSessionReportOutput {
  if (record(value).kind !== "praxis.application.sessionReport") {
    throw new Error("application.inspectSessionReport did not return a session report output.");
  }
  return value as PraxisApplicationSessionReportOutput;
}

export async function runApplicationFoundationLifecycleSmoke(
  input: RuntimeApplicationFoundationLifecycleSmokeInput = {},
): Promise<RuntimeApplicationFoundationLifecycleSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-foundation-lifecycle-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const opened = await praxis.runtime.project.open({
      cwd: projectRoot,
      ownerId: "application-foundation-lifecycle-smoke",
      runtimeId: "runtime.application.foundationLifecycleSmoke",
      persistence: "memory",
      acquireLock: true,
      now,
    });
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    try {
      const sessionId = "session.application.foundation-lifecycle-smoke";
      const created = await createApplicationProjectRuntime(projectRoot, {
        now,
        mode: "dry-run",
        sessionId,
        foundationProject: opened.runtime,
      });
      if (!created.ok) {
        throw new Error(created.error.message);
      }

      const transport = createLocalApplicationTransport(created.runtime);
      const sessionManager = praxis.runtime.session.createPraxisSessionManager(opened.runtime);
      const startResult = await transport.dispatch({
        type: "application.start",
        sessionId,
      });
      const startedSnapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      const createResult = await transport.dispatch({
        type: "application.createSession",
        sessionId,
        name: "Foundation lifecycle smoke",
      });
      const createdSnapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      const renameResult = await transport.dispatch({
        type: "application.renameSession",
        sessionId,
        name: "Foundation lifecycle smoke renamed",
      });
      const renamedSnapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      await sessionManager.rename(
        sessionId,
        "Foundation lifecycle smoke external",
        now(),
      );
      const closeResult = await transport.dispatch({
        type: "application.close",
        sessionId,
      });
      const closedSnapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      const resumeResult = await transport.dispatch({
        type: "application.resume",
        sessionId,
      });
      const autoSessionId = "session.application.foundation-lifecycle-smoke.auto";
      await sessionManager.create({
        sessionId: autoSessionId,
        title: "Foundation lifecycle smoke auto",
        now: addMilliseconds(startedAt, 1000),
      });
      const autoResumeResult = await transport.dispatch({
        type: "application.resume",
      });
      const autoSnapshot = await opened.runtime.store.readSessionSnapshot(autoSessionId);
      const snapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      const sessionReportResult = await transport.dispatch({
        type: "application.inspectSessionReport",
        sessionId,
      });
      if (!sessionReportResult.ok) {
        throw new Error(sessionReportResult.error.message);
      }
      const applicationSessionReport = sessionReportOutput(sessionReportResult.output);
      const sessionReport = applicationSessionReport.report;
      const foundation = {
        sessionPresent: snapshot.session !== undefined,
        startedStatus: startedSnapshot.session?.status,
        startSource: startedSnapshot.session?.metadata.source,
        sessionStatus: snapshot.session?.status,
        closedStatus: closedSnapshot.session?.status,
        resumedStatus: snapshot.session?.status,
        sessionTitle: snapshot.session?.title,
        createdTitle: createdSnapshot.session?.title,
        renamedTitle: renamedSnapshot.session?.title,
        externalTitle: snapshot.session?.title,
        autoResumeTitle: autoSnapshot.session?.title,
        autoResumeStatus: autoSnapshot.session?.status,
        lockedAfterClose: created.runtime.getView().foundationProject?.locked,
      };
      const sessionReportSummary = {
        status: sessionReport.coverage.hasSession &&
          sessionReport.coverage.hasProject &&
          !sessionReport.coverage.hasForkRelation &&
          sessionReport.session.status === "idle" &&
          sessionReport.session.title === "Foundation lifecycle smoke external" &&
          sessionReport.counts.projectSessions >= 2 &&
          sessionReport.counts.activeLeases === 0 &&
          applicationSessionReport.kind === "praxis.application.sessionReport" &&
          applicationSessionReport.publicSafe &&
          applicationSessionReport.sessionId === sessionId &&
          sessionReport.publicSafe &&
          sessionReport.consistency.allBindingsBelongToSession
          ? "ok" as const
          : "failed" as const,
        applicationCommandKind: applicationSessionReport.kind,
        publicSafe: applicationSessionReport.publicSafe && sessionReport.publicSafe,
        applicationSessionId: applicationSessionReport.sessionId,
        sourceKind: sessionReport.sourceKind,
        hasSession: sessionReport.coverage.hasSession,
        hasProject: sessionReport.coverage.hasProject,
        hasForkRelation: sessionReport.coverage.hasForkRelation,
        sessionStatus: sessionReport.session.status,
        sessionTitle: sessionReport.session.title,
        projectSessions: sessionReport.counts.projectSessions,
        activeLeases: sessionReport.counts.activeLeases,
        allBindingsBelongToSession: sessionReport.consistency.allBindingsBelongToSession,
      };
      const resumedApplicationTitle = resumeResult.view.sessions.find((session) => session.sessionId === sessionId)?.name;
      const autoResumedApplicationTitle = autoResumeResult.view.sessions.find((session) =>
        session.sessionId === autoSessionId
      )?.name;
      return {
        status: startResult.ok &&
          createResult.ok &&
          renameResult.ok &&
          closeResult.ok &&
          resumeResult.ok &&
          autoResumeResult.ok &&
          startResult.view.status === "ready" &&
          createResult.view.status === "ready" &&
          renameResult.view.sessions.find((session) => session.sessionId === sessionId)?.name === "Foundation lifecycle smoke renamed" &&
          createResult.view.foundationProject?.locked === true &&
          closeResult.view.status === "closed" &&
          resumeResult.view.status === "ready" &&
          autoResumeResult.view.status === "ready" &&
          autoResumeResult.view.sessionId === autoSessionId &&
          closeResult.view.foundationProject?.locked === false &&
          foundation.sessionPresent &&
          foundation.startedStatus === "idle" &&
          foundation.startSource === "application.start" &&
          foundation.closedStatus === "closed" &&
          foundation.resumedStatus === "idle" &&
          foundation.sessionStatus === "idle" &&
          foundation.autoResumeStatus === "idle" &&
          foundation.createdTitle === "Foundation lifecycle smoke" &&
          foundation.renamedTitle === "Foundation lifecycle smoke renamed" &&
          foundation.externalTitle === "Foundation lifecycle smoke external" &&
          foundation.sessionTitle === "Foundation lifecycle smoke external" &&
          foundation.autoResumeTitle === "Foundation lifecycle smoke auto" &&
          resumedApplicationTitle === "Foundation lifecycle smoke external" &&
          autoResumedApplicationTitle === "Foundation lifecycle smoke auto" &&
          foundation.lockedAfterClose === false &&
          sessionReportSummary.status === "ok"
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          startStatus: startResult.view.status,
          createStatus: createResult.view.status,
          renameStatus: renameResult.view.status,
          closeStatus: closeResult.view.status,
          resumeStatus: resumeResult.view.status,
          autoResumeStatus: autoResumeResult.view.status,
          autoResumeSessionId: autoResumeResult.view.sessionId,
          createLocked: createResult.view.foundationProject?.locked,
          closeLocked: closeResult.view.foundationProject?.locked,
        },
        foundation,
        sessionReport: sessionReportSummary,
      };
    } finally {
      await opened.runtime.release();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationFoundationLifecycleSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
