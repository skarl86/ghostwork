# Ghostwork — API Reference

Base URL: `http://localhost:3100/api`

## Authentication

### Modes

| Mode | Description |
|------|-------------|
| `local_trusted` | All loopback requests are treated as board admin (default) |
| `authenticated` | Requires session token or API key |

### Auth Headers

```
Authorization: Bearer <session-token>
Authorization: Bearer <api-key>
```

---

## Health

### GET /api/health

Returns system health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "db": {
    "status": "connected",
    "latencyMs": 2
  },
  "migrations": {
    "pendingCount": 0
  },
  "scheduler": "running",
  "memory": {
    "rss": 64,
    "heapUsed": 32,
    "heapTotal": 48,
    "external": 2
  },
  "uptime": {
    "seconds": 3600,
    "human": "1h 0m 0s"
  }
}
```

---

## Auth

### POST /api/auth/signup

Create a new account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name"
}
```

**Response:** `200`
```json
{
  "token": "abc123...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "name": "User Name",
    "provider": "email"
  }
}
```

### POST /api/auth/signin

Sign in with existing credentials.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### POST /api/auth/signout

End the current session.

### GET /api/auth/session

Get current session info. Requires `Authorization` header.

---

## Companies

### POST /api/companies

Create a new company.

**Body:**
```json
{
  "name": "My Company",
  "description": "Optional description"
}
```

**Response:** `200`
```json
{
  "id": "uuid",
  "name": "My Company",
  "description": "Optional description",
  "status": "active",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

### GET /api/companies

List all companies.

### GET /api/companies/:id

Get a company by ID.

### PATCH /api/companies/:id

Update a company.

### DELETE /api/companies/:id

Delete a company.

---

## Agents

### POST /api/agents

Create a new agent.

**Body:**
```json
{
  "companyId": "uuid",
  "name": "Agent Name",
  "adapterType": "claude-local",
  "role": "general",
  "title": "Senior Developer",
  "adapterConfig": {},
  "runtimeConfig": { "intervalSec": 300 }
}
```

### GET /api/agents?companyId=uuid

List agents for a company.

### GET /api/agents/:id

Get an agent by ID.

### PATCH /api/agents/:id

Update an agent.

---

## Issues

### POST /api/issues

Create a new issue.

**Body:**
```json
{
  "companyId": "uuid",
  "title": "Fix the bug",
  "description": "Detailed description",
  "priority": "high",
  "assigneeAgentId": "uuid",
  "projectId": "uuid"
}
```

### GET /api/issues?companyId=uuid

List issues for a company. Supports filters: `status`, `assigneeAgentId`, `projectId`.

### GET /api/issues/:id

Get an issue by ID.

### PATCH /api/issues/:id

Update an issue.

---

## Goals

### POST /api/goals

Create a new goal.

**Body:**
```json
{
  "companyId": "uuid",
  "title": "Ship v1.0",
  "level": "company",
  "description": "Launch the product"
}
```

### GET /api/goals?companyId=uuid

List goals for a company.

---

## Projects

### POST /api/projects

Create a new project.

### GET /api/projects?companyId=uuid

List projects for a company.

---

## Heartbeat

### POST /api/heartbeat/wakeup

Manually trigger an agent wakeup.

**Body:**
```json
{
  "companyId": "uuid",
  "agentId": "uuid",
  "reason": "manual"
}
```

### POST /api/heartbeat/runs

List heartbeat runs.

**Body:**
```json
{
  "companyId": "uuid"
}
```

---

## Budgets

### GET /api/budgets?companyId=uuid

List budget policies.

### POST /api/budgets

Create a budget policy.

---

## Secrets

### POST /api/secrets

Create a secret.

### GET /api/secrets?companyId=uuid

List secrets (names only, not values).

---

## Approvals

### GET /api/approvals?companyId=uuid

List pending approvals.

### POST /api/approvals/:id/decide

Approve or reject.

---

## Activity

### GET /api/activity?companyId=uuid

List activity log entries.

---

## Portability (Export/Import)

### POST /api/companies/:companyId/exports/preview

Preview what will be exported.

**Response:**
```json
{
  "company": { "id": "uuid", "name": "Corp" },
  "counts": {
    "agents": 3,
    "projects": 2,
    "issues": 15,
    "goals": 4,
    "routines": 1,
    "routineTriggers": 2,
    "budgetPolicies": 1,
    "projectWorkspaces": 2
  }
}
```

### POST /api/companies/:companyId/exports

Execute export. Returns full JSON package.

### POST /api/imports/preview

Preview import. Upload the export JSON as body.

### POST /api/imports

Execute import.

**Body:**
```json
{
  "data": { "...export package..." },
  "strategy": "rename"
}
```

---

## Plugins

### GET /api/plugins

List registered plugins.

### POST /api/plugins/:id/enable

Enable a plugin.

### POST /api/plugins/:id/disable

Disable a plugin.

### GET /api/plugins/:id/state

Get plugin state.

### POST /api/plugins/:id/data

Query plugin-provided data.

---

## WebSocket

### WS /api/companies/:companyId/events/ws

Real-time event stream. Messages are JSON:

```json
{
  "type": "heartbeat.run.status",
  "companyId": "uuid",
  "payload": { "runId": "uuid", "status": "completed" },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

Event types:
- `heartbeat.run.status` — Run status changes
- `heartbeat.run.event` — Run events (tool calls, etc.)
- `heartbeat.run.log` — Streaming log output
- `heartbeat.run.queued` — Run queued
- `agent.status` — Agent status changes
- `activity.logged` — Activity log entries
