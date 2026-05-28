# praxis-knowledge-hub

A local project knowledge-base REST API built with TypeScript, Fastify, and SQLite.

## Features

- Clear route/service/repository layering.
- SQLite persistence with migration/init logic.
- Four-level domain model: `workspace -> project -> session -> conversation message`.
- Artifact metadata storage per session.
- Complete project JSON export/import for portable backups and restores.
- Keyword search across projects, sessions, messages, and artifacts.
- Zod request validation and unified error responses.
- Minimal Node test runner coverage for project creation, session creation, message writes, artifacts, validation, and search.

## Project structure

```text
src/
  app.ts                    Fastify app factory and error handler
  server.ts                 HTTP server entrypoint
  config.ts                 Environment configuration
  db/                       SQLite connection and migrations
  repositories/             SQL persistence layer
  services/                 Business logic and existence checks
  routes/                   REST route registration
  schemas/                  Zod request schemas
  utils/                    Shared error helpers
test/                       API tests using node:test and Fastify inject
```

## Setup

```bash
npm install
npm run db:init
```

Environment variables:

- `HOST` default: `127.0.0.1`
- `PORT` default: `3000`
- `DATABASE_PATH` default: `./data/knowledge-hub.db`

## Run

```bash
npm run dev
# or
npm run build && npm start
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

## Test

```bash
npm test
```

## API examples

Create a project:

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"Praxis","description":"Local knowledge project"}'
```

List projects:

```bash
curl -s http://127.0.0.1:3000/api/projects
```

Create a session:

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects/$PROJECT_ID/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"Design notes"}'
```

Add a conversation message:

```bash
curl -s -X POST http://127.0.0.1:3000/api/sessions/$SESSION_ID/messages \
  -H 'content-type: application/json' \
  -d '{"role":"user","content":"SQLite persists the local knowledge base."}'
```

List messages:

```bash
curl -s http://127.0.0.1:3000/api/sessions/$SESSION_ID/messages
```

Add artifact metadata:

```bash
curl -s -X POST http://127.0.0.1:3000/api/sessions/$SESSION_ID/artifacts \
  -H 'content-type: application/json' \
  -d '{"name":"architecture.md","type":"text/markdown","uri":"file://architecture.md","metadata":{"topic":"design"}}'
```

Export a complete project graph:

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects/$PROJECT_ID/export
```

The export payload contains the workspace, project, sessions, messages, and artifacts:

```json
{
  "data": {
    "workspace": {},
    "project": {},
    "sessions": [
      {
        "messages": [],
        "artifacts": []
      }
    ]
  }
}
```

Import a previously exported project graph:

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects/import \
  -H 'content-type: application/json' \
  -d @project-export.json
```

Import validates parent/child IDs for consistency. If a project with the imported ID already exists, it is replaced atomically with the imported graph.

Search:

```bash
curl -s -X POST http://127.0.0.1:3000/api/search \
  -H 'content-type: application/json' \
  -d '{"query":"SQLite"}'
```

Unified error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {}
  }
}
```
