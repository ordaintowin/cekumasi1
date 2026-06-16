#!/bin/bash

cd "$(dirname "$0")"

echo "Clearing port 5000..."
fuser -k 5000/tcp 2>/dev/null || true
pkill -f "api-server" 2>/dev/null || true
sleep 1

echo "Building frontend..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/church-portal build

echo "Starting server on port 5000..."
PORT=5000 pnpm --filter @workspace/api-server dev
