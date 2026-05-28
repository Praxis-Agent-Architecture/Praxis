import { nanoid } from 'nanoid';
import { KnowledgeRepository } from '../repositories/knowledgeRepository.js';
import type { Artifact, ExportedProject, Message, Project, SearchFilters, SearchHit, Session } from '../repositories/types.js';
import { AppError, notFound } from '../utils/errors.js';

const DEFAULT_WORKSPACE_ID = 'local-workspace';

function now(): string {
  return new Date().toISOString();
}

export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository) {
    if (!this.repository.findWorkspace(DEFAULT_WORKSPACE_ID)) {
      const timestamp = now();
      this.repository.createWorkspace({
        id: DEFAULT_WORKSPACE_ID,
        name: 'Local Workspace',
        rootPath: process.cwd(),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  createProject(input: { name: string; description?: string; workspaceId?: string }): Project {
    const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
    if (!this.repository.findWorkspace(workspaceId)) throw notFound('workspace', workspaceId);
    const timestamp = now();
    return this.repository.createProject({
      id: nanoid(),
      workspaceId,
      name: input.name,
      description: input.description ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  listProjects(): Project[] {
    return this.repository.listProjects();
  }

  createSession(projectId: string, input: { title: string; status?: string }): Session {
    if (!this.repository.findProject(projectId)) throw notFound('project', projectId);
    const timestamp = now();
    return this.repository.createSession({ id: nanoid(), projectId, title: input.title, status: input.status ?? 'active', createdAt: timestamp, updatedAt: timestamp });
  }

  listSessions(projectId: string): Session[] {
    if (!this.repository.findProject(projectId)) throw notFound('project', projectId);
    return this.repository.listSessions(projectId);
  }

  addMessage(sessionId: string, input: { role: string; content: string; metadata?: Record<string, unknown> }): Message {
    if (!this.repository.findSession(sessionId)) throw notFound('session', sessionId);
    return this.repository.createMessage({ id: nanoid(), sessionId, role: input.role, content: input.content, metadata: input.metadata ?? {}, createdAt: now() });
  }

  listMessages(sessionId: string): Message[] {
    if (!this.repository.findSession(sessionId)) throw notFound('session', sessionId);
    return this.repository.listMessages(sessionId);
  }

  addArtifact(sessionId: string, input: { name: string; type: string; uri: string; metadata?: Record<string, unknown> }): Artifact {
    if (!this.repository.findSession(sessionId)) throw notFound('session', sessionId);
    const timestamp = now();
    return this.repository.createArtifact({ id: nanoid(), sessionId, name: input.name, type: input.type, uri: input.uri, metadata: input.metadata ?? {}, createdAt: timestamp, updatedAt: timestamp });
  }

  listArtifacts(sessionId: string): Artifact[] {
    if (!this.repository.findSession(sessionId)) throw notFound('session', sessionId);
    return this.repository.listArtifacts(sessionId);
  }

  exportProject(projectId: string): ExportedProject {
    const exportedProject = this.repository.exportProject(projectId);
    if (!exportedProject) throw notFound('project', projectId);
    return exportedProject;
  }

  importProject(input: ExportedProject): ExportedProject {
    if (input.project.workspaceId !== input.workspace.id) {
      throw new AppError(400, 'IMPORT_INTEGRITY_ERROR', 'Project workspaceId must match exported workspace id');
    }

    const sessionIds = new Set<string>();
    for (const session of input.sessions) {
      if (session.projectId !== input.project.id) {
        throw new AppError(400, 'IMPORT_INTEGRITY_ERROR', 'Session projectId must match exported project id', { sessionId: session.id });
      }
      if (sessionIds.has(session.id)) {
        throw new AppError(400, 'IMPORT_INTEGRITY_ERROR', 'Duplicate session id in import payload', { sessionId: session.id });
      }
      sessionIds.add(session.id);

      for (const message of session.messages) {
        if (message.sessionId !== session.id) {
          throw new AppError(400, 'IMPORT_INTEGRITY_ERROR', 'Message sessionId must match parent session id', { messageId: message.id });
        }
      }

      for (const artifact of session.artifacts) {
        if (artifact.sessionId !== session.id) {
          throw new AppError(400, 'IMPORT_INTEGRITY_ERROR', 'Artifact sessionId must match parent session id', { artifactId: artifact.id });
        }
      }
    }

    return this.repository.importProject(input);
  }

  search(input: { query: string } & SearchFilters): SearchHit[] {
    if (input.projectId && !this.repository.findProject(input.projectId)) throw notFound('project', input.projectId);
    if (input.sessionId && !this.repository.findSession(input.sessionId)) throw notFound('session', input.sessionId);
    return this.repository.search(input.query, {
      projectId: input.projectId,
      sessionId: input.sessionId,
      kind: input.kind,
      createdAtFrom: input.createdAtFrom,
      createdAtTo: input.createdAtTo
    });
  }
}
