#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
backup_file="$backup_dir/wissen-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres pg_dump -U wissen -d wissen_code --format=custom > "$backup_file"
if [ ! -s "$backup_file" ]; then echo 'Backup is empty' >&2; exit 1; fi
printf 'Backup written: %s\n' "$backup_file"
