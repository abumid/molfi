#!/usr/bin/env bash
#
# Deploying Molfi to the server. Run on the server itself as user ai:
#
#   cd ~/molfi && ./deploy/deploy.sh
#
# What it does: pulls changes, installs dependencies, runs the migration,
# builds the client and the admin panel, restarts the service and checks that
# the API answers. If anything fails it stops right there rather than finishing
# the deploy with a half-built front end.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

[ -f server/.env ] || die "server/.env is missing — copy it from server/.env.example and fill it in"

# Database backup taken before the migration. The migration is idempotent and
# deletes nothing, but it does change the structure, and there is no way back
# without a copy.
mkdir -p ~/backups
STAMP=$(date +%Y-%m-%d_%H%M)
set -a; . server/.env; set +a
PGPASSWORD="$DB_PASSWORD" pg_dump -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" \
  -U "$DB_USER" "$DB_NAME" | gzip > ~/backups/molfi_$STAMP.sql.gz \
  || die "could not take the dump — check database access"
echo "  ~/backups/molfi_$STAMP.sql.gz ($(du -h ~/backups/molfi_$STAMP.sql.gz | cut -f1))"
# Keep the last 14 copies, delete the rest
ls -1t ~/backups/molfi_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

say "Pulling changes"
git pull --ff-only

say "Dependencies and migration"
( cd server && npm ci --omit=dev && npm run migrate )

say "Building the client"
( cd apps/web && npm ci && npm run build )

say "Building the admin panel"
( cd apps/admin && npm ci && npm run build )

say "Restarting the API"
sudo systemctl restart molfi-api
sleep 3

say "Checking"
systemctl is-active --quiet molfi-api || die "the service did not come up: journalctl -u molfi-api -n 50"
curl -fsS http://127.0.0.1:3000/api/models > /dev/null \
  || die "the API is not responding: journalctl -u molfi-api -n 50"

echo
echo "Done. Deployed version $(git rev-parse --short HEAD)"
