import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_super_secret_change_me';

// DB
const db = new Database(path.join(__dirname, 'db_plus.sqlite'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','WORKER'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('TODO','IN_PROGRESS','DONE')) DEFAULT 'TODO',
  assignee_id TEXT,
  due_date TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(assignee_id) REFERENCES users(id)
);
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function cuid() { return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

function auth(req, res, next) {
  const hdr = req.headers['authorization'] || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

const isAdmin = (u) => u.role === 'ADMIN';
const isAdminOrManager = (u) => u.role === 'ADMIN' || u.role === 'MANAGER';

// Auth
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email & password required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ sub: row.id, email: row.email, name: row.name, role: row.role }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ accessToken: token, role: row.role, name: row.name, id: row.id });
});

// Users (for assignee dropdown)
app.get('/api/users', auth, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, role FROM users ORDER BY role, name').all();
  res.json(rows);
});

// Projects
app.get('/api/projects', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY name').all();
  res.json(rows);
});
app.post('/api/projects', auth, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only ADMIN can create projects' });
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'name required' });
  const id = cuid();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name.trim());
  res.status(201).json({ id, name });
});

// Tasks
app.get('/api/projects/:projectId/tasks', auth, (req, res) => {
  const { projectId } = req.params;
  const { status, q } = req.query;
  let sql = 'SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.project_id = ?';
  const params = [projectId];
  if (status && ['TODO','IN_PROGRESS','DONE'].includes(status)) {
    sql += ' AND t.status = ?'; params.push(status);
  }
  if (q && String(q).trim()) {
    sql += ' AND t.title LIKE ?'; params.push('%' + String(q).trim() + '%');
  }
  sql += ' ORDER BY t.due_date IS NULL, t.due_date ASC, t.rowid DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/projects/:projectId/tasks', auth, (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ message: 'Only ADMIN/MANAGER can create tasks' });
  const { projectId } = req.params;
  const { title, assigneeId, dueDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ message: 'title required' });
  const id = cuid();
  db.prepare('INSERT INTO tasks (id, project_id, title, status, assignee_id, due_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, projectId, title.trim(), 'TODO', assigneeId || null, dueDate || null);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Not found' });
  if (req.user.role === 'WORKER' && task.assignee_id !== req.user.sub) {
    return res.status(403).json({ message: 'Workers can update only their own tasks' });
  }
  const title = req.body.title ?? task.title;
  const status = ['TODO','IN_PROGRESS','DONE'].includes(req.body.status) ? req.body.status : task.status;
  const assignee = req.body.assigneeId === undefined ? task.assignee_id : (req.body.assigneeId || null);
  const due = req.body.dueDate === undefined ? task.due_date : (req.body.dueDate || null);
  db.prepare('UPDATE tasks SET title = ?, status = ?, assignee_id = ?, due_date = ? WHERE id = ?').run(title, status, assignee, due, id);
  const updated = db.prepare('SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?').get(id);
  res.json(updated);
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ message: 'Only ADMIN/MANAGER can delete tasks' });
  const { id } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Mini Tasks+ on http://localhost:${PORT}`));
