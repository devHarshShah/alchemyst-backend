#!/bin/sh
set -e

echo "Running Prisma migrations..."
retries=15
until pnpm prisma migrate deploy; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "Prisma migrate deploy failed after retries"
    exit 1
  fi
  echo "Database not ready yet, retrying... ($retries left)"
  sleep 2
done

echo "Starting Fastify app..."
exec pnpm fastify start -l info -a "${HOST:-0.0.0.0}" -p "${PORT:-4000}" dist/app.js
