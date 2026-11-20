# syntax=docker/dockerfile:1
# Build context is the repo root:
#   docker build -f frontend/Dockerfile --target prod --build-arg BACKEND_URL=http://backend:4000 .
FROM node:26-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/

# ---------- dev: sources are bind-mounted by docker-compose.dev.yml ----------
FROM base AS dev
RUN --mount=type=cache,target=/root/.npm npm ci -w frontend --include-workspace-root
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "frontend", "--", "--hostname", "0.0.0.0"]

# ---------- build ----------
FROM dev AS build
# next.config.ts rewrites() is evaluated at build time: the API address is baked into the image
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL NODE_ENV=production
COPY frontend frontend
RUN npm run build -w frontend

# ---------- prod: Next.js standalone output ----------
FROM node:26-alpine AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone keeps the monorepo layout: /app/frontend/server.js + traced node_modules
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
