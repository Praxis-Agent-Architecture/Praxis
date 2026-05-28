const assert = require('assert');
const fs = require('fs/promises');
const { server, DATA_FILE } = require('./server');

const base = 'http://127.0.0.1:3100';

function listen() {
  return new Promise(resolve => server.listen(3100, '127.0.0.1', resolve));
}

function close() {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  return { response, data };
}

(async () => {
  await fs.writeFile(DATA_FILE, '[]\n');
  await listen();
  try {
    let result = await request('/api/tasks');
    assert.strictEqual(result.response.status, 200);
    assert.deepStrictEqual(result.data, []);

    result = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '写测试', description: '覆盖 CRUD', tags: ['api', 'node'], priority: 'high' })
    });
    assert.strictEqual(result.response.status, 201);
    assert.ok(result.data.id);
    assert.strictEqual(result.data.status, 'todo');
    const id = result.data.id;

    result = await request('/api/tasks?q=node');
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.length, 1);
    assert.strictEqual(result.data[0].id, id);

    result = await request(`/api/tasks/${id}`);
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.title, '写测试');

    result = await request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: '写自动测试', description: '更新任务', status: 'doing', tags: ['updated'], priority: 'medium' })
    });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.title, '写自动测试');
    assert.strictEqual(result.data.status, 'doing');
    assert.strictEqual(result.data.priority, 'medium');

    result = await request(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '写自动测试', status: 'done' })
    });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.status, 'done');

    result = await request(`/api/tasks/${id}`, { method: 'DELETE' });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.id, id);

    result = await request('/api/tasks');
    assert.strictEqual(result.response.status, 200);
    assert.deepStrictEqual(result.data, []);

    console.log('All API CRUD tests passed');
  } finally {
    await close();
  }
})().catch(async error => {
  console.error(error);
  try { await close(); } catch {}
  process.exit(1);
});
