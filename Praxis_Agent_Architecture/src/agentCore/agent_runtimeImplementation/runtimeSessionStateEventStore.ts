/*
 * 文件定位：Agent 运行态实现层 / session-state-event 轻量持久化面。
 * 核心目的：记录 runtime session、state transition、model/tool invocation 和事件日志。
 * 能力要求1：提供内存 store 与 SQLite store 两种实现，保持同一套 runtime 事件合同。
 * 能力要求2：SQLite 只保存 public-safe JSON，不保存 raw secret 或 provider 私有材料。
 * 边界：只做轻量 runtime 记录，不承担 CMP 数据库策略、MP RAG/LanceDB 或企业级外部存储。
 * 对接：需要服务 PraxisRuntimeKernel、inspection/debug、session resume 和后续 mainLoop 审计。
 * 实现提示：先落最小 append/read 合同，再等待更完整状态机和动作原语审计。
 */

export type RuntimeSessionRecord = {
  sessionId: string;
  runtimeId: string;
  agentId: string;
  manifestHash: string;
  createdAt: string;
  status: "running" | "completed" | "failed";
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimeStateRecord = {
  sessionId: string;
  stateId: string;
  phase: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimeEventRecord = {
  sessionId: string;
  eventId: string;
  type: string;
  createdAt: string;
  payload: Readonly<Record<string, unknown>>;
};

export type RuntimeInvocationRecord = {
  sessionId: string;
  invocationId: string;
  kind: "model" | "tool" | "agent" | "io";
  target: string;
  ok: boolean;
  createdAt: string;
  summary: Readonly<Record<string, unknown>>;
};

export type RuntimeSessionSnapshot = {
  session?: RuntimeSessionRecord;
  states: readonly RuntimeStateRecord[];
  events: readonly RuntimeEventRecord[];
  invocations: readonly RuntimeInvocationRecord[];
};

export type RuntimeSessionStateEventStore = {
  createSession(record: RuntimeSessionRecord): Promise<void>;
  updateSessionStatus(sessionId: string, status: RuntimeSessionRecord["status"]): Promise<void>;
  appendState(record: RuntimeStateRecord): Promise<void>;
  appendEvent(record: RuntimeEventRecord): Promise<void>;
  appendInvocation(record: RuntimeInvocationRecord): Promise<void>;
  readSession(sessionId: string): Promise<RuntimeSessionSnapshot>;
  close?(): Promise<void>;
};

type SqliteDatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  close(): void;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseJsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Readonly<Record<string, unknown>>
    : {};
}

export function createInMemorySessionStateEventStore(): RuntimeSessionStateEventStore {
  const sessions = new Map<string, RuntimeSessionRecord>();
  const states: RuntimeStateRecord[] = [];
  const events: RuntimeEventRecord[] = [];
  const invocations: RuntimeInvocationRecord[] = [];

  return {
    async createSession(record) {
      sessions.set(record.sessionId, record);
    },
    async updateSessionStatus(sessionId, status) {
      const current = sessions.get(sessionId);
      if (current !== undefined) {
        sessions.set(sessionId, { ...current, status });
      }
    },
    async appendState(record) {
      states.push(record);
    },
    async appendEvent(record) {
      events.push(record);
    },
    async appendInvocation(record) {
      invocations.push(record);
    },
    async readSession(sessionId) {
      return {
        session: sessions.get(sessionId),
        states: states.filter((record) => record.sessionId === sessionId),
        events: events.filter((record) => record.sessionId === sessionId),
        invocations: invocations.filter((record) => record.sessionId === sessionId),
      };
    },
  };
}

function installSchema(db: SqliteDatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_sessions (
      session_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_states (
      session_id TEXT NOT NULL,
      state_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (session_id, state_id)
    );
    CREATE TABLE IF NOT EXISTS runtime_events (
      session_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (session_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS runtime_invocations (
      session_id TEXT NOT NULL,
      invocation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      ok INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      PRIMARY KEY (session_id, invocation_id)
    );
  `);
}

function rowRecord(row: unknown): Record<string, unknown> {
  return row !== null && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
}

export async function createSqliteSessionStateEventStore(
  databasePath = ":memory:",
): Promise<RuntimeSessionStateEventStore> {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(databasePath) as SqliteDatabaseSync;
  installSchema(db);

  return {
    async createSession(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_sessions
        (session_id, runtime_id, agent_id, manifest_hash, created_at, status, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.runtimeId,
        record.agentId,
        record.manifestHash,
        record.createdAt,
        record.status,
        stableJson(record.metadata),
      );
    },
    async updateSessionStatus(sessionId, status) {
      db.prepare("UPDATE runtime_sessions SET status = ? WHERE session_id = ?").run(status, sessionId);
    },
    async appendState(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_states
        (session_id, state_id, phase, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(record.sessionId, record.stateId, record.phase, record.createdAt, stableJson(record.metadata));
    },
    async appendEvent(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_events
        (session_id, event_id, type, created_at, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(record.sessionId, record.eventId, record.type, record.createdAt, stableJson(record.payload));
    },
    async appendInvocation(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_invocations
        (session_id, invocation_id, kind, target, ok, created_at, summary_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.invocationId,
        record.kind,
        record.target,
        record.ok ? 1 : 0,
        record.createdAt,
        stableJson(record.summary),
      );
    },
    async readSession(sessionId) {
      const sessionRow = rowRecord(db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?").get(sessionId));
      const session = sessionRow.session_id === undefined
        ? undefined
        : {
            sessionId: String(sessionRow.session_id),
            runtimeId: String(sessionRow.runtime_id),
            agentId: String(sessionRow.agent_id),
            manifestHash: String(sessionRow.manifest_hash),
            createdAt: String(sessionRow.created_at),
            status: String(sessionRow.status) as RuntimeSessionRecord["status"],
            metadata: parseJsonRecord(sessionRow.metadata_json),
          };

      const stateRows = db.prepare("SELECT * FROM runtime_states WHERE session_id = ? ORDER BY created_at, state_id").all(sessionId);
      const eventRows = db.prepare("SELECT * FROM runtime_events WHERE session_id = ? ORDER BY created_at, event_id").all(sessionId);
      const invocationRows = db.prepare("SELECT * FROM runtime_invocations WHERE session_id = ? ORDER BY created_at, invocation_id").all(sessionId);

      return {
        session,
        states: stateRows.map((row) => {
          const record = rowRecord(row);
          return {
            sessionId: String(record.session_id),
            stateId: String(record.state_id),
            phase: String(record.phase),
            createdAt: String(record.created_at),
            metadata: parseJsonRecord(record.metadata_json),
          };
        }),
        events: eventRows.map((row) => {
          const record = rowRecord(row);
          return {
            sessionId: String(record.session_id),
            eventId: String(record.event_id),
            type: String(record.type),
            createdAt: String(record.created_at),
            payload: parseJsonRecord(record.payload_json),
          };
        }),
        invocations: invocationRows.map((row) => {
          const record = rowRecord(row);
          return {
            sessionId: String(record.session_id),
            invocationId: String(record.invocation_id),
            kind: String(record.kind) as RuntimeInvocationRecord["kind"],
            target: String(record.target),
            ok: Number(record.ok) === 1,
            createdAt: String(record.created_at),
            summary: parseJsonRecord(record.summary_json),
          };
        }),
      };
    },
    async close() {
      db.close();
    },
  };
}
