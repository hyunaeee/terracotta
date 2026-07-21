# syntax=docker/dockerfile:1.7

FROM node:22.14.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    TERRACOTTA_DATA_DIR=/data \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false

WORKDIR /app

# The app is already bundled as a Worker. Only Wrangler is needed to host that
# Worker locally with durable D1 storage.
RUN npm install --global wrangler@4.92.0 \
    && groupadd --system terracotta \
    && useradd --system --gid terracotta --home-dir /app terracotta \
    && mkdir -p /data \
    && chown -R terracotta:terracotta /data /app

COPY --from=build --chown=terracotta:terracotta /app/dist ./dist
COPY --chown=terracotta:terracotta docker ./docker

RUN chmod +x /app/docker/entrypoint.sh

USER terracotta

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=4s --start-period=30s --retries=5 \
  CMD ["node", "/app/docker/healthcheck.mjs"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
