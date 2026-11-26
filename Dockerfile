FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile --filter @openrucpe/api
COPY apps/api ./apps/api
RUN bun run build:api
# GitHub Actions writes a new marker on each deploy to invalidate the snapshot layer.
RUN if [ -f apps/api/snapshot-build-id ]; then \
      bun run data:build --target data/padron.sqlite --work-dir .work; \
    else \
      test -s apps/api/data/padron.sqlite; \
    fi

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/app/data/padron.sqlite PORT=3000
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/config.json ./config.json
COPY --from=build /app/apps/api/data/padron.sqlite ./data/padron.sqlite
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD bun -e 'const response = await fetch("http://127.0.0.1:" + (process.env.PORT ?? 3000) + "/health"); process.exit(response.ok ? 0 : 1)'
CMD ["bun", "dist/server.js"]
