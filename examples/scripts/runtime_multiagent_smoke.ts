import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseToolRegistry,
  type BaseToolExecutorPort,
  type BaseToolInvokeResult,
  type BaseToolRegistry,
} from "../../src/basetool/index.js";
import {
  createInMemoryMultiagentRuntime,
  createRuntimeMultiagentIndex,
  createRuntimeMultiagentReport,
  queryRuntimeMultiagent,
  type MultiagentAgentSession,
  type MultiagentMessage,
  type MultiagentRuntime,
  type RuntimeMultiagentReport,
} from "../../src/runtimeImplementation/runtime.multiagentPlane/index.js";
import {
  createMultiagentRuntimeBridge,
} from "../../src/runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.js";

type SmokeStatus = "ok" | "failed";

export type RuntimeMultiagentSmokeResult = {
  status: SmokeStatus;
  officialBridge: {
    ok: boolean;
    topology?: string;
    runtimeMediatedAccess: readonly string[];
    unsafeSideEffects?: boolean;
    events: readonly string[];
  };
  baseTools: {
    mountedToolIds: readonly string[];
    invokedToolIds: readonly string[];
    runtimePortUsed: boolean;
  };
  mesh: {
    projectLocal: boolean;
    rootSessionId: string;
    childSessionId: string;
    initialMessage: {
      messageId: string;
      fromSessionId: string;
      toSessionId: string;
    };
    childInboxBeforeReply: number;
    waitReplyText: string;
    rootInboxUnreadAfterWait: number;
    listedSessionCount: number;
    inspectStatus: string | undefined;
    stoppedStatus: string | undefined;
    killedStatus: string | undefined;
    publicSafeSession: boolean;
  };
  guards: {
    workspaceEscapeRejected: boolean;
  };
  multiagentReport: {
    kind: RuntimeMultiagentReport["kind"];
    status: RuntimeMultiagentReport["status"];
    sourceKind: RuntimeMultiagentReport["sourceKind"];
    childSessionId: string | undefined;
    coverage: RuntimeMultiagentReport["coverage"];
    index: {
      totalSessions: number;
      childSessionIds: readonly string[];
      byToolId: Readonly<Record<string, number>>;
    };
    query: {
      returnedSessions: number;
      returnedMessages: number;
    };
    publicSafe: true;
  };
};

const REQUIRED_REGISTRY_TOOLS = [
  "agent.spawn",
  "agent.message",
  "agent.inbox",
  "agent.list",
  "agent.inspect",
  "agent.wait",
  "agent.stop",
  "agent.kill",
] as const;

function executorFor(runtime: MultiagentRuntime): BaseToolExecutorPort {
  return {
    agent: {
      spawn: async (request: unknown) => ({ ok: true, output: await runtime.spawn(request as never) }),
      message: async (request: unknown) => ({ ok: true, output: await runtime.message(request as never) }),
      inbox: async (request: unknown) => ({ ok: true, output: await runtime.inbox(request as never) }),
      list: async (request: unknown) => ({ ok: true, output: await runtime.list(request as never) }),
      inspect: async (request: unknown) => ({ ok: true, output: await runtime.inspect(request as never) }),
      wait: async (request: unknown) => ({ ok: true, output: await runtime.wait(request as never) }),
      stop: async (request: unknown) => ({ ok: true, output: await runtime.stop(request as never) }),
      kill: async (request: unknown) => ({ ok: true, output: await runtime.kill(request as never) }),
    },
  } as unknown as BaseToolExecutorPort;
}

function assertOk<T extends BaseToolInvokeResult>(
  result: T,
  toolId: string,
): T {
  if (!result.ok) {
    throw new Error(`${toolId} failed: ${result.error?.code ?? "UNKNOWN_ERROR"}`);
  }
  return result;
}

function handler(registry: BaseToolRegistry, toolId: string) {
  const lookup = registry.lookupHandler(toolId);
  if (!lookup.ok) {
    throw new Error(`${toolId} is not mounted in the baseTool registry`);
  }
  return lookup.handler;
}

function isPublicSafeSession(session: MultiagentAgentSession | undefined): boolean {
  if (session === undefined) return false;
  const record = session as unknown as Record<string, unknown>;
  if (record.appendPrompt !== undefined) return false;
  return session.metadata.secret === undefined && session.metadata.appendPromptPresent === undefined;
}

