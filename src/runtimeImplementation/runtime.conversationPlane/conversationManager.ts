/*
 * 文件定位：Runtime foundation / conversation manager。
 * 核心目的：管理 session 下的 turn checkpoint、语义消息和 summary，供 application/promptPack 消费。
 */

import { randomUUID } from "node:crypto";

import type { PraxisProjectRuntime } from "../runtime.projectPlane/projectRuntime.js";
import type {
  PraxisConversationMessageRecord,
  PraxisConversationRole,
  PraxisConversationSummaryRecord,
  PraxisTurnRecord,
} from "../runtime.projectPlane/projectStore.js";

export type PraxisConversationManager = {
  createTurn(input: CreateConversationTurnInput): Promise<PraxisTurnRecord>;
  appendMessage(input: AppendConversationMessageInput): Promise<PraxisConversationMessageRecord>;
  appendUserTurn(input: AppendUserTurnInput): Promise<{ turn: PraxisTurnRecord; message: PraxisConversationMessageRecord }>;
  appendAssistantTurn(input: AppendAssistantTurnInput): Promise<PraxisConversationMessageRecord>;
  listMessages(sessionId: string): Promise<readonly PraxisConversationMessageRecord[]>;
  readWindow(input: ReadConversationWindowInput): Promise<readonly PraxisConversationMessageRecord[]>;
  writeSummary(input: WriteConversationSummaryInput): Promise<PraxisConversationSummaryRecord>;
  readSummary(sessionId: string): Promise<PraxisConversationSummaryRecord | undefined>;
  forkMessages(input: ForkConversationMessagesInput): Promise<readonly PraxisConversationMessageRecord[]>;
};

