FROM node:26.13.0-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" \
    && pnpm install --frozen-lockfile --strict-peer-dependencies
ENV NEXT_TELEMETRY_DISABLED=1 DATA_SOURCE=mock DESK_STANDALONE=1
RUN cd apps/web && node -e "const r = require('node:module').createRequire(require.resolve('next/package.json')); r('@next/swc-linux-' + process.arch + '-gnu'); r('sharp')"
RUN mkdir -p apps/web/public && pnpm build

FROM node:26.13.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DESK_CONTAINER_ROLE=web
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --chown=node:node scripts/docker/secrets.mjs scripts/docker/preload.mjs ./scripts/docker/
USER node
EXPOSE 3000
CMD ["node", "--import", "./scripts/docker/preload.mjs", "apps/web/server.js"]
