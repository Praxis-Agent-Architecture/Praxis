/*
 * 文件定位：Runtime foundation / session manager。
 * 核心目的：在 project 下管理 session 的创建、恢复、重命名、关闭、归档、agent 绑定切换与 fork。
 */

import { randomUUID } from "node:crypto";

import type { PraxisProjectRuntime } from "../runtime.projectPlane/projectRuntime.js";
import type {
  PraxisFoundationStatus,
  PraxisSessionAgentBindingRecord,
  PraxisSessionRecord,
} from "../runtime.projectPlane/projectStore.js";

export type PraxisSessionManager = {
  create(input?: CreatePraxisSessionInput): Promise<PraxisSessionRecord>;
  resume(sessionId?: string): Promise<PraxisSessionRecord | undefined>;
  list(input?: { includeArchived?: boolean }): Promise<readonly PraxisSessionRecord[]>;
  rename(sessionId: string, title: string, now?: string): Promise<PraxisSessionRecord>;
  setStatus(sessionId: string, status: PraxisFoundationStatus, now?: string): Promise<PraxisSessionRecord>;
  archive(sessionId: string, now?: string): Promise<PraxisSessionRecord>;
  close(sessionId: string, now?: string): Promise<PraxisSessionRecord>;
  switchAgent(input: SwitchSessionAgentInput): Promise<PraxisSessionAgentBindingRecord>;
  fork(input: ForkPraxisSessionInput): Promise<PraxisSessionRecord>;
};

export type CreatePraxisSessionInput = {
  sessionId?: string;
  title?: string;
  agentId?: string;
  agentKey?: string;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SwitchSessionAgentInput = {
  sessionId: string;
  agentId: string;
  agentKey?: string;
  reason?: "switch" | "resume";
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ForkPraxisSessionInput = {
  sourceSessionId: string;
  fromTurnId?: string;
  sessionId?: string;
  title?: string;
  agentId?: string;
  agentKey?: string;
  now?: string;
  copyConversation?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "session";
}

function defaultSessionId(projectId: string): string {
  return `session.${safeSegment(projectId)}.${Date.now()}.${randomUUID().slice(0, 8)}`;
}

function defaultAgent(runtime: PraxisProjectRuntime): { agentId: string; agentKey?: string } {
  const entries = Object.entries(runtime.stub.agentEntries);
  const primary = entries.find(([key, entry]) => key === "primary" || entry.role === "primary") ?? entries[0];
  return {
    agentId: runtime.stub.defaultAgentId ?? primary?.[1].agentId ?? `agent.${runtime.project.projectId}.primary`,
    agentKey: primary?.[0],
  };
}

function bindingRecord(input: {
  runtime: PraxisProjectRuntime;
  sessionId: string;
  agentId: string;
  agentKey?: string;
  reason: PraxisSessionAgentBindingRecord["reason"];
  now: string;
  metadata?: Readonly<Record<string, unknown>>;
}): PraxisSessionAgentBindingRecord {
  return {
    bindingId: `binding.${input.sessionId}.${Date.now()}.${randomUUID().slice(0, 8)}`,
    projectId: input.runtime.project.projectId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    agentKey: input.agentKey,
    createdAt: input.now,
    reason: input.reason,
    metadata: input.metadata ?? {},
  };
}

export function createPraxisSessionManager(runtime: PraxisProjectRuntime): PraxisSessionManager {
  return {
    async create(input = {}) {
      const createdAt = nowIso(input.now);
      const agent = input.agentId === undefined
        ? defaultAgent(runtime)
        : { agentId: input.agentId, agentKey: input.agentKey };
      const mainWorkspace = await runtime.store.readMainWorkspace(runtime.project.projectId);
      const session: PraxisSessionRecord = {
        sessionId: input.sessionId ?? defaultSessionId(runtime.project.projectId),
        projectId: runtime.project.projectId,
        workspaceId: mainWorkspace?.workspaceId ?? "workspace.main",
        agentId: agent.agentId,
        activeAgentKey: agent.agentKey,
        status: "idle",
        title: input.title,
        createdAt,
        updatedAt: createdAt,
        metadata: input.metadata ?? {},
      };
      await runtime.store.upsertSession(session);
      await runtime.store.appendAgentBinding(bindingRecord({
        runtime,
        sessionId: session.sessionId,
        agentId: agent.agentId,
        agentKey: agent.agentKey,
        reason: "create",
        now: createdAt,
      }));
      return session;
    },
    async resume(sessionId) {
      if (sessionId !== undefined) return await runtime.store.readSession(sessionId);
      const sessions = await runtime.store.listSessions(runtime.project.projectId);
      return sessions.find((session) => session.status !== "archived" && session.status !== "closed") ?? sessions[0];
    },
    async list(input = {}) {
      const sessions = await runtime.store.listSessions(runtime.project.projectId);
      return input.includeArchived === true ? sessions : sessions.filter((session) => session.status !== "archived");
    },
    async rename(sessionId, title, now) {
      const current = await runtime.store.readSession(sessionId);
      if (!current) throw new Error(`session was not found: ${sessionId}`);
      const updated = { ...current, title: title.trim(), updatedAt: nowIso(now) };
      await runtime.store.updateSession(updated);
      return updated;
    },
    async setStatus(sessionId, status, now) {
      const current = await runtime.store.readSession(sessionId);
      if (!current) throw new Error(`session was not found: ${sessionId}`);
      const updated = { ...current, status, updatedAt: nowIso(now) };
      await runtime.store.updateSession(updated);
      return updated;
    },
    async archive(sessionId, now) {
      return await this.setStatus(sessionId, "archived", now);
    },
    async close(sessionId, now) {
      return await this.setStatus(sessionId, "closed", now);
    },
    async switchAgent(input) {
      const current = await runtime.store.readSession(input.sessionId);
      if (!current) throw new Error(`session was not found: ${input.sessionId}`);
      const changedAt = nowIso(input.now);
      await runtime.store.updateSession({
        ...current,
        agentId: input.agentId,
        activeAgentKey: input.agentKey,
        updatedAt: changedAt,
      });
      const binding = bindingRecord({
        runtime,
        sessionId: input.sessionId,
        agentId: input.agentId,
        agentKey: input.agentKey,
        reason: input.reason ?? "switch",
        now: changedAt,
        metadata: input.metadata,
      });
      await runtime.store.appendAgentBinding(binding);
      return binding;
    },
    async fork(input) {
      const source = await runtime.store.readSession(input.sourceSessionId);
      if (!source) throw new Error(`source session was not found: ${input.sourceSessionId}`);
      const createdAt = nowIso(input.now);
      const fork: PraxisSessionRecord = {
        ...source,
        sessionId: input.sessionId ?? defaultSessionId(runtime.project.projectId),
        agentId: input.agentId ?? source.agentId,
        activeAgentKey: input.agentKey ?? source.activeAgentKey,
        parentSessionId: source.sessionId,
        forkedFromTurnId: input.fromTurnId,
        status: "idle",
        title: input.title ?? (source.title === undefined ? undefined : `${source.title} fork`),
        createdAt,
        updatedAt: createdAt,
        metadata: {
          ...source.metadata,
          ...(input.metadata ?? {}),
          forkedFromSessionId: source.sessionId,
          forkedFromTurnId: input.fromTurnId,
        },
      };
      await runtime.store.upsertSession(fork);
      await runtime.store.appendAgentBinding(bindingRecord({
        runtime,
        sessionId: fork.sessionId,
        agentId: fork.agentId,
        agentKey: fork.activeAgentKey,
        reason: "fork",
        now: createdAt,
      }));
      return fork;
    },
  };
}
