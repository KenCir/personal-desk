FROM node:26.13.0-bookworm-slim AS dependencies
WORKDIR /app
COPY . .
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" \
    && pnpm install --frozen-lockfile --strict-peer-dependencies \
    && rm -rf /app/.pnpm-store

# Explicitly invoked one-off operations only. No scheduled Worker command here.
FROM dependencies AS maintenance
ENV NODE_ENV=production DESK_CONTAINER_ROLE=maintenance
USER node
ENTRYPOINT ["node", "--import", "./scripts/docker/preload.mjs", "scripts/docker/maintenance.mjs"]

FROM node:26.13.0-bookworm-slim AS production-dependencies
WORKDIR /app
COPY . .
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" \
    && pnpm --filter @personal-desk/worker... install --prod --frozen-lockfile --strict-peer-dependencies \
    && rm -rf /app/.pnpm-store

FROM node:26.13.0-bookworm-slim AS runtime
WORKDIR /app/apps/worker
COPY --from=production-dependencies --chown=node:node /app /app
ENV NODE_ENV=production DESK_CONTAINER_ROLE=worker WORKER_HEARTBEAT_FILE=/tmp/worker-heartbeat.json
USER node
ENTRYPOINT ["node", "--import", "/app/scripts/docker/preload.mjs", "--import", "tsx", "src/main.ts"]
