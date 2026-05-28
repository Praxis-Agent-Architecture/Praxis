import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError, type ZodSchema } from 'zod';
import { KnowledgeService } from '../services/knowledgeService.js';
import { addArtifactSchema, addMessageSchema, createProjectSchema, createSessionSchema, importProjectSchema, searchSchema } from '../schemas/apiSchemas.js';
import { AppError } from '../utils/errors.js';

function parseBody<T>(schema: ZodSchema<T>, request: FastifyRequest): T {
  try {
    return schema.parse(request.body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', error.flatten());
    }
    throw error;
  }
}

export async function registerKnowledgeRoutes(app: FastifyInstance, service: KnowledgeService): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, service: 'praxis-knowledge-hub' }));

  app.post('/api/projects', async (request, reply) => {
    const project = service.createProject(parseBody(createProjectSchema, request));
    return reply.code(201).send({ data: project });
  });

  app.get('/api/projects', async () => ({ data: service.listProjects() }));

  app.post<{ Params: { projectId: string } }>('/api/projects/:projectId/sessions', async (request, reply) => {
    const session = service.createSession(request.params.projectId, parseBody(createSessionSchema, request));
    return reply.code(201).send({ data: session });
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/sessions', async (request) => ({ data: service.listSessions(request.params.projectId) }));

  app.post<{ Params: { projectId: string } }>('/api/projects/:projectId/export', async (request) => ({ data: service.exportProject(request.params.projectId) }));

  app.post('/api/projects/import', async (request, reply) => {
    const importedProject = service.importProject(parseBody(importProjectSchema, request));
    return reply.code(201).send({ data: importedProject });
  });

  app.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/messages', async (request, reply) => {
    const message = service.addMessage(request.params.sessionId, parseBody(addMessageSchema, request));
    return reply.code(201).send({ data: message });
  });

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/messages', async (request) => ({ data: service.listMessages(request.params.sessionId) }));

  app.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/artifacts', async (request, reply) => {
    const artifact = service.addArtifact(request.params.sessionId, parseBody(addArtifactSchema, request));
    return reply.code(201).send({ data: artifact });
  });

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/artifacts', async (request) => ({ data: service.listArtifacts(request.params.sessionId) }));

  app.post('/api/search', async (request) => ({ data: service.search(parseBody(searchSchema, request)) }));
}
