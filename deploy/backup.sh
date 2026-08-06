#!/bin/sh
# DSAT LMS v2 — Database backup
# Domain: Deploy
#
# Runs inside the `backup` service (docker-compose.prod.yml). One compressed
# pg_dump per run, oldest pruned past the retention window.
#
# Two things here are the whole point, and both are the difference between a
# backup and the belief that there is one:
#
#   1. The dump is written to a TEMPORARY name and only moved into place once
#      pg_dump exits 0. A crashed dump otherwise leaves a truncated .sql.gz that
#      looks exactly like a good one in `ls`, and the way you find out is on the
#      day you need it.
#   2. Pruning happens only AFTER a successful dump. Prune first and a week of
#      failures quietly deletes every backup you have.
#
# Restore (the command nobody writes down until it is 3am):
#   gunzip -c backup-YYYY-MM-DD.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T postgres psql -U dsat -d dsat_db

set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=dsat}"
: "${POSTGRES_DB:=dsat_db}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"

stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
target="$BACKUP_DIR/backup-$stamp.sql.gz"
partial="$target.partial"
failed="$BACKUP_DIR/.dump-failed"

echo "[backup] dumping $POSTGRES_DB -> $target"
mkdir -p "$BACKUP_DIR"
rm -f "$failed"

# The status of `a | b` is b's, so `if pg_dump | gzip` reports on GZIP — which
# happily succeeds at compressing a failed dump's empty output. POSIX sh has no
# pipefail, so pg_dump records its own failure in a file. (This was not a
# hypothetical: the first version of this script passed its exit check while
# pg_dump was erroring, and only the size floor below caught it.)
( pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-owner --no-acl || touch "$failed" ) | gzip -9 > "$partial"

if [ -f "$failed" ]; then
    rm -f "$partial" "$failed"
    echo "[backup] FAILED — pg_dump errored; nothing pruned" >&2
    exit 1
fi
mv "$partial" "$target"

# Second net, for a dump that "succeeded" into nothing.
size=$(wc -c < "$target" | tr -d ' ')
if [ "$size" -lt 1024 ]; then
    echo "[backup] FAILED — dump is only ${size} bytes" >&2
    rm -f "$target"
    exit 1
fi

echo "[backup] ok (${size} bytes); pruning past ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'backup-*.sql.gz' -type f -mtime "+$BACKUP_RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name '*.partial' -type f -mtime +1 -delete
