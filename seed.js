import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'db_plus.sqlite'));

function cuid() { return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

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
  due_date TEXT
);
`);

const pwd = await bcrypt.hash('Password123!', 10);

const users = [
  { email: 'admin@tv.com', name: 'Admin', role: 'ADMIN' },
  { email: 'manager@tv.com', name: 'Manager', role: 'MANAGER' },
  { email: 'worker@tv.com', name: 'Worker', role: 'WORKER' },
];

const idMap = {};
for (const u of users) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (!existing) {
    const id = cuid(); idMap[u.email] = id;
    db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, u.email, pwd, u.name, u.role);
  } else {
    idMap[u.email] = existing.id;
  }
}

let proj = db.prepare('SELECT id FROM projects WHERE name = ?').get('Onboarding');
if (!proj) {
  const pid = cuid();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(pid, 'Onboarding');
  proj = { id: pid };
  db.prepare('INSERT INTO tasks (id, project_id, title, status, assignee_id, due_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cuid(), pid, 'Create org policies', 'TODO', null, null);
  db.prepare('INSERT INTO tasks (id, project_id, title, status, assignee_id, due_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cuid(), pid, 'Set up clinic calendar', 'IN_PROGRESS', idMap['worker@tv.com'], new Date(Date.now()+86400000).toISOString().slice(0,10));
}

console.log('Seed complete. Users: admin@tv.com, manager@tv.com, worker@tv.com (Password123!)');
