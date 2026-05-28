import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('knowledge API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ databasePath: ':memory:' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a project, creates a session, writes a message, and searches it', async () => {
    const projectResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Praxis Core', description: 'runtime knowledge project' }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json().data;
    assert.equal(project.name, 'Praxis Core');

    const sessionResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/sessions`,
      payload: { title: 'Architecture Notes' }
    });
    assert.equal(sessionResponse.statusCode, 201);
    const session = sessionResponse.json().data;
    assert.equal(session.projectId, project.id);

    const messageResponse = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/messages`,
      payload: { role: 'user', content: 'SQLite repository layer keeps durable conversation context.' }
    });
    assert.equal(messageResponse.statusCode, 201);
    assert.match(messageResponse.json().data.content, /SQLite repository/);

    const searchResponse = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'durable conversation', projectId: project.id }
    });
    assert.equal(searchResponse.statusCode, 200);
    const hits = searchResponse.json().data;
    assert.ok(hits.some((hit: Record<string, unknown>) => hit.entity === 'message' && hit.sessionId === session.id));
    const messageHit = hits.find((hit: Record<string, unknown>) => hit.entity === 'message' && hit.sessionId === session.id);
    assert.match(messageHit.highlight, /<mark>durable conversation<\/mark>/i);
  });

  it('stores and lists artifact metadata', async () => {
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Artifact Project' } })).json().data;
    const session = (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/sessions`, payload: { title: 'Artifacts' } })).json().data;

    const artifactResponse = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/artifacts`,
      payload: { name: 'README draft', type: 'text/markdown', uri: 'file://README.md', metadata: { author: 'test' } }
    });
    assert.equal(artifactResponse.statusCode, 201);

    const listResponse = await app.inject({ method: 'GET', url: `/api/sessions/${session.id}/artifacts` });
    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json().data[0].name, 'README draft');
    assert.equal(listResponse.json().data[0].type, 'text/markdown');
  });

  it('returns unified validation errors', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '' } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION_ERROR');
  });

  it('filters search results by project, session, kind, and createdAt range', async () => {
    const firstProject = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'First Search Project' } })).json().data;
    const secondProject = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Second Search Project' } })).json().data;
    const firstSession = (await app.inject({ method: 'POST', url: `/api/projects/${firstProject.id}/sessions`, payload: { title: 'First Filter Session' } })).json().data;
    const secondSession = (await app.inject({ method: 'POST', url: `/api/projects/${secondProject.id}/sessions`, payload: { title: 'Second Filter Session' } })).json().data;

    const firstMessage = (await app.inject({
      method: 'POST',
      url: `/api/sessions/${firstSession.id}/messages`,
      payload: { role: 'user', content: 'alpha scoped filter message' }
    })).json().data;
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${secondSession.id}/messages`,
      payload: { role: 'user', content: 'alpha scoped filter message' }
    });
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${firstSession.id}/artifacts`,
      payload: { name: 'alpha artifact', type: 'text/plain', uri: 'file://alpha.txt' }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        query: 'alpha',
        projectId: firstProject.id,
        sessionId: firstSession.id,
        kind: 'message',
        createdAtFrom: firstMessage.createdAt,
        createdAtTo: firstMessage.createdAt
      }
    });

    assert.equal(response.statusCode, 200);
    const hits = response.json().data;
    assert.equal(hits.length, 1);
    assert.equal(hits[0].entity, 'message');
    assert.equal(hits[0].projectId, firstProject.id);
    assert.equal(hits[0].sessionId, firstSession.id);
    assert.match(hits[0].highlight, /<mark>alpha<\/mark>/i);

    const futureResponse = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'alpha', kind: 'message', createdAtFrom: '9999-01-01T00:00:00.000Z' }
    });
    assert.equal(futureResponse.statusCode, 200);
    assert.equal(futureResponse.json().data.length, 0);
  });

  it('exports and imports a complete project graph consistently', async () => {
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Export Project', description: 'portable knowledge' } })).json().data;
    const session = (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/sessions`, payload: { title: 'Export Session' } })).json().data;
    const message = (await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/messages`,
      payload: { role: 'assistant', content: 'import export round trip message', metadata: { order: 1 } }
    })).json().data;
    const artifact = (await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/artifacts`,
      payload: { name: 'export.json', type: 'application/json', uri: 'file://export.json', metadata: { portable: true } }
    })).json().data;

    const exportResponse = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/export` });
    assert.equal(exportResponse.statusCode, 200);
    const exported = exportResponse.json().data;
    assert.equal(exported.project.id, project.id);
    assert.equal(exported.sessions[0].id, session.id);
    assert.equal(exported.sessions[0].messages[0].id, message.id);
    assert.equal(exported.sessions[0].artifacts[0].id, artifact.id);

    const importedApp = await buildApp({ databasePath: ':memory:' });
    await importedApp.ready();
    try {
      const importResponse = await importedApp.inject({ method: 'POST', url: '/api/projects/import', payload: exported });
      assert.equal(importResponse.statusCode, 201);
      assert.deepEqual(importResponse.json().data, exported);

      const messagesResponse = await importedApp.inject({ method: 'GET', url: `/api/sessions/${session.id}/messages` });
      assert.equal(messagesResponse.statusCode, 200);
      assert.equal(messagesResponse.json().data[0].content, message.content);
      assert.deepEqual(messagesResponse.json().data[0].metadata, { order: 1 });

      const artifactsResponse = await importedApp.inject({ method: 'GET', url: `/api/sessions/${session.id}/artifacts` });
      assert.equal(artifactsResponse.statusCode, 200);
      assert.equal(artifactsResponse.json().data[0].uri, artifact.uri);

      const searchResponse = await importedApp.inject({ method: 'POST', url: '/api/search', payload: { query: 'round trip', projectId: project.id } });
      assert.equal(searchResponse.statusCode, 200);
      assert.equal(searchResponse.json().data[0].id, message.id);
    } finally {
      await importedApp.close();
    }
  });

  it('rejects import payloads with mismatched parent ids', async () => {
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Invalid Export Project' } })).json().data;
    const session = (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/sessions`, payload: { title: 'Invalid Session' } })).json().data;
    const exported = (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/export` })).json().data;
    exported.sessions[0].projectId = 'wrong-project';

    const response = await app.inject({ method: 'POST', url: '/api/projects/import', payload: exported });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'IMPORT_INTEGRITY_ERROR');
    assert.deepEqual(response.json().error.details, { sessionId: session.id });
  });
});