function bridgeRuntimeMediatedAccess(): RuntimeMultiagentSmokeResult["officialBridge"] {
  const bridge = createMultiagentRuntimeBridge({
    runtimeId: "runtime.multiagent-smoke",
    moduleId: "module.multiagent-smoke",
    requesterSessionId: "session.root",
    runtimeReady: true,
  });
  if (!bridge.ok) {
    return {
      ok: false,
      runtimeMediatedAccess: [],
      events: bridge.events,
    };
  }
  const plan = bridge.plan;
  const access = [
    plan.spawnAccess === "runtime-mediated" ? "spawn" : undefined,
    plan.messageAccess === "runtime-mediated" ? "message" : undefined,
    plan.inboxAccess === "runtime-mediated" ? "inbox" : undefined,
    plan.waitAccess === "runtime-mediated" ? "wait" : undefined,
    plan.stopAccess === "runtime-mediated" ? "stop" : undefined,
    plan.killAccess === "runtime-mediated" ? "kill" : undefined,
    plan.listAccess === "runtime-mediated" ? "list" : undefined,
    plan.inspectAccess === "runtime-mediated" ? "inspect" : undefined,
  ].filter((value): value is string => value !== undefined);
  return {
    ok: true,
    topology: plan.topology,
    runtimeMediatedAccess: access,
    unsafeSideEffects: plan.unsafeSideEffects,
    events: bridge.events,
  };
}

