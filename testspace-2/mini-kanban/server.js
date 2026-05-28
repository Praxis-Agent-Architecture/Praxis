const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATUSES = new Set(['todo', 'doing', 'done']);
const PRIORITIES = new Set(['low', 'medium', 'high']);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]\n');
  }
}

async function readTasks() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function writeTasks(tasks) {
  await ensureStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2) + '\n');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeTask(input, existing = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : existing.title;
  if (!title) throw new Error('Task title is required');

  const status = input.status ?? existing.status ?? 'todo';
  if (!STATUSES.has(status)) throw new Error('Status must be todo, doing, or done');

  const priority = input.priority ?? existing.priority ?? 'medium';
  if (!PRIORITIES.has(priority)) throw new Error('Priority must be low, medium, or high');

  const tags = Array.isArray(input.tags)
    ? input.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8)
    : Array.isArray(existing.tags) ? existing.tags : [];

  return {
    title,
    description: typeof input.description === 'string' ? input.description.trim() : (existing.description || ''),
    status,
    priority,
    tags
  };
}

function extractId(pathname) {
  const match = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function searchTasks(tasks, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter(task => [
    task.title,
    task.description,
    ...(Array.isArray(task.tags) ? task.tags : [])
  ].join(' ').toLowerCase().includes(q));
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, app: 'mini-kanban' });
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    const tasks = await readTasks();
    return sendJson(res, 200, searchTasks(tasks, url.searchParams.get('q')));
  }

  if (pathname === '/api/tasks' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        ...normalizeTask(body),
        createdAt: now,
        updatedAt: now
      };
      const tasks = await readTasks();
      tasks.push(task);
      await writeTasks(tasks);
      return sendJson(res, 201, task);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  const id = extractId(pathname);
  if (id && ['GET', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const tasks = await readTasks();
    const index = tasks.findIndex(task => task.id === id);
    if (index === -1) return sendError(res, 404, 'Task not found');

    if (req.method === 'GET') return sendJson(res, 200, tasks[index]);

    if (req.method === 'DELETE') {
      const [removed] = tasks.splice(index, 1);
      await writeTasks(tasks);
      return sendJson(res, 200, removed);
    }

    try {
      const body = await readBody(req);
      const updated = {
        ...tasks[index],
        ...normalizeTask(body, tasks[index]),
        updatedAt: new Date().toISOString()
      };
      tasks[index] = updated;
      await writeTasks(tasks);
      return sendJson(res, 200, updated);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  sendError(res, 404, 'API route not found');
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    sendError(res, 500, 'Internal server error');
  }
});

if (require.main === module) {
  ensureStore().then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Mini Kanban running at http://${HOST}:${PORT}`);
    });
  }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { server, readTasks, writeTasks, DATA_FILE };
