/*
 * 文件定位：Runtime implementation / multiagent mesh plane.
 * 核心目的：提供第一版可测的 project 内 agent-session mesh 运行时。
 */

import { randomUUID } from "node:crypto";
import path from "node:path";

import type { PraxisProjectRuntime } from "../runtime.projectPlane/projectRuntime.js";
import type {
  MultiagentAgentSession,
  MultiagentInboxInput,
  MultiagentInspectInput,
  MultiagentKillInput,
  MultiagentListInput,
  MultiagentMessage,
  MultiagentMessageInput,
  MultiagentMessagePart,
  MultiagentRuntime,
  MultiagentSessionStatus,
  MultiagentSpawnInput,
  MultiagentSpawnResult,
  MultiagentStopInput,
  MultiagentWaitInput,
  MultiagentWaitResult,
} from "./multiagentTypes.js";

type Waiter = {
  requesterSessionId: string;
  resolve: (result: MultiagentWaitResult) => void;
  reject: (error: Error) => void;
};

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

function safeSegment(input: string): string {
  return input.trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "agent";
}

function sessionId(projectId: string): string {
  return `agent-session.${safeSegment(projectId)}.${Date.now()}.${randomUUID().slice(0, 8)}`;
}

function agentId(projectId: string): string {
  return `agent.${safeSegment(projectId)}.${randomUUID().slice(0, 8)}`;
}

function messageId(): string {
  return `agent-message.${Date.now()}.${randomUUID().slice(0, 8)}`;
}

function textPart(text: string): readonly MultiagentMessagePart[] {
  return [{ type: "text", text }];
}

function isStringRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function isMessagePart(input: unknown): input is MultiagentMessagePart {
  if (!isStringRecord(input) || typeof input.type !== "string") return false;
  if (input.type === "text") return typeof input.text === "string";
  if (input.type === "json") return "value" in input;
  if (input.type === "artifact_ref") return typeof input.artifactId === "string";
  if (input.type === "file_ref") return typeof input.path === "string";
  if (input.type === "tool_result_ref") return typeof input.toolCallId === "string";
  if (input.type === "task_request") return typeof input.task === "string";
  if (input.type === "status_event") {
    return typeof input.status === "string" && (input.detail === undefined || typeof input.detail === "string");
  }
  return false;
}

function partsText(parts: readonly MultiagentMessagePart[]): string {
  return parts.map((part) => {
    if (part.type === "text") return part.text;
    if (part.type === "task_request") return part.task;
    if (part.type === "status_event") return [part.status, part.detail].filter(Boolean).join(": ");
    if (part.type === "artifact_ref") return `[artifact:${part.artifactId}]`;
    if (part.type === "file_ref") return `[file:${part.path}]`;
    if (part.type === "tool_result_ref") return `[tool-result:${part.toolCallId}]`;
    return "[json]";
  }).join("\n").trim();
}

function partHasPayload(part: MultiagentMessagePart): boolean {
  if (part.type === "text") return part.text.trim().length > 0;
  if (part.type === "task_request") return part.task.trim().length > 0;
  if (part.type === "status_event") return part.status.trim().length > 0 || (part.detail?.trim().length ?? 0) > 0;
  if (part.type === "artifact_ref") return part.artifactId.trim().length > 0;
  if (part.type === "file_ref") return part.path.trim().length > 0;
  if (part.type === "tool_result_ref") return part.toolCallId.trim().length > 0;
  return true;
}

function isInactive(status: MultiagentSessionStatus): boolean {
  return status === "stopped" || status === "killed" || status === "archived";
}

function safeSession(session: MultiagentAgentSession): MultiagentAgentSession {
  const { appendPrompt: _appendPrompt, ...publicSession } = session;
  return {
    ...publicSession,
    metadata: {
      lifecycle: session.metadata.lifecycle,
      agentDefinitionId: session.metadata.agentDefinitionId,
      createdBySessionId: session.metadata.createdBySessionId,
    },
  };
}

