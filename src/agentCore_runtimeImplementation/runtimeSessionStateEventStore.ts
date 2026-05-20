/*
 * 文件定位：Agent 运行态实现层 / session-state-event 轻量持久化面。
 * 核心目的：记录 runtime session、state transition、model/tool invocation 和事件日志。
 * 能力要求1：提供内存 store 与 SQLite store 两种实现，保持同一套 runtime 事件合同。
 * 能力要求2：SQLite 只保存 public-safe JSON，不保存 raw secret 或 provider 私有材料。
 * 边界：只做轻量 runtime 记录，不承担 CMP 数据库策略、MP RAG/LanceDB 或企业级外部存储。
 * 对接：需要服务 PraxisRuntimeKernel、inspection/debug、session resume 和后续 mainLoop 审计。
 * 实现提示：先落最小 append/read 合同，再等待更完整状态机和动作原语审计。
 */

import type { MainLoopStepRecord } from "../agentCore_executionEngine/coreLogic/mainLoop.js";

export type RuntimeSessionRecord = {
  sessionId: string;
  runtimeId: string;
  agentId: string;
  manifestHash: string;
  createdAt: string;
  status: "running" | "completed" | "failed" | "waitingApproval" | "interrupted";
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
  kind: "model" | "tool" | "agent" | "io" | "procedure" | "approval";
  target: string;
  ok: boolean;
  createdAt: string;
  summary: Readonly<Record<string, unknown>>;
};

export type RuntimeProcedureRecord = {
  sessionId: string;
  procedureId: string;
  status: "planned" | "running" | "completed" | "failed" | "waitingApproval";
  createdAt: string;
  updatedAt?: string;
  summary: Readonly<Record<string, unknown>>;
};

export type RuntimeApprovalRecord = {
  sessionId: string;
  approvalId: string;
  status: "pending" | "approved" | "denied" | "expired";
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: string;
  source: "model" | "baseTool" | "ephemeralProcedure" | "runtime";
  interfaceSurface: "application" | "test-harness" | "cli" | "tui" | "ui" | "raxos" | "remote-management";
  createdAt: string;
  resolvedAt?: string;
  resolution?: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
};

