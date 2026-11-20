# syntax=docker/dockerfile:1
# Build context is the repo root (npm workspaces share one lockfile):
#   docker build -f backend/Dockerfile --target prod .
FROM node:26-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/

# ---------- dev: all deps, sources are bind-mounted by docker-compose.dev.yml ----------
FROM base AS dev
RUN --mount=type=cache,target=/root/.npm npm ci -w backend --include-workspace-root
ENV NODE_ENV=development
EXPOSE 4000
CMD ["npm", "run", "start:dev", "-w", "backend"]

# ---------- build ----------
FROM dev AS build
COPY backend backend
RUN npm run build -w backend

# ---------- production deps only ----------
FROM base AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci -w backend --omit=dev --include-workspace-root

# ---------- prod ----------
FROM node:26-alpine AS prod
ENV NODE_ENV=production PORT=4000
# prod-deps holds the workspace layout: hoisted /app/node_modules (+ any nested ones) and package.json files
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/backend/dist /app/backend/dist
WORKDIR /app/backend
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
