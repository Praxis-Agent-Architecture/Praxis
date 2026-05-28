import type { Db } from '../db/database.js';
import type { Artifact, ExportedProject, Message, Project, SearchFilters, SearchHit, Session, Workspace } from './types.js';

type WorkspaceRow = { id: string; name: string; root_path: string; created_at: string; updated_at: string };
type ProjectRow = { id: string; workspace_id: string; name: string; description: string | null; created_at: string; updated_at: string };
type SessionRow = { id: string; project_id: string; title: string; status: string; created_at: string; updated_at: string };
type MessageRow = { id: string; session_id: string; role: string; content: string; metadata_json: string; created_at: string };
type ArtifactRow = { id: string; session_id: string; name: string; type: string; uri: string; metadata_json: string; created_at: string; updated_at: string };

function parseJson(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

function workspaceFromRow(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, rootPath: row.root_path, createdAt: row.created_at, updatedAt: row.updated_at };
}
function projectFromRow(row: ProjectRow): Project {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}
function sessionFromRow(row: SessionRow): Session {
  return { id: row.id, projectId: row.project_id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function messageFromRow(row: MessageRow): Message {
  return { id: row.id, sessionId: row.session_id, role: row.role, content: row.content, metadata: parseJson(row.metadata_json), createdAt: row.created_at };
}
function artifactFromRow(row: ArtifactRow): Artifact {
  return { id: row.id, sessionId: row.session_id, name: row.name, type: row.type, uri: row.uri, metadata: parseJson(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, query: string): string {
  const pattern = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  return text.replace(pattern, '<mark>$1</mark>');
}

function buildSnippet(text: string, query: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const matchIndex = normalizedText.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex < 0) return normalizedText.slice(0, 180);

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(normalizedText.length, matchIndex + query.length + 120);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalizedText.length ? '…' : '';
  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

function hitSnippet(text: string, query: string): { snippet: string; highlight: string } {
  const snippet = buildSnippet(text, query);
  return { snippet, highlight: highlightText(snippet, query) };
}

function createdAtFilter(): string {
  return `(? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)`;
}

export class KnowledgeRepository {
  constructor(private readonly db: Db) {}

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  createWorkspace(input: Workspace): Workspace {
    this.db.prepare(`INSERT INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(input.id, input.name, input.rootPath, input.createdAt, input.updatedAt);
    return input;
  }

  findWorkspace(id: string): Workspace | undefined {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
    return row ? workspaceFromRow(row) : undefined;
  }

  upsertWorkspace(input: Workspace): Workspace {
    this.db.prepare(`INSERT INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, root_path = excluded.root_path, updated_at = excluded.updated_at`).run(input.id, input.name, input.rootPath, input.createdAt, input.updatedAt);
    return input;
  }

  createProject(input: Project): Project {
    this.db.prepare(`INSERT INTO projects (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(input.id, input.workspaceId, input.name, input.description, input.createdAt, input.updatedAt);
    return input;
  }

  listProjects(): Project[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[]).map(projectFromRow);
  }

  findProject(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? projectFromRow(row) : undefined;
  }

  exportProject(projectId: string): ExportedProject | undefined {
    const project = this.findProject(projectId);
    if (!project) return undefined;
    const workspace = this.findWorkspace(project.workspaceId);
    if (!workspace) return undefined;

    return {
      workspace,
      project,
      sessions: this.listSessions(projectId).map((session) => ({
        ...session,
        messages: this.listMessages(session.id),
        artifacts: this.listArtifacts(session.id)
      }))
    };
  }

  importProject(input: ExportedProject): ExportedProject {
    return this.transaction(() => {
      this.upsertWorkspace(input.workspace);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(input.project.id);
      this.createProject(input.project);

      for (const session of input.sessions) {
        const { messages, artifacts, ...sessionRecord } = session;
        this.createSession(sessionRecord);
        for (const message of messages) this.createMessage(message);
        for (const artifact of artifacts) this.createArtifact(artifact);
      }

      return input;
    });
  }

  createSession(input: Session): Session {
    this.db.prepare(`INSERT INTO sessions (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(input.id, input.projectId, input.title, input.status, input.createdAt, input.updatedAt);
    return input;
  }

  listSessions(projectId: string): Session[] {
    return (this.db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as SessionRow[]).map(sessionFromRow);
  }

  findSession(id: string): Session | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? sessionFromRow(row) : undefined;
  }

  createMessage(input: Message): Message {
    this.db.prepare(`INSERT INTO messages (id, session_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(input.id, input.sessionId, input.role, input.content, JSON.stringify(input.metadata), input.createdAt);
    return input;
  }

  listMessages(sessionId: string): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as MessageRow[]).map(messageFromRow);
  }

  createArtifact(input: Artifact): Artifact {
    this.db.prepare(`INSERT INTO artifacts (id, session_id, name, type, uri, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.id, input.sessionId, input.name, input.type, input.uri, JSON.stringify(input.metadata), input.createdAt, input.updatedAt);
    return input;
  }

  listArtifacts(sessionId: string): Artifact[] {
    return (this.db.prepare('SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as ArtifactRow[]).map(artifactFromRow);
  }

  search(query: string, scope?: SearchFilters): SearchHit[] {
    const like = `%${query}%`;
    const hits: SearchHit[] = [];

    if (!scope?.sessionId && (!scope?.kind || scope.kind === 'project')) {
      const projectRows = this.db.prepare(`SELECT id, name, description, created_at FROM projects WHERE (? IS NULL OR id = ?) AND (${createdAtFilter()}) AND (name LIKE ? OR COALESCE(description, '') LIKE ?) ORDER BY created_at DESC`).all(scope?.projectId ?? null, scope?.projectId ?? null, scope?.createdAtFrom ?? null, scope?.createdAtFrom ?? null, scope?.createdAtTo ?? null, scope?.createdAtTo ?? null, like, like) as Array<{ id: string; name: string; description: string | null; created_at: string }>;
      hits.push(...projectRows.map((row) => {
        const { snippet, highlight } = hitSnippet(row.description ?? row.name, query);
        return { entity: 'project' as const, id: row.id, projectId: row.id, title: row.name, snippet, highlight, createdAt: row.created_at };
      }));
    }

    if (!scope?.kind || scope.kind === 'session') {
      const sessionRows = this.db.prepare(`SELECT s.id, s.project_id, s.title, s.created_at FROM sessions s WHERE (? IS NULL OR s.project_id = ?) AND (? IS NULL OR s.id = ?) AND (? IS NULL OR s.created_at >= ?) AND (? IS NULL OR s.created_at <= ?) AND s.title LIKE ? ORDER BY s.created_at DESC`).all(scope?.projectId ?? null, scope?.projectId ?? null, scope?.sessionId ?? null, scope?.sessionId ?? null, scope?.createdAtFrom ?? null, scope?.createdAtFrom ?? null, scope?.createdAtTo ?? null, scope?.createdAtTo ?? null, like) as Array<{ id: string; project_id: string; title: string; created_at: string }>;
      hits.push(...sessionRows.map((row) => {
        const { snippet, highlight } = hitSnippet(row.title, query);
        return { entity: 'session' as const, id: row.id, projectId: row.project_id, sessionId: row.id, title: row.title, snippet, highlight, createdAt: row.created_at };
      }));
    }

    if (!scope?.kind || scope.kind === 'message') {
      const messageRows = this.db.prepare(`SELECT m.id, m.session_id, s.project_id, m.role, m.content, m.created_at FROM messages m JOIN sessions s ON s.id = m.session_id WHERE (? IS NULL OR s.project_id = ?) AND (? IS NULL OR m.session_id = ?) AND (? IS NULL OR m.created_at >= ?) AND (? IS NULL OR m.created_at <= ?) AND m.content LIKE ? ORDER BY m.created_at DESC`).all(scope?.projectId ?? null, scope?.projectId ?? null, scope?.sessionId ?? null, scope?.sessionId ?? null, scope?.createdAtFrom ?? null, scope?.createdAtFrom ?? null, scope?.createdAtTo ?? null, scope?.createdAtTo ?? null, like) as Array<{ id: string; session_id: string; project_id: string; role: string; content: string; created_at: string }>;
      hits.push(...messageRows.map((row) => {
        const { snippet, highlight } = hitSnippet(row.content, query);
        return { entity: 'message' as const, id: row.id, projectId: row.project_id, sessionId: row.session_id, title: row.role, snippet, highlight, createdAt: row.created_at };
      }));
    }

    if (!scope?.kind || scope.kind === 'artifact') {
      const artifactRows = this.db.prepare(`SELECT a.id, a.session_id, s.project_id, a.name, a.type, a.uri, a.created_at FROM artifacts a JOIN sessions s ON s.id = a.session_id WHERE (? IS NULL OR s.project_id = ?) AND (? IS NULL OR a.session_id = ?) AND (? IS NULL OR a.created_at >= ?) AND (? IS NULL OR a.created_at <= ?) AND (a.name LIKE ? OR a.type LIKE ? OR a.uri LIKE ?) ORDER BY a.created_at DESC`).all(scope?.projectId ?? null, scope?.projectId ?? null, scope?.sessionId ?? null, scope?.sessionId ?? null, scope?.createdAtFrom ?? null, scope?.createdAtFrom ?? null, scope?.createdAtTo ?? null, scope?.createdAtTo ?? null, like, like, like) as Array<{ id: string; session_id: string; project_id: string; name: string; type: string; uri: string; created_at: string }>;
      hits.push(...artifactRows.map((row) => {
        const { snippet, highlight } = hitSnippet(`${row.name} ${row.type}: ${row.uri}`, query);
        return { entity: 'artifact' as const, id: row.id, projectId: row.project_id, sessionId: row.session_id, title: row.name, snippet, highlight, createdAt: row.created_at };
      }));
    }

    return hits;
  }
}
