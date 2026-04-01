# Multi-stage Dockerfile for Ghostwork

# ── Stage 1: Dependencies ──
FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/adapters/package.json packages/adapters/
COPY server/package.json server/
COPY cli/package.json cli/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ──
FROM deps AS build
COPY . .
RUN pnpm build

# ── Stage 3: Runtime ──
FROM node:22-slim AS runtime

# Install tini for proper PID 1 handling
RUN apt-get update && apt-get install -y --no-install-recommends tini && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r ghostwork && useradd -r -g ghostwork -m ghostwork

WORKDIR /app

# Copy built artifacts
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/node_modules ./server/node_modules

# Switch to non-root user
USER ghostwork

# Environment
ENV NODE_ENV=production
ENV GHOSTWORK_HOST=0.0.0.0
ENV GHOSTWORK_PORT=3100

EXPOSE 3100

# Use tini as PID 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "server/dist/index.js"]
