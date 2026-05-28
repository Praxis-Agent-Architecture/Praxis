import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { createDatabase, type Db } from './db/database.js';
import { KnowledgeRepository } from './repositories/knowledgeRepository.js';
import { KnowledgeService } from './services/knowledgeService.js';
import { registerKnowledgeRoutes } from './routes/knowledgeRoutes.js';
import { AppError } from './utils/errors.js';

export async function buildApp(options: { databasePath: string; logger?: boolean } | { db: Db; logger?: boolean }) {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(sensible);

  const db = 'db' in options ? options.db : createDatabase(options.databasePath);
  const repository = new KnowledgeRepository(db);
  const service = new KnowledgeService(repository);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  await registerKnowledgeRoutes(app, service);
  app.addHook('onClose', async () => db.close());
  return app;
}
