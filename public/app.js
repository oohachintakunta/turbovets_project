let token = localStorage.getItem('accessToken') || '';
let me = null;
let users = [];
let currentProject = null;
let projects = [];

const meDiv = document.getElementById('me');
const projectsSec = document.getElementById('projects');
const tasksSec = document.getElementById('tasks');
const projectListDiv = document.getElementById('projectList');
const taskListDiv = document.getElementById('taskList');
const currentProjectName = document.getElementById('currentProjectName');
const assigneeSelect = document.getElementById('taskAssignee');

function headers() {
  return token ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } : { 'Content-Type': 'application/json' };
}

async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) { alert('Login failed'); return; }
  const data = await res.json();
  token = data.accessToken;
  localStorage.setItem('accessToken', token);
  me = { id: data.id, name: data.name, role: data.role };
  meDiv.textContent = `Logged in as ${me.name} (${me.role})`;
  projectsSec.style.display = 'block';
  await loadUsers();
  await loadProjects();
}

function logout() {
  token = ''; localStorage.removeItem('accessToken'); me = null;
  meDiv.textContent = '';
  projectsSec.style.display = 'none';
  tasksSec.style.display = 'none';
}

async function loadUsers() {
  const res = await fetch('/api/users', { headers: headers() });
  if (!res.ok) return;
  users = await res.json();
  assigneeSelect.innerHTML = `<option value="">Unassigned</option>` + users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
}

async function loadProjects() {
  const res = await fetch('/api/projects', { headers: headers() });
  if (!res.ok) { alert('Failed to load projects'); return; }
  projects = await res.json();
  renderProjects();
}

function renderProjects() {
  projectListDiv.innerHTML = '';
  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div class="left">
        <strong>${p.name}</strong>
        <span class="muted">${p.id}</span>
      </div>
      <div class="row">
        <button class="secondary" onclick="openProject('${p.id}', '${p.name.replace(/'/g, "\\'")}')">Open</button>
      </div>`;
    projectListDiv.appendChild(div);
  });
}

async function createProject() {
  const name = document.getElementById('projectName').value.trim();
  if (!name) return;
  const res = await fetch('/api/projects', { method: 'POST', headers: headers(), body: JSON.stringify({ name }) });
  if (!res.ok) { const t = await res.json(); alert(t.message || 'Only ADMIN can create'); return; }
  document.getElementById('projectName').value='';
  loadProjects();
}

async function openProject(id, name) {
  currentProject = id;
  currentProjectName.textContent = name;
  tasksSec.style.display = 'block';
  await loadUsers();
  loadTasks();
}

let debounceTimer;
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadTasks, 250);
}

async function loadTasks() {
  if (!currentProject) return;
  const status = document.getElementById('filterStatus').value;
  const q = document.getElementById('searchQ').value.trim();
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const res = await fetch(`/api/projects/${currentProject}/tasks?` + params.toString(), { headers: headers() });
  if (!res.ok) { alert('Failed to load tasks'); return; }
  const tasks = await res.json();
  renderTasks(tasks);
}

function userName(id) {
  return users.find(u => u.id === id)?.name || '—';
}

function renderTasks(tasks) {
  taskListDiv.innerHTML = '';
  tasks.forEach(t => {
    const div = document.createElement('div');
    div.className = 'card';
    const due = t.due_date ? `Due: <span class="pill">${t.due_date}</span>` : 'No due date';
    const who = t.assignee_name ? `Assignee: <span class="pill">${t.assignee_name}</span>` : 'Unassigned';
    div.innerHTML = `<div class="left">
        <div><strong>${t.title}</strong></div>
        <div class="muted">Status: <span class="pill">${t.status}</span> • ${who} • ${due}</div>
      </div>
      <div class="row">
        <button class="secondary" onclick="mark('${t.id}','IN_PROGRESS')">▶</button>
        <button class="secondary" onclick="mark('${t.id}','DONE')">✓</button>
        <button onclick="editTask('${t.id}')">Edit</button>
        <button onclick="removeTask('${t.id}')">🗑</button>
      </div>`;
    taskListDiv.appendChild(div);
  });
}

async function createTask() {
  const title = document.getElementById('taskTitle').value.trim();
  const dueDate = document.getElementById('taskDue').value || null;
  const assigneeId = document.getElementById('taskAssignee').value || null;
  if (!title) return;
  const res = await fetch(`/api/projects/${currentProject}/tasks`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ title, dueDate, assigneeId })
  });
  if (!res.ok) { const t = await res.json(); alert(t.message || 'Only ADMIN/MANAGER can create'); return; }
  document.getElementById('taskTitle').value='';
  document.getElementById('taskDue').value='';
  document.getElementById('taskAssignee').value='';
  loadTasks();
}

async function mark(id, status) {
  const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ status }) });
  if (!res.ok) { const t = await res.json(); alert(t.message || 'Not allowed'); return; }
  loadTasks();
}

async function editTask(id) {
  const newTitle = prompt('New title (leave blank to keep):');
  const newDue = prompt('New due date (YYYY-MM-DD) or blank:');
  const newAssignee = prompt('New assignee userId (leave blank for unassigned):');
  const payload = {};
  if (newTitle !== null && newTitle.trim()) payload.title = newTitle.trim();
  if (newDue !== null) payload.dueDate = newDue.trim() || null;
  if (newAssignee !== null) payload.assigneeId = newAssignee.trim() || null;
  const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(payload) });
  if (!res.ok) { const t = await res.json(); alert(t.message || 'Not allowed'); return; }
  loadTasks();
}

async function removeTask(id) {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) { const t = await res.json(); alert(t.message || 'Only ADMIN/MANAGER can delete'); return; }
  loadTasks();
}

(async function init() {
  if (token) {
    meDiv.textContent = 'Token found.';
    try {
      await loadUsers();
      await loadProjects();
      projectsSec.style.display = 'block';
    } catch {}
  }
})();