export type CreateConversationTurnInput = {
  sessionId: string;
  turnId?: string;
  turnIndex?: number;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AppendConversationMessageInput = {
  sessionId: string;
  turnId: string;
  role: PraxisConversationRole;
  text: string;
  messageId?: string;
  artifactRefs?: readonly string[];
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AppendUserTurnInput = {
  sessionId: string;
  text: string;
  turnId?: string;
  now?: string;
  artifactRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type AppendAssistantTurnInput = {
  sessionId: string;
  turnId: string;
  text: string;
  now?: string;
  artifactRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ReadConversationWindowInput = {
  sessionId: string;
  untilTurnId?: string;
  limitMessages?: number;
};

export type WriteConversationSummaryInput = {
  sessionId: string;
  text: string;
  source: PraxisConversationSummaryRecord["source"];
  compactedUntilTurnId?: string;
  sourceSessionId?: string;
  sourceTurnId?: string;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ForkConversationMessagesInput = {
  sourceSessionId: string;
  targetSessionId: string;
  untilTurnId?: string;
  now?: string;
};

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

function messageId(role: PraxisConversationRole): string {
  return `message.${role}.${Date.now()}.${randomUUID().slice(0, 8)}`;
}

function nextTurnId(turnIndex: number): string {
  return `turn.${turnIndex}`;
}

export function createPraxisConversationManager(runtime: PraxisProjectRuntime): PraxisConversationManager {
  return {
    async createTurn(input) {
      const session = await runtime.store.readSession(input.sessionId);
      if (!session) throw new Error(`session was not found: ${input.sessionId}`);
      const turns = await runtime.store.listTurns(input.sessionId);
      const turnIndex = input.turnIndex ?? turns.length + 1;
      const turn: PraxisTurnRecord = {
        turnId: input.turnId ?? nextTurnId(turnIndex),
        projectId: runtime.project.projectId,
        sessionId: input.sessionId,
        turnIndex,
        createdAt: nowIso(input.now),
        checkpoint: true,
        metadata: input.metadata ?? {},
      };
      await runtime.store.appendTurn(turn);
      return turn;
    },
    async appendMessage(input) {
      const session = await runtime.store.readSession(input.sessionId);
      if (!session) throw new Error(`session was not found: ${input.sessionId}`);
      const message: PraxisConversationMessageRecord = {
        messageId: input.messageId ?? messageId(input.role),
        projectId: runtime.project.projectId,
        sessionId: input.sessionId,
        turnId: input.turnId,
        role: input.role,
        text: input.text,
        createdAt: nowIso(input.now),
        artifactRefs: input.artifactRefs ?? [],
        metadata: input.metadata ?? {},
      };
      await runtime.store.appendConversationMessage(message);
      return message;
    },
    async appendUserTurn(input) {
      const turn = await this.createTurn({
        sessionId: input.sessionId,
        turnId: input.turnId,
        now: input.now,
        metadata: input.metadata,
      });
      const message = await this.appendMessage({
        sessionId: input.sessionId,
        turnId: turn.turnId,
        role: "user",
        text: input.text,
        artifactRefs: input.artifactRefs,
        now: input.now,
        metadata: input.metadata,
      });
      return { turn, message };
    },
    async appendAssistantTurn(input) {
      return await this.appendMessage({
        sessionId: input.sessionId,
        turnId: input.turnId,
        role: "assistant",
        text: input.text,
        artifactRefs: input.artifactRefs,
        now: input.now,
        metadata: input.metadata,
      });
    },
    async listMessages(sessionId) {
      return await runtime.store.listConversationMessages(sessionId);
    },
    async readWindow(input) {
      const messages = await runtime.store.listConversationMessages(input.sessionId);
      let lastIndex = messages.length - 1;
      if (input.untilTurnId !== undefined) {
        lastIndex = -1;
        for (let index = 0; index < messages.length; index += 1) {
          if (messages[index]?.turnId === input.untilTurnId) lastIndex = index;
        }
      }
      const until = lastIndex < 0 ? [] : messages.slice(0, lastIndex + 1);
      return input.limitMessages === undefined ? until : until.slice(-input.limitMessages);
    },
    async writeSummary(input) {
      const summary: PraxisConversationSummaryRecord = {
        summaryId: `summary.${input.sessionId}.${Date.now()}.${randomUUID().slice(0, 8)}`,
        projectId: runtime.project.projectId,
        sessionId: input.sessionId,
        text: input.text,
        source: input.source,
        compactedUntilTurnId: input.compactedUntilTurnId,
        sourceSessionId: input.sourceSessionId,
        sourceTurnId: input.sourceTurnId,
        updatedAt: nowIso(input.now),
        metadata: input.metadata ?? {},
      };
      await runtime.store.writeConversationSummary(summary);
      return summary;
    },
    async readSummary(sessionId) {
      return await runtime.store.readConversationSummary(sessionId);
    },
    async forkMessages(input) {
      const target = await runtime.store.readSession(input.targetSessionId);
      if (!target) throw new Error(`target session was not found: ${input.targetSessionId}`);
      const sourceTurns = await runtime.store.listTurns(input.sourceSessionId);
      const turnsToCopy = input.untilTurnId === undefined
        ? sourceTurns
        : sourceTurns.slice(0, sourceTurns.findIndex((turn) => turn.turnId === input.untilTurnId) + 1);
      for (const sourceTurn of turnsToCopy) {
        await runtime.store.appendTurn({
          ...sourceTurn,
          sessionId: input.targetSessionId,
          createdAt: nowIso(input.now),
          metadata: {
            ...sourceTurn.metadata,
            sourceSessionId: input.sourceSessionId,
            sourceTurnId: sourceTurn.turnId,
          },
        });
      }
      const sourceMessages = await this.readWindow({
        sessionId: input.sourceSessionId,
        untilTurnId: input.untilTurnId,
      });
      const copied: PraxisConversationMessageRecord[] = [];
      for (const source of sourceMessages) {
        const message: PraxisConversationMessageRecord = {
          ...source,
          messageId: `message.fork.${Date.now()}.${randomUUID().slice(0, 8)}`,
          sessionId: input.targetSessionId,
          createdAt: nowIso(input.now),
          metadata: {
            ...source.metadata,
            sourceSessionId: input.sourceSessionId,
            sourceMessageId: source.messageId,
            sourceTurnId: source.turnId,
          },
        };
        await runtime.store.appendConversationMessage(message);
        copied.push(message);
      }
      const sourceSummary = await runtime.store.readConversationSummary(input.sourceSessionId);
      if (sourceSummary !== undefined) {
        await this.writeSummary({
          sessionId: input.targetSessionId,
          text: sourceSummary.text,
          source: sourceSummary.source,
          compactedUntilTurnId: sourceSummary.compactedUntilTurnId,
          sourceSessionId: input.sourceSessionId,
          sourceTurnId: input.untilTurnId,
          now: input.now,
          metadata: {
            ...sourceSummary.metadata,
            forkedFromSummaryId: sourceSummary.summaryId,
          },
        });
      }
      return copied;
    },
  };
}
