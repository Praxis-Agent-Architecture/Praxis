/*
 * 文件定位：Runtime foundation / project-session-conversation store。
 * 核心目的：提供 project 高于 session 的持久化事实源，支持 memory 与 SQLite 两种实现。
 */

import type { DatabaseSync } from "node:sqlite";

export type PraxisProjectKind = "chat" | "workspace-project";

export type PraxisFoundationStatus =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "paused"
  | "completed"
  | "failed"
  | "closed"
  | "archived";

export type PraxisProjectRecord = {
  projectId: string;
  kind: PraxisProjectKind;
  name?: string;
  mainWorkspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  defaultSessionId?: string;
  defaultAgentId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisProjectWorkspaceRecord = {
  workspaceId: string;
  projectId: string;
  root: string;
  role: "main" | "external";
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisProjectLeaseRecord = {
  leaseId: string;
  projectId: string;
  ownerId: string;
  runtimeId?: string;
  processId?: number;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: "active" | "released" | "taken-over";
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisSessionRecord = {
  sessionId: string;
  projectId: string;
  workspaceId: string;
  agentId: string;
  activeAgentKey?: string;
  parentSessionId?: string;
  forkedFromTurnId?: string;
  status: PraxisFoundationStatus;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisSessionAgentBindingRecord = {
  bindingId: string;
  projectId: string;
  sessionId: string;
  agentId: string;
  agentKey?: string;
  createdAt: string;
  reason: "create" | "switch" | "fork" | "resume";
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisTurnRecord = {
  turnId: string;
  projectId: string;
  sessionId: string;
  turnIndex: number;
  createdAt: string;
  checkpoint: true;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisConversationRole = "user" | "assistant" | "system" | "runtime-summary";

export type PraxisConversationMessageRecord = {
  messageId: string;
  projectId: string;
  sessionId: string;
  turnId: string;
  role: PraxisConversationRole;
  text: string;
  createdAt: string;
  artifactRefs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisConversationSummaryRecord = {
  summaryId: string;
  projectId: string;
  sessionId: string;
  text: string;
  source: "application" | "agent-summary" | "imported";
  compactedUntilTurnId?: string;
  sourceSessionId?: string;
  sourceTurnId?: string;
  updatedAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisArtifactRecord = {
  artifactId: string;
  projectId: string;
  sessionId?: string;
  kind: "file" | "text" | "image" | "binary" | "diff" | "report" | (string & {});
  uri: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisFoundationProjectSnapshot = {
  project?: PraxisProjectRecord;
  workspaces: readonly PraxisProjectWorkspaceRecord[];
  sessions: readonly PraxisSessionRecord[];
  leases: readonly PraxisProjectLeaseRecord[];
  artifacts: readonly PraxisArtifactRecord[];
};

export type PraxisFoundationSessionSnapshot = {
  session?: PraxisSessionRecord;
  bindings: readonly PraxisSessionAgentBindingRecord[];
  turns: readonly PraxisTurnRecord[];
  messages: readonly PraxisConversationMessageRecord[];
  summaries: readonly PraxisConversationSummaryRecord[];
  artifacts: readonly PraxisArtifactRecord[];
};

export type PraxisFoundationStore = {
  upsertProject(record: PraxisProjectRecord): Promise<void>;
  readProject(projectId: string): Promise<PraxisProjectRecord | undefined>;
  listProjects(): Promise<readonly PraxisProjectRecord[]>;
  updateProjectKind(projectId: string, kind: PraxisProjectKind, updatedAt: string): Promise<void>;
  upsertWorkspace(record: PraxisProjectWorkspaceRecord): Promise<void>;
  readMainWorkspace(projectId: string): Promise<PraxisProjectWorkspaceRecord | undefined>;
  appendLease(record: PraxisProjectLeaseRecord): Promise<void>;
  readActiveLease(projectId: string): Promise<PraxisProjectLeaseRecord | undefined>;
  releaseLease(record: PraxisProjectLeaseRecord, updatedAt: string): Promise<void>;
  upsertSession(record: PraxisSessionRecord): Promise<void>;
  updateSession(record: PraxisSessionRecord): Promise<void>;
  readSession(sessionId: string): Promise<PraxisSessionRecord | undefined>;
  listSessions(projectId: string): Promise<readonly PraxisSessionRecord[]>;
  appendAgentBinding(record: PraxisSessionAgentBindingRecord): Promise<void>;
  appendTurn(record: PraxisTurnRecord): Promise<void>;
  readTurn(sessionId: string, turnId: string): Promise<PraxisTurnRecord | undefined>;
  listTurns(sessionId: string): Promise<readonly PraxisTurnRecord[]>;
  appendConversationMessage(record: PraxisConversationMessageRecord): Promise<void>;
  listConversationMessages(sessionId: string): Promise<readonly PraxisConversationMessageRecord[]>;
  writeConversationSummary(record: PraxisConversationSummaryRecord): Promise<void>;
  readConversationSummary(sessionId: string): Promise<PraxisConversationSummaryRecord | undefined>;
  upsertArtifact(record: PraxisArtifactRecord): Promise<void>;
  listArtifacts(projectId: string, sessionId?: string): Promise<readonly PraxisArtifactRecord[]>;
  readProjectSnapshot(projectId: string): Promise<PraxisFoundationProjectSnapshot>;
  readSessionSnapshot(sessionId: string): Promise<PraxisFoundationSessionSnapshot>;
  close?(): Promise<void>;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseJsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "string" || value.trim().length === 0) return {};
  const parsed: unknown = JSON.parse(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Readonly<Record<string, unknown>>
    : {};
}

function parseStringArray(value: unknown): readonly string[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function row(row: unknown): Record<string, unknown> {
  return row !== null && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
}

export function createInMemoryProjectStore(): PraxisFoundationStore {
  const projects = new Map<string, PraxisProjectRecord>();
  const workspaces = new Map<string, PraxisProjectWorkspaceRecord>();
  const leases: PraxisProjectLeaseRecord[] = [];
  const sessions = new Map<string, PraxisSessionRecord>();
  const bindings: PraxisSessionAgentBindingRecord[] = [];
  const turns = new Map<string, PraxisTurnRecord>();
  const messages: PraxisConversationMessageRecord[] = [];
  const summaries = new Map<string, PraxisConversationSummaryRecord>();
  const artifacts = new Map<string, PraxisArtifactRecord>();

  return {
    async upsertProject(record) {
      projects.set(record.projectId, record);
    },
    async readProject(projectId) {
      return projects.get(projectId);
    },
    async listProjects() {
      return [...projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async updateProjectKind(projectId, kind, updatedAt) {
      const current = projects.get(projectId);
      if (current) projects.set(projectId, { ...current, kind, updatedAt });
    },
    async upsertWorkspace(record) {
      workspaces.set(record.workspaceId, record);
    },
    async readMainWorkspace(projectId) {
      return [...workspaces.values()].find((record) => record.projectId === projectId && record.role === "main");
    },
    async appendLease(record) {
      leases.push(record);
    },
    async readActiveLease(projectId) {
      return leases.filter((record) => record.projectId === projectId && record.status === "active").at(-1);
    },
    async releaseLease(record, updatedAt) {
      let active: PraxisProjectLeaseRecord | undefined;
      for (let index = leases.length - 1; index >= 0; index -= 1) {
        const item = leases[index];
        if (item?.projectId === record.projectId && item.leaseId === record.leaseId && item.status === "active") {
          active = item;
          break;
        }
      }
      if (active) leases[leases.indexOf(active)] = { ...active, status: "released", heartbeatAt: updatedAt, expiresAt: updatedAt };
    },
    async upsertSession(record) {
      sessions.set(record.sessionId, record);
    },
    async updateSession(record) {
      sessions.set(record.sessionId, record);
    },
    async readSession(sessionId) {
      return sessions.get(sessionId);
    },
    async listSessions(projectId) {
      return [...sessions.values()].filter((record) => record.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async appendAgentBinding(record) {
      bindings.push(record);
    },
    async appendTurn(record) {
      turns.set(`${record.sessionId}:${record.turnId}`, record);
    },
    async readTurn(sessionId, turnId) {
      return turns.get(`${sessionId}:${turnId}`);
    },
    async listTurns(sessionId) {
      return [...turns.values()].filter((record) => record.sessionId === sessionId).sort((a, b) => a.turnIndex - b.turnIndex);
    },
    async appendConversationMessage(record) {
      messages.push(record);
    },
    async listConversationMessages(sessionId) {
      return messages.filter((record) => record.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async writeConversationSummary(record) {
      summaries.set(record.sessionId, record);
    },
    async readConversationSummary(sessionId) {
      return summaries.get(sessionId);
    },
    async upsertArtifact(record) {
      artifacts.set(record.artifactId, record);
    },
    async listArtifacts(projectId, sessionId) {
      void sessionId;
      return [...artifacts.values()]
        .filter((record) => record.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async readProjectSnapshot(projectId) {
      return {
        project: projects.get(projectId),
        workspaces: [...workspaces.values()].filter((record) => record.projectId === projectId),
        sessions: [...sessions.values()].filter((record) => record.projectId === projectId),
        leases: leases.filter((record) => record.projectId === projectId),
        artifacts: [...artifacts.values()].filter((record) => record.projectId === projectId),
      };
    },
    async readSessionSnapshot(sessionId) {
      const session = sessions.get(sessionId);
      const projectId = session?.projectId ?? "";
      return {
        session,
        bindings: bindings.filter((record) => record.sessionId === sessionId),
        turns: [...turns.values()].filter((record) => record.sessionId === sessionId),
        messages: messages.filter((record) => record.sessionId === sessionId),
        summaries: [...summaries.values()].filter((record) => record.sessionId === sessionId),
        artifacts: [...artifacts.values()].filter((record) => record.projectId === projectId && (record.sessionId === undefined || record.sessionId === sessionId)),
      };
    },
  };
}

type SqliteDatabase = Pick<DatabaseSync, "exec" | "prepare" | "close">;

function configureSqlite(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA busy_timeout = 10000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
}

function installSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS foundation_projects (
      project_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT,
      main_workspace_root TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      default_session_id TEXT,
      default_agent_id TEXT,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_workspaces (
      workspace_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      root TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_project_leases (
      project_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      runtime_id TEXT,
      process_id INTEGER,
      acquired_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      active_agent_key TEXT,
      parent_session_id TEXT,
      forked_from_turn_id TEXT,
      status TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_session_agent_bindings (
      binding_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_key TEXT,
      created_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_turns (
      turn_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (session_id, turn_id)
    );
    CREATE TABLE IF NOT EXISTS foundation_conversation_messages (
      message_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_conversation_summaries (
      summary_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      compacted_until_turn_id TEXT,
      source_session_id TEXT,
      source_turn_id TEXT,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundation_artifacts (
      artifact_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      kind TEXT NOT NULL,
      uri TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
  `);
}

function projectFromRow(record: Record<string, unknown>): PraxisProjectRecord {
  return {
    projectId: String(record.project_id),
    kind: String(record.kind) as PraxisProjectKind,
    name: typeof record.name === "string" ? record.name : undefined,
    mainWorkspaceRoot: String(record.main_workspace_root),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
    defaultSessionId: typeof record.default_session_id === "string" ? record.default_session_id : undefined,
    defaultAgentId: typeof record.default_agent_id === "string" ? record.default_agent_id : undefined,
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function workspaceFromRow(record: Record<string, unknown>): PraxisProjectWorkspaceRecord {
  return {
    workspaceId: String(record.workspace_id),
    projectId: String(record.project_id),
    root: String(record.root),
    role: String(record.role) as PraxisProjectWorkspaceRecord["role"],
    createdAt: String(record.created_at),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function leaseFromRow(record: Record<string, unknown>): PraxisProjectLeaseRecord {
  const metadata = parseJsonRecord(record.metadata_json);
  return {
    leaseId: typeof metadata.leaseId === "string" ? metadata.leaseId : `${String(record.owner_id)}:${String(record.acquired_at)}`,
    projectId: String(record.project_id),
    ownerId: String(record.owner_id),
    runtimeId: typeof record.runtime_id === "string" ? record.runtime_id : undefined,
    processId: typeof record.process_id === "number" ? record.process_id : undefined,
    acquiredAt: String(record.acquired_at),
    heartbeatAt: String(record.heartbeat_at),
    expiresAt: String(record.expires_at),
    status: String(record.status) as PraxisProjectLeaseRecord["status"],
    metadata,
  };
}

function sessionFromRow(record: Record<string, unknown>): PraxisSessionRecord {
  return {
    sessionId: String(record.session_id),
    projectId: String(record.project_id),
    workspaceId: String(record.workspace_id),
    agentId: String(record.agent_id),
    activeAgentKey: typeof record.active_agent_key === "string" ? record.active_agent_key : undefined,
    parentSessionId: typeof record.parent_session_id === "string" ? record.parent_session_id : undefined,
    forkedFromTurnId: typeof record.forked_from_turn_id === "string" ? record.forked_from_turn_id : undefined,
    status: String(record.status) as PraxisFoundationStatus,
    title: typeof record.title === "string" ? record.title : undefined,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function bindingFromRow(record: Record<string, unknown>): PraxisSessionAgentBindingRecord {
  return {
    bindingId: String(record.binding_id),
    projectId: String(record.project_id),
    sessionId: String(record.session_id),
    agentId: String(record.agent_id),
    agentKey: typeof record.agent_key === "string" ? record.agent_key : undefined,
    createdAt: String(record.created_at),
    reason: String(record.reason) as PraxisSessionAgentBindingRecord["reason"],
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function turnFromRow(record: Record<string, unknown>): PraxisTurnRecord {
  return {
    turnId: String(record.turn_id),
    projectId: String(record.project_id),
    sessionId: String(record.session_id),
    turnIndex: Number(record.turn_index),
    createdAt: String(record.created_at),
    checkpoint: true,
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function messageFromRow(record: Record<string, unknown>): PraxisConversationMessageRecord {
  return {
    messageId: String(record.message_id),
    projectId: String(record.project_id),
    sessionId: String(record.session_id),
    turnId: String(record.turn_id),
    role: String(record.role) as PraxisConversationRole,
    text: String(record.text),
    createdAt: String(record.created_at),
    artifactRefs: parseStringArray(record.artifact_refs_json),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function summaryFromRow(record: Record<string, unknown>): PraxisConversationSummaryRecord {
  return {
    summaryId: String(record.summary_id),
    projectId: String(record.project_id),
    sessionId: String(record.session_id),
    text: String(record.text),
    source: String(record.source) as PraxisConversationSummaryRecord["source"],
    compactedUntilTurnId: typeof record.compacted_until_turn_id === "string" ? record.compacted_until_turn_id : undefined,
    sourceSessionId: typeof record.source_session_id === "string" ? record.source_session_id : undefined,
    sourceTurnId: typeof record.source_turn_id === "string" ? record.source_turn_id : undefined,
    updatedAt: String(record.updated_at),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

function artifactFromRow(record: Record<string, unknown>): PraxisArtifactRecord {
  return {
    artifactId: String(record.artifact_id),
    projectId: String(record.project_id),
    sessionId: typeof record.session_id === "string" ? record.session_id : undefined,
    kind: String(record.kind) as PraxisArtifactRecord["kind"],
    uri: String(record.uri),
    createdAt: String(record.created_at),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

export async function createSqliteProjectStore(databasePath: string): Promise<PraxisFoundationStore> {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(databasePath) as SqliteDatabase;
  configureSqlite(db);
  installSchema(db);

  return {
    async upsertProject(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_projects
        (project_id, kind, name, main_workspace_root, created_at, updated_at, default_session_id, default_agent_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.projectId, record.kind, record.name ?? null, record.mainWorkspaceRoot, record.createdAt, record.updatedAt, record.defaultSessionId ?? null, record.defaultAgentId ?? null, stableJson(record.metadata));
    },
    async readProject(projectId) {
      const record = row(db.prepare("SELECT * FROM foundation_projects WHERE project_id = ?").get(projectId));
      return record.project_id === undefined ? undefined : projectFromRow(record);
    },
    async listProjects() {
      return db.prepare("SELECT * FROM foundation_projects ORDER BY updated_at DESC, project_id").all().map((item) => projectFromRow(row(item)));
    },
    async updateProjectKind(projectId, kind, updatedAt) {
      db.prepare("UPDATE foundation_projects SET kind = ?, updated_at = ? WHERE project_id = ?").run(kind, updatedAt, projectId);
    },
    async upsertWorkspace(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_workspaces
        (workspace_id, project_id, root, role, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.workspaceId, record.projectId, record.root, record.role, record.createdAt, stableJson(record.metadata));
    },
    async readMainWorkspace(projectId) {
      const record = row(db.prepare("SELECT * FROM foundation_workspaces WHERE project_id = ? AND role = 'main' LIMIT 1").get(projectId));
      return record.workspace_id === undefined ? undefined : workspaceFromRow(record);
    },
    async appendLease(record) {
      db.prepare(`
        INSERT INTO foundation_project_leases
        (project_id, owner_id, runtime_id, process_id, acquired_at, heartbeat_at, expires_at, status, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.projectId, record.ownerId, record.runtimeId ?? null, record.processId ?? null, record.acquiredAt, record.heartbeatAt, record.expiresAt, record.status, stableJson(record.metadata));
    },
    async readActiveLease(projectId) {
      const record = row(db.prepare("SELECT * FROM foundation_project_leases WHERE project_id = ? AND status = 'active' ORDER BY heartbeat_at DESC LIMIT 1").get(projectId));
      return record.project_id === undefined ? undefined : leaseFromRow(record);
    },
    async releaseLease(record, updatedAt) {
      db.prepare("UPDATE foundation_project_leases SET status = 'released', heartbeat_at = ?, expires_at = ? WHERE project_id = ? AND owner_id = ? AND acquired_at = ? AND metadata_json = ? AND status = 'active'").run(updatedAt, updatedAt, record.projectId, record.ownerId, record.acquiredAt, stableJson(record.metadata));
    },
    async upsertSession(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_sessions
        (session_id, project_id, workspace_id, agent_id, active_agent_key, parent_session_id, forked_from_turn_id, status, title, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.sessionId, record.projectId, record.workspaceId, record.agentId, record.activeAgentKey ?? null, record.parentSessionId ?? null, record.forkedFromTurnId ?? null, record.status, record.title ?? null, record.createdAt, record.updatedAt, stableJson(record.metadata));
    },
    async updateSession(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_sessions
        (session_id, project_id, workspace_id, agent_id, active_agent_key, parent_session_id, forked_from_turn_id, status, title, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.sessionId, record.projectId, record.workspaceId, record.agentId, record.activeAgentKey ?? null, record.parentSessionId ?? null, record.forkedFromTurnId ?? null, record.status, record.title ?? null, record.createdAt, record.updatedAt, stableJson(record.metadata));
    },
    async readSession(sessionId) {
      const record = row(db.prepare("SELECT * FROM foundation_sessions WHERE session_id = ?").get(sessionId));
      return record.session_id === undefined ? undefined : sessionFromRow(record);
    },
    async listSessions(projectId) {
      return db.prepare("SELECT * FROM foundation_sessions WHERE project_id = ? ORDER BY updated_at DESC, session_id").all(projectId).map((item) => sessionFromRow(row(item)));
    },
    async appendAgentBinding(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_session_agent_bindings
        (binding_id, project_id, session_id, agent_id, agent_key, created_at, reason, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.bindingId, record.projectId, record.sessionId, record.agentId, record.agentKey ?? null, record.createdAt, record.reason, stableJson(record.metadata));
    },
    async appendTurn(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_turns
        (turn_id, project_id, session_id, turn_index, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.turnId, record.projectId, record.sessionId, record.turnIndex, record.createdAt, stableJson(record.metadata));
    },
    async readTurn(sessionId, turnId) {
      const record = row(db.prepare("SELECT * FROM foundation_turns WHERE session_id = ? AND turn_id = ?").get(sessionId, turnId));
      return record.turn_id === undefined ? undefined : turnFromRow(record);
    },
    async listTurns(sessionId) {
      return db.prepare("SELECT * FROM foundation_turns WHERE session_id = ? ORDER BY turn_index, turn_id").all(sessionId).map((item) => turnFromRow(row(item)));
    },
    async appendConversationMessage(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_conversation_messages
        (message_id, project_id, session_id, turn_id, role, text, created_at, artifact_refs_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.messageId, record.projectId, record.sessionId, record.turnId, record.role, record.text, record.createdAt, JSON.stringify(record.artifactRefs), stableJson(record.metadata));
    },
    async listConversationMessages(sessionId) {
      return db.prepare("SELECT * FROM foundation_conversation_messages WHERE session_id = ? ORDER BY created_at, message_id").all(sessionId).map((item) => messageFromRow(row(item)));
    },
    async writeConversationSummary(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_conversation_summaries
        (summary_id, project_id, session_id, text, source, compacted_until_turn_id, source_session_id, source_turn_id, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.summaryId, record.projectId, record.sessionId, record.text, record.source, record.compactedUntilTurnId ?? null, record.sourceSessionId ?? null, record.sourceTurnId ?? null, record.updatedAt, stableJson(record.metadata));
    },
    async readConversationSummary(sessionId) {
      const record = row(db.prepare("SELECT * FROM foundation_conversation_summaries WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1").get(sessionId));
      return record.summary_id === undefined ? undefined : summaryFromRow(record);
    },
    async upsertArtifact(record) {
      db.prepare(`
        INSERT OR REPLACE INTO foundation_artifacts
        (artifact_id, project_id, session_id, kind, uri, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(record.artifactId, record.projectId, record.sessionId ?? null, record.kind, record.uri, record.createdAt, stableJson(record.metadata));
    },
    async listArtifacts(projectId, sessionId) {
      void sessionId;
      const rows = db.prepare("SELECT * FROM foundation_artifacts WHERE project_id = ? ORDER BY created_at DESC, artifact_id").all(projectId);
      return rows.map((item) => artifactFromRow(row(item)));
    },
    async readProjectSnapshot(projectId) {
      const projectRecord = row(db.prepare("SELECT * FROM foundation_projects WHERE project_id = ?").get(projectId));
      return {
        project: projectRecord.project_id === undefined ? undefined : projectFromRow(projectRecord),
        workspaces: db.prepare("SELECT * FROM foundation_workspaces WHERE project_id = ? ORDER BY role, workspace_id").all(projectId).map((item) => workspaceFromRow(row(item))),
        sessions: db.prepare("SELECT * FROM foundation_sessions WHERE project_id = ? ORDER BY updated_at DESC, session_id").all(projectId).map((item) => sessionFromRow(row(item))),
        leases: db.prepare("SELECT * FROM foundation_project_leases WHERE project_id = ? ORDER BY heartbeat_at DESC").all(projectId).map((item) => leaseFromRow(row(item))),
        artifacts: db.prepare("SELECT * FROM foundation_artifacts WHERE project_id = ? ORDER BY created_at DESC, artifact_id").all(projectId).map((item) => artifactFromRow(row(item))),
      };
    },
    async readSessionSnapshot(sessionId) {
      const sessionRecord = row(db.prepare("SELECT * FROM foundation_sessions WHERE session_id = ?").get(sessionId));
      const session = sessionRecord.session_id === undefined ? undefined : sessionFromRow(sessionRecord);
      return {
        session,
        bindings: db.prepare("SELECT * FROM foundation_session_agent_bindings WHERE session_id = ? ORDER BY created_at, binding_id").all(sessionId).map((item) => bindingFromRow(row(item))),
        turns: db.prepare("SELECT * FROM foundation_turns WHERE session_id = ? ORDER BY turn_index, turn_id").all(sessionId).map((item) => turnFromRow(row(item))),
        messages: db.prepare("SELECT * FROM foundation_conversation_messages WHERE session_id = ? ORDER BY created_at, message_id").all(sessionId).map((item) => messageFromRow(row(item))),
        summaries: db.prepare("SELECT * FROM foundation_conversation_summaries WHERE session_id = ? ORDER BY updated_at").all(sessionId).map((item) => summaryFromRow(row(item))),
        artifacts: session === undefined ? [] : db.prepare("SELECT * FROM foundation_artifacts WHERE project_id = ? ORDER BY created_at DESC, artifact_id").all(session.projectId).map((item) => artifactFromRow(row(item))),
      };
    },
    async close() {
      db.close();
    },
  };
}