export async function runRuntimeMultiagentSmoke(): Promise<RuntimeMultiagentSmokeResult> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-multiagent-smoke-"));
  try {
    const officialBridge = bridgeRuntimeMediatedAccess();
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.multiagent-smoke",
      workspaceRoot,
      initialSessions: [{
        sessionId: "session.root",
        agentId: "agent.root",
        workingDirectory: workspaceRoot,
        status: "idle",
      }],
    });
    const executor = executorFor(runtime);
    const registry = createBaseToolRegistry({ profileName: "agentCore" });
    const mountedToolIds = REQUIRED_REGISTRY_TOOLS.filter((toolId) => registry.lookupHandler(toolId).ok);
    const invokedToolIds: string[] = [];

    const spawn = assertOk(await handler(registry, "agent.spawn").invoke({
      runtime: { sessionId: "session.root" },
      executor,
      input: {
        name: "docs",
        task: "Read the runtime multiagent smoke task.",
        lifecycle: "persistent",
        appendPrompt: "private prompt that must not be exposed by public session reads",
        metadata: { secret: "private metadata that must not be exposed by public session reads" },
      },
    }), "agent.spawn");
    invokedToolIds.push("agent.spawn");
    const spawnOutput = spawn.output as { session: MultiagentAgentSession; initialMessage: MultiagentMessage };
    const childSessionId = spawnOutput.session.sessionId;

    const inbox = assertOk(await handler(registry, "agent.inbox").invoke({
      runtime: { sessionId: childSessionId },
      executor,
      input: { unreadOnly: true },
    }), "agent.inbox");
    invokedToolIds.push("agent.inbox");
    const childInbox = inbox.output as readonly MultiagentMessage[];

    const message = assertOk(await handler(registry, "agent.message").invoke({
      runtime: { sessionId: "session.root" },
      executor,
      input: {
        toSessionId: childSessionId,
        text: "Please acknowledge the runtime-mediated mesh.",
      },
    }), "agent.message");
    invokedToolIds.push("agent.message");
    const messageOutput = message.output as MultiagentMessage;
    const followupInbox = assertOk(await handler(registry, "agent.inbox").invoke({
      runtime: { sessionId: childSessionId },
      executor,
      input: { unreadOnly: true },
    }), "agent.inbox");
    const childFollowupInbox = followupInbox.output as readonly MultiagentMessage[];

    await runtime.message({
      fromSessionId: childSessionId,
      toSessionId: "session.root",
      text: "Docs agent acknowledged runtime-mediated mesh.",
      replyToMessageId: messageOutput.messageId,
    });

    const wait = assertOk(await handler(registry, "agent.wait").invoke({
      runtime: { sessionId: "session.root" },
      executor,
      input: { messageId: messageOutput.messageId },
    }), "agent.wait");
    invokedToolIds.push("agent.wait");
    const waitOutput = wait.output as { message: MultiagentMessage };

    const list = assertOk(await handler(registry, "agent.list").invoke({
      executor,
      input: {},
    }), "agent.list");
    invokedToolIds.push("agent.list");
    const listed = list.output as readonly MultiagentAgentSession[];

    const inspect = assertOk(await handler(registry, "agent.inspect").invoke({
      executor,
      input: { sessionId: childSessionId },
    }), "agent.inspect");
    invokedToolIds.push("agent.inspect");
    const inspected = inspect.output as { session?: MultiagentAgentSession; pendingMessages: number };

    const stop = assertOk(await handler(registry, "agent.stop").invoke({
      executor,
      input: { sessionId: childSessionId, reason: "multiagent smoke stop check" },
    }), "agent.stop");
    invokedToolIds.push("agent.stop");
    const stopped = stop.output as MultiagentAgentSession;

    const kill = assertOk(await handler(registry, "agent.kill").invoke({
      executor,
      input: { sessionId: childSessionId, reason: "multiagent smoke kill check" },
    }), "agent.kill");
    invokedToolIds.push("agent.kill");
    const killed = kill.output as MultiagentAgentSession;

    let workspaceEscapeRejected = false;
    try {
      await runtime.ensureSession({
        sessionId: "session.escape",
        agentId: "agent.escape",
        workingDirectory: path.dirname(workspaceRoot),
      });
    } catch {
      workspaceEscapeRejected = true;
    }

    const rootUnread = await runtime.inbox({ sessionId: "session.root", unreadOnly: true });
    const projectLocal = listed.every((session) => session.projectId === "project.multiagent-smoke");
    const runtimePortUsed = invokedToolIds.every((toolId) => {
      const definition = registry.lookupHandler(toolId);
      return definition.ok && definition.definition.runtimePorts.length > 0;
    });
    const invariants = [
      officialBridge.ok,
      officialBridge.topology === "project-session-mesh",
      officialBridge.unsafeSideEffects === false,
      mountedToolIds.length === REQUIRED_REGISTRY_TOOLS.length,
      runtimePortUsed,
      projectLocal,
      childInbox.length === 1,
      childFollowupInbox.length === 1,
      waitOutput.message.text === "Docs agent acknowledged runtime-mediated mesh.",
      rootUnread.length === 1,
      listed.length === 2,
      inspected.session?.status === "running",
      stopped.status === "stopped",
      killed.status === "killed",
      isPublicSafeSession(inspected.session),
      workspaceEscapeRejected,
    ];

    const smokeFacts = {
      status: invariants.every(Boolean) ? "ok" as const : "failed" as const,
      officialBridge,
      baseTools: {
        mountedToolIds,
        invokedToolIds,
        runtimePortUsed,
      },
      mesh: {
        projectLocal,
        rootSessionId: "session.root",
        childSessionId,
        initialMessage: {
          messageId: spawnOutput.initialMessage.messageId,
          fromSessionId: spawnOutput.initialMessage.fromSessionId,
          toSessionId: spawnOutput.initialMessage.toSessionId,
        },
        childInboxBeforeReply: childInbox.length + childFollowupInbox.length,
        waitReplyText: waitOutput.message.text,
        rootInboxUnreadAfterWait: rootUnread.length,
        listedSessionCount: listed.length,
        inspectStatus: inspected.session?.status,
        stoppedStatus: stopped.status,
        killedStatus: killed.status,
        publicSafeSession: isPublicSafeSession(inspected.session),
      },
      guards: {
        workspaceEscapeRejected,
      },
    };
    const multiagentReport = createRuntimeMultiagentReport({
      sourceKind: "runtime-smoke",
      smoke: smokeFacts,
    });
    const multiagentIndex = createRuntimeMultiagentIndex(multiagentReport);
    const childQuery = queryRuntimeMultiagent({
      report: multiagentReport,
      query: { sessionId: childSessionId },
    });

    return {
      status: invariants.every(Boolean) ? "ok" : "failed",
      officialBridge: smokeFacts.officialBridge,
      baseTools: smokeFacts.baseTools,
      mesh: smokeFacts.mesh,
      guards: smokeFacts.guards,
      multiagentReport: {
        kind: multiagentReport.kind,
        status: multiagentReport.status,
        sourceKind: multiagentReport.sourceKind,
        childSessionId: multiagentReport.session.childSessionId,
        coverage: multiagentReport.coverage,
        index: {
          totalSessions: multiagentIndex.totalSessions,
          childSessionIds: multiagentIndex.childSessionIds,
          byToolId: multiagentIndex.byToolId,
        },
        query: {
          returnedSessions: childQuery.returnedSessions,
          returnedMessages: childQuery.returnedMessages,
        },
        publicSafe: multiagentReport.publicSafe,
      },
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const result = await runRuntimeMultiagentSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
