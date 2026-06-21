#!/usr/bin/env bash
set -e

echo "=== Installing dependencies ==="
pnpm install --no-frozen-lockfile

echo "=== Building church-portal ==="
cd church-portal
PORT=3000 BASE_PATH=/ node node_modules/vite/bin/vite.js build --config vite.config.ts
cd ..

echo "=== Building api-server ==="
pnpm --filter @workspace/api-server build

echo "=== Build complete ==="