export type RuntimePublicSafeErrorRecord = {
  sessionId: string;
  errorId: string;
  code: string;
  message: string;
  boundary: "compile" | "io" | "prompt" | "model" | "tool" | "procedure" | "approval" | "runtime-state";
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeSessionSnapshot = {
  session?: RuntimeSessionRecord;
  states: readonly RuntimeStateRecord[];
  events: readonly RuntimeEventRecord[];
  invocations: readonly RuntimeInvocationRecord[];
  mainLoopSteps: readonly MainLoopStepRecord[];
  procedures: readonly RuntimeProcedureRecord[];
  approvals: readonly RuntimeApprovalRecord[];
  errors: readonly RuntimePublicSafeErrorRecord[];
};

export type RuntimeSessionStateEventStore = {
  createSession(record: RuntimeSessionRecord): Promise<void>;
  updateSessionStatus(sessionId: string, status: RuntimeSessionRecord["status"]): Promise<void>;
  appendState(record: RuntimeStateRecord): Promise<void>;
  appendEvent(record: RuntimeEventRecord): Promise<void>;
  appendInvocation(record: RuntimeInvocationRecord): Promise<void>;
  appendMainLoopStep(record: MainLoopStepRecord): Promise<void>;
  appendProcedure(record: RuntimeProcedureRecord): Promise<void>;
  appendApproval(record: RuntimeApprovalRecord): Promise<void>;
  resolveApproval(sessionId: string, approvalId: string, resolution: Pick<RuntimeApprovalRecord, "status" | "resolvedAt" | "resolution">): Promise<void>;
  appendPublicSafeError(record: RuntimePublicSafeErrorRecord): Promise<void>;
  readPendingApprovals(sessionId: string): Promise<readonly RuntimeApprovalRecord[]>;
  readLatestState(sessionId: string): Promise<RuntimeStateRecord | undefined>;
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

function configureSqliteForConcurrentRuntimeAccess(db: SqliteDatabaseSync): void {
  db.exec(`
    PRAGMA busy_timeout = 10000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
}

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
  const mainLoopSteps: MainLoopStepRecord[] = [];
  const procedures: RuntimeProcedureRecord[] = [];
  const approvals: RuntimeApprovalRecord[] = [];
  const errors: RuntimePublicSafeErrorRecord[] = [];

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
    async appendMainLoopStep(record) {
      mainLoopSteps.push(record);
    },
    async appendProcedure(record) {
      const existingIndex = procedures.findIndex((current) => current.sessionId === record.sessionId && current.procedureId === record.procedureId);
      if (existingIndex === -1) {
        procedures.push(record);
      } else {
        procedures[existingIndex] = record;
      }
    },
    async appendApproval(record) {
      const existingIndex = approvals.findIndex((current) => current.sessionId === record.sessionId && current.approvalId === record.approvalId);
      if (existingIndex === -1) {
        approvals.push(record);
      } else {
        approvals[existingIndex] = record;
      }
    },
    async resolveApproval(sessionId, approvalId, resolution) {
      const existingIndex = approvals.findIndex((record) => record.sessionId === sessionId && record.approvalId === approvalId);
      if (existingIndex !== -1) {
        const current = approvals[existingIndex];
        approvals[existingIndex] = {
          ...current,
          status: resolution.status,
          resolvedAt: resolution.resolvedAt,
          resolution: resolution.resolution,
        };
      }
    },
    async appendPublicSafeError(record) {
      errors.push(record);
    },
    async readPendingApprovals(sessionId) {
      return approvals.filter((record) => record.sessionId === sessionId && record.status === "pending");
    },
    async readLatestState(sessionId) {
      return states.filter((record) => record.sessionId === sessionId).at(-1);
    },
    async readSession(sessionId) {
      return {
        session: sessions.get(sessionId),
        states: states.filter((record) => record.sessionId === sessionId),
        events: events.filter((record) => record.sessionId === sessionId),
        invocations: invocations.filter((record) => record.sessionId === sessionId),
        mainLoopSteps: mainLoopSteps.filter((record) => record.sessionId === sessionId),
        procedures: procedures.filter((record) => record.sessionId === sessionId),
        approvals: approvals.filter((record) => record.sessionId === sessionId),
        errors: errors.filter((record) => record.sessionId === sessionId),
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
    CREATE TABLE IF NOT EXISTS runtime_main_loop_steps (
      session_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      action_primitive TEXT NOT NULL,
      status TEXT NOT NULL,
      step_json TEXT NOT NULL,
      PRIMARY KEY (session_id, step_id)
    );
    CREATE TABLE IF NOT EXISTS runtime_procedures (
      session_id TEXT NOT NULL,
      procedure_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      summary_json TEXT NOT NULL,
      PRIMARY KEY (session_id, procedure_id)
    );
    CREATE TABLE IF NOT EXISTS runtime_approvals (
      session_id TEXT NOT NULL,
      approval_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_scopes_json TEXT NOT NULL,
      risk_level TEXT,
      source TEXT NOT NULL,
      interface_surface TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (session_id, approval_id)
    );
    CREATE TABLE IF NOT EXISTS runtime_public_safe_errors (
      session_id TEXT NOT NULL,
      error_id TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      boundary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (session_id, error_id)
    );
  `);
}

function rowRecord(row: unknown): Record<string, unknown> {
  return row !== null && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
}

function parseStringArray(value: unknown): readonly string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseMainLoopStep(value: unknown): MainLoopStepRecord {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return parsed as MainLoopStepRecord;
}

function approvalRecordFromRow(record: Record<string, unknown>): RuntimeApprovalRecord {
  return {
    sessionId: String(record.session_id),
    approvalId: String(record.approval_id),
    status: String(record.status) as RuntimeApprovalRecord["status"],
    reason: String(record.reason),
    requestedScopes: parseStringArray(record.requested_scopes_json),
    riskLevel: typeof record.risk_level === "string" ? record.risk_level : undefined,
    source: String(record.source) as RuntimeApprovalRecord["source"],
    interfaceSurface: String(record.interface_surface) as RuntimeApprovalRecord["interfaceSurface"],
    createdAt: String(record.created_at),
    resolvedAt: typeof record.resolved_at === "string" ? record.resolved_at : undefined,
    resolution: parseJsonRecord(record.resolution_json),
    metadata: parseJsonRecord(record.metadata_json),
  };
}

export async function createSqliteSessionStateEventStore(
  databasePath = ":memory:",
): Promise<RuntimeSessionStateEventStore> {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(databasePath) as SqliteDatabaseSync;
  configureSqliteForConcurrentRuntimeAccess(db);
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
    async appendMainLoopStep(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_main_loop_steps
        (session_id, step_id, turn_index, step_index, action_primitive, status, step_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.stepId,
        record.turnIndex,
        record.stepIndex,
        record.actionPrimitive,
        record.status,
        stableJson(record),
      );
    },
    async appendProcedure(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_procedures
        (session_id, procedure_id, status, created_at, updated_at, summary_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.procedureId,
        record.status,
        record.createdAt,
        record.updatedAt ?? null,
        stableJson(record.summary),
      );
    },
    async appendApproval(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_approvals
        (session_id, approval_id, status, reason, requested_scopes_json, risk_level, source, interface_surface, created_at, resolved_at, resolution_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.approvalId,
        record.status,
        record.reason,
        JSON.stringify(record.requestedScopes),
        record.riskLevel ?? null,
        record.source,
        record.interfaceSurface,
        record.createdAt,
        record.resolvedAt ?? null,
        stableJson(record.resolution),
        stableJson(record.metadata),
      );
    },
    async resolveApproval(sessionId, approvalId, resolution) {
      db.prepare(`
        UPDATE runtime_approvals
        SET status = ?, resolved_at = ?, resolution_json = ?
        WHERE session_id = ? AND approval_id = ?
      `).run(
        resolution.status,
        resolution.resolvedAt ?? null,
        stableJson(resolution.resolution),
        sessionId,
        approvalId,
      );
    },
    async appendPublicSafeError(record) {
      db.prepare(`
        INSERT OR REPLACE INTO runtime_public_safe_errors
        (session_id, error_id, code, message, boundary, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.sessionId,
        record.errorId,
        record.code,
        record.message,
        record.boundary,
        record.createdAt,
        stableJson(record.metadata),
      );
    },
    async readPendingApprovals(sessionId) {
      const rows = db.prepare("SELECT * FROM runtime_approvals WHERE session_id = ? AND status = 'pending' ORDER BY created_at, approval_id").all(sessionId);
      return rows.map((row) => {
        const record = rowRecord(row);
        return approvalRecordFromRow(record);
      });
    },
    async readLatestState(sessionId) {
      const record = rowRecord(db.prepare("SELECT * FROM runtime_states WHERE session_id = ? ORDER BY created_at DESC, state_id DESC LIMIT 1").get(sessionId));
      if (record.state_id === undefined) return undefined;
      return {
        sessionId: String(record.session_id),
        stateId: String(record.state_id),
        phase: String(record.phase),
        createdAt: String(record.created_at),
        metadata: parseJsonRecord(record.metadata_json),
      };
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
      const stepRows = db.prepare("SELECT * FROM runtime_main_loop_steps WHERE session_id = ? ORDER BY turn_index, step_index, step_id").all(sessionId);
      const procedureRows = db.prepare("SELECT * FROM runtime_procedures WHERE session_id = ? ORDER BY created_at, procedure_id").all(sessionId);
      const approvalRows = db.prepare("SELECT * FROM runtime_approvals WHERE session_id = ? ORDER BY created_at, approval_id").all(sessionId);
      const errorRows = db.prepare("SELECT * FROM runtime_public_safe_errors WHERE session_id = ? ORDER BY created_at, error_id").all(sessionId);

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
        mainLoopSteps: stepRows.map((row) => {
          const record = rowRecord(row);
          return parseMainLoopStep(record.step_json);
        }),
        procedures: procedureRows.map((row) => {
          const record = rowRecord(row);
          return {
            sessionId: String(record.session_id),
            procedureId: String(record.procedure_id),
            status: String(record.status) as RuntimeProcedureRecord["status"],
            createdAt: String(record.created_at),
            updatedAt: typeof record.updated_at === "string" ? record.updated_at : undefined,
            summary: parseJsonRecord(record.summary_json),
          };
        }),
        approvals: approvalRows.map((row) => approvalRecordFromRow(rowRecord(row))),
        errors: errorRows.map((row) => {
          const record = rowRecord(row);
          return {
            sessionId: String(record.session_id),
            errorId: String(record.error_id),
            code: String(record.code),
            message: String(record.message),
            boundary: String(record.boundary) as RuntimePublicSafeErrorRecord["boundary"],
            createdAt: String(record.created_at),
            metadata: parseJsonRecord(record.metadata_json),
            publicSafe: true,
          };
        }),
      };
    },
    async close() {
      db.close();
    },
  };
}
