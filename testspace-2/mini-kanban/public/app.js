const statuses = [
  { id: 'todo', title: 'Todo' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' }
];

let tasks = [];
let query = '';

const $ = selector => document.querySelector(selector);
const board = $('#board');
const taskList = $('#taskList');
const form = $('#taskForm');

function filteredTasks() {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter(task => [task.title, task.description, ...(task.tags || [])].join(' ').toLowerCase().includes(q));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function loadTasks() {
  tasks = await api('/api/tasks');
  render();
}

function render() {
  renderList();
  renderBoard();
}

function renderList() {
  const items = filteredTasks();
  taskList.innerHTML = items.length ? items.map(task => `
    <li data-edit="${task.id}">
      <strong>${escapeHtml(task.title)}</strong>
      <small>${task.status} · ${task.priority} · ${(task.tags || []).join(', ') || '无标签'}</small>
    </li>`).join('') : '<li><span>暂无匹配任务</span></li>';
}

function renderBoard() {
  const visible = filteredTasks();
  board.innerHTML = statuses.map(status => {
    const columnTasks = visible.filter(task => task.status === status.id);
    return `
      <section class="column" data-status="${status.id}">
        <div class="column-header"><strong>${status.title}</strong><span>${columnTasks.length}</span></div>
        <div class="cards">
          ${columnTasks.length ? columnTasks.map(cardTemplate).join('') : '<div class="empty">拖拽任务到这里</div>'}
        </div>
      </section>`;
  }).join('');
}

function cardTemplate(task) {
  return `
    <article class="card" draggable="true" data-id="${task.id}">
      <h3>${escapeHtml(task.title)}</h3>
      <p>${escapeHtml(task.description || '无描述')}</p>
      <div class="meta">
        <span class="pill priority-${task.priority}">${priorityText(task.priority)}</span>
        ${(task.tags || []).map(tag => `<span class="pill">#${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="card-actions">
        <button type="button" data-edit="${task.id}">编辑</button>
        <button type="button" class="delete" data-delete="${task.id}">删除</button>
      </div>
    </article>`;
}

function priorityText(priority) {
  return { low: '低', medium: '中', high: '高' }[priority] || priority;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function fillForm(task) {
  $('#taskId').value = task.id || '';
  $('#title').value = task.title || '';
  $('#description').value = task.description || '';
  $('#tags').value = (task.tags || []).join(', ');
  $('#priority').value = task.priority || 'medium';
  $('#status').value = task.status || 'todo';
  $('#title').focus();
}

function resetForm() {
  form.reset();
  $('#taskId').value = '';
  $('#priority').value = 'medium';
  $('#status').value = 'todo';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('#taskId').value;
  const payload = {
    title: $('#title').value,
    description: $('#description').value,
    tags: $('#tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    priority: $('#priority').value,
    status: $('#status').value
  };
  await api(id ? `/api/tasks/${id}` : '/api/tasks', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });
  resetForm();
  await loadTasks();
});

$('#resetForm').addEventListener('click', resetForm);
$('#searchInput').addEventListener('input', event => { query = event.target.value; render(); });
$('#themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('mini-kanban-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

if (localStorage.getItem('mini-kanban-theme') === 'dark') document.body.classList.add('dark');

document.addEventListener('click', async event => {
  const editId = event.target.closest('[data-edit]')?.dataset.edit;
  const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
  if (editId) {
    const task = tasks.find(item => item.id === editId);
    if (task) fillForm(task);
  }
  if (deleteId && confirm('确定删除这个任务吗？')) {
    await api(`/api/tasks/${deleteId}`, { method: 'DELETE' });
    await loadTasks();
  }
});

document.addEventListener('dragstart', event => {
  const card = event.target.closest('.card');
  if (!card) return;
  event.dataTransfer.setData('text/plain', card.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragover', event => {
  const column = event.target.closest('.column');
  if (!column) return;
  event.preventDefault();
  column.classList.add('drag-over');
});

document.addEventListener('dragleave', event => {
  const column = event.target.closest('.column');
  if (column) column.classList.remove('drag-over');
});

document.addEventListener('drop', async event => {
  const column = event.target.closest('.column');
  if (!column) return;
  event.preventDefault();
  column.classList.remove('drag-over');
  const id = event.dataTransfer.getData('text/plain');
  const task = tasks.find(item => item.id === id);
  if (task && task.status !== column.dataset.status) {
    await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ ...task, status: column.dataset.status }) });
    await loadTasks();
  }
});

loadTasks().catch(error => alert(error.message));
