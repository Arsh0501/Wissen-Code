#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ] || [ "$1" != '--replace-database' ] || [ ! -f "$2" ]; then
  echo 'Usage: bash scripts/restore.sh --replace-database path/to/backup.dump' >&2
  exit 1
fi
# Stop API and workers before restoring. This command replaces the target database contents.
docker compose exec -T postgres pg_restore -U wissen -d wissen_code --clean --if-exists --no-owner --exit-on-error < "$2"
echo 'Database restored. Run migrations and verify the application before restarting traffic.'
