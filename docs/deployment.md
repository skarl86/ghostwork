# Ghostwork — Deployment Guide

## Local Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+ (or use embedded PG)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd ghostwork
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start dev server (uses embedded PostgreSQL)
cd server
pnpm dev
```

The server starts on `http://localhost:3100` by default.

### CLI

```bash
# After build, use the CLI
cd cli
node dist/bin.js company list
node dist/bin.js company create --name "My Company"
node dist/bin.js agent create --company <id> --name "Agent" --adapter mock
```

---

## Docker Deployment

### Quick Start

```bash
docker compose up -d
```

This starts:
- **postgres** — PostgreSQL 16 database
- **app** — Ghostwork server on port 3100

### Build Only

```bash
docker build -t ghostwork .
```

### Custom Configuration

```bash
docker compose up -d \
  -e GHOSTWORK_MODE=authenticated \
  -e GHOSTWORK_AUTH_SECRET=your-secret-here
```

---

## Production PostgreSQL

### Connection

Set the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgres://user:password@host:5432/ghostwork
```

### Migrations

Migrations run automatically when `GHOSTWORK_MIGRATION_AUTO_APPLY=true`.

For manual migration control:
```bash
# Check migration status
GHOSTWORK_MIGRATION_AUTO_APPLY=false node server/dist/index.js
# The health endpoint reports pending migration count
```

### Recommended Settings

```
# postgresql.conf
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GHOSTWORK_PORT` | `3100` | Server port |
| `GHOSTWORK_HOST` | `127.0.0.1` | Bind address |
| `DATABASE_URL` | (embedded) | PostgreSQL connection URL |
| `GHOSTWORK_MODE` | `local_trusted` | Auth mode: `local_trusted` or `authenticated` |
| `GHOSTWORK_MIGRATION_AUTO_APPLY` | `false` | Auto-apply migrations on start |
| `GHOSTWORK_LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `GHOSTWORK_AGENT_JWT_SECRET` | (none) | Secret for agent JWT tokens |
| `GHOSTWORK_AUTH_SECRET` | `dev-auth-secret` | Secret for session auth |
| `GHOSTWORK_SECRETS_KEY` | (random) | 32-byte hex key for encrypting secrets |
| `NODE_ENV` | (none) | Set to `production` for production mode |

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│   CLI/UI    │────▶│   Fastify    │────▶│ PostgreSQL│
│             │     │   Server     │     │           │
└─────────────┘     │              │     └───────────┘
                    │  ┌─────────┐ │
                    │  │Scheduler│ │
                    │  └─────────┘ │
                    │  ┌─────────┐ │
                    │  │  WS Hub │ │
                    │  └─────────┘ │
                    │  ┌─────────┐ │
                    │  │ Plugins │ │
                    │  └─────────┘ │
                    └──────────────┘
```

### Security Notes

1. **Never expose the server directly to the internet** without proper auth configuration
2. Set `GHOSTWORK_MODE=authenticated` in production
3. Use strong, unique values for all secret environment variables
4. Use HTTPS via a reverse proxy (nginx, Caddy, etc.)
5. Rotate API keys and secrets periodically
