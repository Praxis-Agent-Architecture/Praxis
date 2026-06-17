import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommandResult,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationRewindSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  rewind: {
    ok: boolean;
    eventId: string | undefined;
    targetTurnId: string | undefined;
    removedTurnIds: readonly string[];
    historyMessagesBefore: number | undefined;
    historyMessagesAfter: number | undefined;
  };
  afterRewind: {
    thirdProviderPromptIncludesFirstTurn: boolean;
    thirdProviderPromptIncludesSecondTurn: boolean;
    thirdProviderPromptIncludesCurrentTurn: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationRewindSmokeInput = {
  now?: () => string;
};

const firstUserText = "application rewind smoke unique first user request";
const firstAssistantText = "application rewind smoke unique first answer";
const secondUserText = "application rewind smoke unique second user request";
const secondAssistantText = "application rewind smoke unique second answer";
const thirdUserText = "application rewind smoke unique third user request";
const thirdAssistantText = "application rewind smoke final";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-rewind-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-rewind-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application rewind smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-rewind-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-rewind-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationRewindSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationRewindSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationRewindSmoke",
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

export default ApplicationRewindSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-rewind-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationRewindSmokeAgent",
    application: { id: "application.rewind-smoke" },
    agent: { id: "agent.example.applicationRewindSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "runtime") return event.kind;
  return event.eventId;
}

async function submitText(input: {
  transport: ReturnType<typeof createLocalApplicationTransport>;
  text: string;
  cwd: string;
}): Promise<PraxisApplicationCommandResult> {
  return await input.transport.dispatch({
    type: "application.submitTurn",
    mode: "live",
    input: {
      type: "application.input",
      text: input.text,
      cwd: input.cwd,
    },
  });
}

export async function runApplicationRewindSmoke(
  input: RuntimeApplicationRewindSmokeInput = {},
): Promise<RuntimeApplicationRewindSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-rewind-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "codingCore",
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
      });
      await submitText({ transport, text: firstUserText, cwd: projectRoot });
      await submitText({ transport, text: secondUserText, cwd: projectRoot });
      const rewindResult = await transport.dispatch({
        type: "application.rewind",
        turnId: "turn.1",
      });
      const thirdResult = await submitText({ transport, text: thirdUserText, cwd: projectRoot });
      const view = thirdResult.view;
      const rewindEvent = rewindResult.events[0];
      const rewindMetadata = record(rewindEvent?.metadata);
      const thirdProviderPrompt = JSON.stringify(providerBodies[2]);
      const rewind = {
        ok: rewindResult.ok,
        eventId: rewindEvent?.eventId,
        targetTurnId: stringValue(rewindMetadata.targetTurnId),
        removedTurnIds: stringArrayValue(rewindMetadata.removedTurnIds),
        historyMessagesBefore: numberValue(rewindMetadata.historyMessagesBefore),
        historyMessagesAfter: numberValue(rewindMetadata.historyMessagesAfter),
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
          rewind.historyMessagesBefore === 6 &&
          rewind.historyMessagesAfter === 3 &&
          thirdResult.ok &&
          view.status === "completed" &&
          view.finalOutput === thirdAssistantText &&
          view.counters.turns === 3 &&
          providerCalls === 3 &&
          afterRewind.thirdProviderPromptIncludesFirstTurn &&
          !afterRewind.thirdProviderPromptIncludesSecondTurn &&
          afterRewind.thirdProviderPromptIncludesCurrentTurn &&
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
        },
        rewind,
        afterRewind,
        events: eventNames,
      };
    } finally {
      unsubscribe();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationRewindSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