function safeMessage(message: MultiagentMessage): MultiagentMessage {
  return {
    ...message,
    metadata: Object.fromEntries(Object.entries({
      delivery: message.metadata.delivery,
      initialTask: message.metadata.initialTask,
    }).filter(([, value]) => value !== undefined)),
  };
}

function ensureInsideWorkspace(root: string, workingDirectory: string): string {
  const resolved = path.resolve(workingDirectory);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return resolved;
  throw new Error("workingDirectory must stay inside the project workspace root");
}

export function createInMemoryMultiagentRuntime(input: {
  projectId: string;
  workspaceRoot: string;
  defaultModel?: string;
  initialSessions?: readonly Partial<MultiagentAgentSession>[];
}): MultiagentRuntime {
  const sessions = new Map<string, MultiagentAgentSession>();
  const messages = new Map<string, MultiagentMessage>();
  const waiters = new Map<string, Waiter[]>();
  const workspaceRoot = path.resolve(input.workspaceRoot);
  for (const initial of input.initialSessions ?? []) {
    const createdAt = initial.createdAt ?? new Date(0).toISOString();
    const id = initial.sessionId ?? sessionId(input.projectId);
    sessions.set(id, {
      sessionId: id,
      projectId: input.projectId,
      agentId: initial.agentId ?? agentId(input.projectId),
      name: initial.name,
      description: initial.description,
      workingDirectory: ensureInsideWorkspace(workspaceRoot, initial.workingDirectory ?? workspaceRoot),
      lifecycle: initial.lifecycle ?? "persistent",
      status: initial.status ?? "idle",
      createdAt,
      updatedAt: initial.updatedAt ?? createdAt,
      createdBySessionId: initial.createdBySessionId,
      derivedFromSessionId: initial.derivedFromSessionId,
      appendPrompt: initial.appendPrompt,
      model: initial.model ?? input.defaultModel,
      metadata: initial.metadata ?? {},
    });
  }

  function readSession(requiredSessionId: string): MultiagentAgentSession {
    const session = sessions.get(requiredSessionId);
    if (session === undefined) throw new Error(`agent session was not found: ${requiredSessionId}`);
    return session;
  }

  function updateSession(session: MultiagentAgentSession): MultiagentAgentSession {
    sessions.set(session.sessionId, session);
    return session;
  }

  function revive(session: MultiagentAgentSession, now: string): MultiagentAgentSession {
    if (!isInactive(session.status)) return session;
    return updateSession({ ...session, status: "idle", updatedAt: now });
  }

  function finishWaiters(reply: MultiagentMessage): void {
    if (reply.replyToMessageId === undefined) return;
    const pending = waiters.get(reply.replyToMessageId);
    if (pending === undefined) return;
    waiters.delete(reply.replyToMessageId);
    for (const waiter of pending) {
      if (waiter.requesterSessionId === reply.toSessionId) waiter.resolve({ message: safeMessage(reply) });
    }
  }

  async function sendMessage(messageInput: MultiagentMessageInput): Promise<MultiagentMessage> {
    const createdAt = nowIso(messageInput.now);
    const from = readSession(messageInput.fromSessionId);
    let to = readSession(messageInput.toSessionId);
    if (from.projectId !== to.projectId || from.projectId !== input.projectId) {
      throw new Error("agent.message is limited to the current project mesh");
    }
    to = revive(to, createdAt);
    const hasExplicitParts = messageInput.parts !== undefined;
    const parts = hasExplicitParts ? messageInput.parts ?? [] : textPart(messageInput.text ?? "");
    if (!parts.every(isMessagePart)) {
      throw new Error("agent.message parts must use known multiagent message part shapes");
    }
    const text = messageInput.text ?? partsText(parts);
    if (text.trim().length === 0 && (!hasExplicitParts || !parts.some(partHasPayload))) {
      throw new Error("agent.message requires text or message parts");
    }
    let completedOriginal: MultiagentMessage | undefined;
    if (messageInput.replyToMessageId !== undefined) {
      const original = messages.get(messageInput.replyToMessageId);
      if (original === undefined) {
        throw new Error(`reply target message was not found: ${messageInput.replyToMessageId}`);
      }
      if (original.fromSessionId !== to.sessionId || original.toSessionId !== from.sessionId) {
        throw new Error("agent.message replyToMessageId must target a message between the same two sessions");
      }
      completedOriginal = {
        ...original,
        status: "completed",
        completedAt: createdAt,
      };
      messages.set(original.messageId, completedOriginal);
    }
    const message: MultiagentMessage = {
      messageId: messageId(),
      projectId: input.projectId,
      fromSessionId: from.sessionId,
      toSessionId: to.sessionId,
      intent: messageInput.intent ?? "queue",
      status: "queued",
      parts,
      text,
      replyToMessageId: messageInput.replyToMessageId,
      completesMessageId: completedOriginal?.messageId,
      createdAt,
      metadata: {
        ...(messageInput.metadata ?? {}),
        delivery: to.status === "running" ? "queuedUntilCurrentRunCompletes" : "triggerRun",
      },
    };
    messages.set(message.messageId, message);
    updateSession({ ...to, status: "running", updatedAt: createdAt });
    finishWaiters(message);
    if (
      completedOriginal !== undefined
      && completedOriginal.toSessionId === from.sessionId
      && from.lifecycle === "oneshot"
    ) {
      updateSession({
        ...from,
        status: "archived",
        updatedAt: createdAt,
        metadata: {
          ...from.metadata,
          completedOneshotMessageId: completedOriginal.messageId,
          archivedByReplyMessageId: message.messageId,
        },
      });
    }
    return safeMessage(message);
  }

  return {
    async spawn(spawnInput: MultiagentSpawnInput): Promise<MultiagentSpawnResult> {
      const createdAt = nowIso(spawnInput.now);
      const requester = readSession(spawnInput.requesterSessionId);
      if (spawnInput.task.trim().length === 0) {
        throw new Error("agent.spawn requires a non-empty task");
      }
      const targetWorkingDirectory = ensureInsideWorkspace(
        workspaceRoot,
        spawnInput.workingDirectory ?? requester.workingDirectory,
      );
      const session: MultiagentAgentSession = {
        sessionId: sessionId(input.projectId),
        projectId: input.projectId,
        agentId: agentId(input.projectId),
        name: spawnInput.name,
        description: spawnInput.description,
        workingDirectory: targetWorkingDirectory,
        lifecycle: spawnInput.lifecycle ?? "persistent",
        status: "idle",
        createdAt,
        updatedAt: createdAt,
        createdBySessionId: spawnInput.requesterSessionId,
        derivedFromSessionId: spawnInput.agentDefinitionId === undefined ? spawnInput.requesterSessionId : undefined,
        appendPrompt: spawnInput.appendPrompt,
        model: spawnInput.model ?? requester.model ?? input.defaultModel,
        metadata: {
          ...(spawnInput.metadata ?? {}),
          lifecycle: spawnInput.lifecycle ?? "persistent",
          agentDefinitionId: spawnInput.agentDefinitionId,
          createdBySessionId: spawnInput.requesterSessionId,
          appendPromptPresent: Boolean(spawnInput.appendPrompt?.trim()),
        },
      };
      sessions.set(session.sessionId, session);
      const initialMessage = await sendMessage({
        fromSessionId: spawnInput.requesterSessionId,
        toSessionId: session.sessionId,
        text: spawnInput.task,
        parts: textPart(spawnInput.task),
        intent: "queue",
        now: createdAt,
        metadata: { initialTask: true },
      });
      return { session: safeSession(readSession(session.sessionId)), initialMessage };
    },
    message: sendMessage,
    async inbox(inboxInput: MultiagentInboxInput): Promise<readonly MultiagentMessage[]> {
      const session = readSession(inboxInput.sessionId);
      const now = nowIso(inboxInput.now);
      const ordered = [...messages.values()]
        .filter((message) => message.toSessionId === session.sessionId)
        .filter((message) => inboxInput.unreadOnly !== true || message.readAt === undefined)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const selected = inboxInput.limit === undefined
        ? ordered
        : inboxInput.limit <= 0
          ? []
          : ordered.slice(-Math.floor(inboxInput.limit));
      for (const message of selected) {
        messages.set(message.messageId, {
          ...message,
          status: message.status === "queued" || message.status === "delivered" ? "read" : message.status,
          readAt: message.readAt ?? now,
        });
      }
      return selected.map((message) => safeMessage(messages.get(message.messageId) ?? message));
    },
    async list(listInput: MultiagentListInput = {}): Promise<readonly MultiagentAgentSession[]> {
      const projectId = listInput.projectId ?? input.projectId;
      return [...sessions.values()]
        .filter((session) => session.projectId === projectId)
        .filter((session) => listInput.includeInactive === true || !isInactive(session.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(safeSession);
    },
    async inspect(inspectInput: MultiagentInspectInput) {
      const session = sessions.get(inspectInput.sessionId);
      if (session === undefined || session.projectId !== input.projectId) {
        return { session: undefined, pendingMessages: 0 };
      }
      const pendingMessages = [...messages.values()]
        .filter((message) => message.toSessionId === session.sessionId && message.readAt === undefined)
        .length;
      return {
        session: safeSession(session),
        summary: typeof session.metadata.summary === "string" ? session.metadata.summary : undefined,
        pendingMessages,
      };
    },
    async wait(waitInput: MultiagentWaitInput): Promise<MultiagentWaitResult> {
      const original = messages.get(waitInput.messageId);
      if (original === undefined) throw new Error(`message was not found: ${waitInput.messageId}`);
      if (original.fromSessionId !== waitInput.requesterSessionId) {
        throw new Error("agent.wait can only wait for messages sent by the requester session");
      }
      const reply = [...messages.values()]
        .find((message) => message.replyToMessageId === waitInput.messageId && message.toSessionId === waitInput.requesterSessionId);
      if (reply !== undefined) return { message: safeMessage(reply) };
      return await new Promise<MultiagentWaitResult>((resolve, reject) => {
        const next = waiters.get(waitInput.messageId) ?? [];
        waiters.set(waitInput.messageId, [...next, { requesterSessionId: waitInput.requesterSessionId, resolve, reject }]);
      });
    },
    async stop(stopInput: MultiagentStopInput): Promise<MultiagentAgentSession> {
      const session = readSession(stopInput.sessionId);
      const now = nowIso(stopInput.now);
      return safeSession(updateSession({
        ...session,
        status: "stopped",
        updatedAt: now,
        metadata: { ...session.metadata, stopReason: stopInput.reason },
      }));
    },
    async kill(killInput: MultiagentKillInput): Promise<MultiagentAgentSession> {
      const session = readSession(killInput.sessionId);
      const now = nowIso(killInput.now);
      return safeSession(updateSession({
        ...session,
        status: "killed",
        updatedAt: now,
        metadata: { ...session.metadata, killReason: killInput.reason },
      }));
    },
  };
}

export function createProjectMultiagentRuntime(input: {
  projectRuntime: PraxisProjectRuntime;
  defaultModel?: string;
}): MultiagentRuntime {
  const defaultSessionId = input.projectRuntime.project.defaultSessionId ?? input.projectRuntime.stub.defaultSessionId;
  const defaultAgentId = input.projectRuntime.project.defaultAgentId ?? input.projectRuntime.stub.defaultAgentId;
  return createInMemoryMultiagentRuntime({
    projectId: input.projectRuntime.project.projectId,
    workspaceRoot: input.projectRuntime.project.mainWorkspaceRoot,
    defaultModel: input.defaultModel,
    initialSessions: defaultSessionId === undefined
      ? []
      : [{
        sessionId: defaultSessionId,
        agentId: defaultAgentId ?? `agent.${defaultSessionId}`,
        workingDirectory: input.projectRuntime.project.mainWorkspaceRoot,
        status: "idle",
      }],
  });
}
