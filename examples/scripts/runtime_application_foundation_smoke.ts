import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationFoundationSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
    foundationProjectLocked: boolean | undefined;
    startedBeforeSubmit: boolean;
  };
  foundation: {
    sessionPresent: boolean;
    sessionSource: unknown;
    turnCount: number;
    messageCount: number;
    summaryCount: number;
    firstTurnId: string | undefined;
    checkpoint: boolean | undefined;
    includesUserMessage: boolean;
    includesAssistantMessage: boolean;
    runtimeSummaryMessages: number;
  };
};

export type RuntimeApplicationFoundationSmokeInput = {
  now?: () => string;
};

const userText = "Persist this application turn through foundation conversation plane.";
const assistantText = "application foundation smoke completed";

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-foundation-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-foundation-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application foundation smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-foundation-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-foundation-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationFoundationSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationFoundationSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationFoundationSmoke",
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

export default ApplicationFoundationSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-foundation-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationFoundationSmokeAgent",
    application: { id: "application.foundation-smoke" },
    agent: { id: "agent.example.applicationFoundationSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

export async function runApplicationFoundationSmoke(
  input: RuntimeApplicationFoundationSmokeInput = {},
): Promise<RuntimeApplicationFoundationSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-foundation-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const opened = await praxis.runtime.project.open({
      cwd: projectRoot,
      ownerId: "application-foundation-smoke",
      runtimeId: "runtime.application.foundationSmoke",
      persistence: "memory",
      acquireLock: false,
      now,
    });
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    try {
      let providerCalls = 0;
      const sessionId = "session.application.foundation-smoke";
      const created = await createApplicationProjectRuntime(projectRoot, {
        now,
        mode: "live",
        permissionProfile: "yolo",
        toolProfile: "codingCore",
        sessionId,
        foundationProject: opened.runtime,
        liveProviderResolver: async () => ({
          auth: authEnvelope(),
          providerCaller: async () => {
            providerCalls += 1;
            return { output_text: assistantText };
          },
        }),
      });
      if (!created.ok) {
        throw new Error(created.error.message);
      }

      const transport = createLocalApplicationTransport(created.runtime);
      const result = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        sessionId,
        input: {
          type: "application.input",
          text: userText,
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const snapshot = await opened.runtime.store.readSessionSnapshot(sessionId);
      const foundation = {
        sessionPresent: snapshot.session !== undefined,
        sessionSource: snapshot.session?.metadata.source,
        turnCount: snapshot.turns.length,
        messageCount: snapshot.messages.length,
        summaryCount: snapshot.summaries.length,
        firstTurnId: snapshot.turns[0]?.turnId,
        checkpoint: snapshot.turns[0]?.checkpoint,
        includesUserMessage: snapshot.messages.some((message) =>
          message.turnId === "turn.1" && message.role === "user" && message.text === userText),
        includesAssistantMessage: snapshot.messages.some((message) =>
          message.turnId === "turn.1" && message.role === "assistant" && message.text === assistantText),
        runtimeSummaryMessages: snapshot.messages.filter((message) => message.role === "runtime-summary").length,
      };
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === assistantText &&
          view.counters.turns === 1 &&
          providerCalls === 1 &&
          view.foundationProject?.locked === false &&
          foundation.sessionPresent &&
          foundation.sessionSource === "application.submitTurn" &&
          foundation.turnCount === 1 &&
          foundation.messageCount >= 2 &&
          foundation.firstTurnId === "turn.1" &&
          foundation.checkpoint === true &&
          foundation.includesUserMessage &&
          foundation.includesAssistantMessage
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
          foundationProjectLocked: view.foundationProject?.locked,
          startedBeforeSubmit: false,
        },
        foundation,
      };
    } finally {
      await opened.runtime.release();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationFoundationSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
