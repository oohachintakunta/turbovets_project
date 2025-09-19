# Mini Tasks+ (Simple Full‑Stack with Extras)

**Backend:** Node.js + Express + SQLite (better-sqlite3) + JWT  
**Frontend:** Static HTML + vanilla JS (served by Express)

**New vs earlier mini version:** assignee dropdown, due dates, search + status filter, edit dialog.

## Prereqs
- Node.js 18+ (20 recommended)

## Setup
```bash
npm install
npm run seed
npm start
```
Open **http://localhost:3000**

## Logins
- admin@tv.com / Password123!  _(ADMIN)_
- manager@tv.com / Password123!  _(MANAGER)_
- worker@tv.com / Password123!  _(WORKER)_

## API Highlights
- `POST /api/login` → JWT in response
- `GET /api/users` → list users (for assignee dropdown)
- `GET /api/projects` / `POST /api/projects`
- `GET /api/projects/:projectId/tasks?status=&q=`
- `POST /api/projects/:projectId/tasks { title, assigneeId?, dueDate? }`
- `PATCH /api/tasks/:id { title?, status?, assigneeId?, dueDate? }`
- `DELETE /api/tasks/:id`

## Reset
Delete `db_plus.sqlite`, then:
```bash
npm run seed
npm start
```
