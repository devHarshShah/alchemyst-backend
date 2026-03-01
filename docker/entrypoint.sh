#!/bin/sh
set -e

echo "Waiting for database TCP connectivity..."
node <<'NODE'
const { URL } = require('node:url');
const net = require('node:net');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is missing');
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);
let retries = 30;

function tryConnect() {
  const socket = new net.Socket();
  socket.setTimeout(1500);

  socket.once('connect', () => {
    socket.destroy();
    process.exit(0);
  });

  socket.once('timeout', onFail);
  socket.once('error', onFail);

  socket.connect(port, host);
}

function onFail() {
  retries -= 1;
  if (retries <= 0) {
    console.error(`Database TCP check failed for ${host}:${port}`);
    process.exit(1);
  }
  setTimeout(tryConnect, 1000);
}

tryConnect();
NODE

echo "Running Prisma migrations..."
retries=30
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
