# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api-server/package.json ./api-server/
COPY church-portal/package.json ./church-portal/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build frontend ────────────────────────────────────────────────────
FROM deps AS frontend-build
COPY church-portal ./church-portal
COPY packages ./packages
ARG VITE_BASE_PATH=/
ENV PORT=3000 BASE_PATH=${VITE_BASE_PATH}
RUN pnpm --filter @workspace/church-portal build

# ── Stage 3: Build API server ──────────────────────────────────────────────────
FROM deps AS api-build
COPY api-server ./api-server
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm --filter @workspace/api-server build

# ── Stage 4: Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN npm install -g pnpm@10

ENV NODE_ENV=production

# Copy workspace manifests so pnpm can resolve workspaces
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api-server/package.json ./api-server/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=api-build /app/api-server/dist ./api-server/dist
COPY --from=frontend-build /app/church-portal/dist ./church-portal/dist

EXPOSE 3000

ENV PORT=3000

CMD ["node", "--enable-source-maps", "api-server/dist/index.mjs"]
