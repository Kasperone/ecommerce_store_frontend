# syntax=docker/dockerfile:1
#
# Production image for the Nuxt 4 SSR frontend.
# `nuxt build` emits a self-contained Nitro node-server in `.output/` (deps
# bundled), so the runtime stage needs only `.output` — no node_modules, no
# source. The image is environment-agnostic: the platform injects runtime config
# (e.g. NUXT_PUBLIC_API_BASE) as env vars at start, so no build-time secrets.
#
# NOTE: not yet built in CI/locally (no Docker daemon on the dev box) — it will
# be exercised when the deploy pipeline (workstream E) runs it.

# ---- Build stage ----
FROM node:24-slim AS build
WORKDIR /app

# Install against the lockfile first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build

# ---- Runtime stage ----
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Only the built Nitro server is needed at runtime.
COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

# Node 24 ships a global fetch — no curl/wget needed in the slim image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
