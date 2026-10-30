#!/bin/bash
set -euo pipefail

# Wait for Postgres to be ready
echo "Waiting for Postgres at ${DB_POSTGRESDB_HOST}:${DB_POSTGRESDB_PORT}..."
until pg_isready -h "${DB_POSTGRESDB_HOST}" -p "${DB_POSTGRESDB_PORT}" -U "${DB_POSTGRESDB_USER}" -d "${DB_POSTGRESDB_DATABASE}" > /dev/null 2>&1; do
  echo "Postgres not ready, waiting..."
  sleep 2
done
echo "Postgres is ready!"

# Run database migrations if needed
echo "Running n8n database migrations..."
n8n update:workflows --force || true

# Start n8n
echo "Starting n8n..."
exec n8n start