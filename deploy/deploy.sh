#!/usr/bin/env bash
#
# Выкладка Molfi на сервер. Запускается на самом сервере от пользователя ai:
#
#   cd ~/molfi && ./deploy/deploy.sh
#
# Что делает: забирает изменения, ставит зависимости, гонит миграцию,
# собирает клиент и админку, перезапускает службу и проверяет, что API
# отвечает. Если что-то падает — останавливается на этом месте, а не
# доводит выкладку до конца с наполовину собранным фронтендом.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mОШИБКА:\033[0m %s\n' "$1" >&2; exit 1; }

[ -f server/.env ] || die "нет server/.env — скопируйте из server/.env.example и заполните"

# Резервная копия базы до миграции. Миграция идемпотентна и ничего не
# удаляет, но структуру она меняет, а откатывать нечем, если копии нет.
say "Резервная копия базы"
mkdir -p ~/backups
STAMP=$(date +%Y-%m-%d_%H%M)
set -a; . server/.env; set +a
PGPASSWORD="$DB_PASSWORD" pg_dump -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" \
  -U "$DB_USER" "$DB_NAME" | gzip > ~/backups/molfi_$STAMP.sql.gz \
  || die "не удалось снять дамп — проверьте доступ к базе"
echo "  ~/backups/molfi_$STAMP.sql.gz ($(du -h ~/backups/molfi_$STAMP.sql.gz | cut -f1))"
# Держим последние 14 копий, остальные удаляем
ls -1t ~/backups/molfi_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

say "Забираем изменения"
git pull --ff-only

say "Зависимости и миграция"
( cd server && npm ci --omit=dev && npm run migrate )

say "Сборка клиента"
( cd apps/web && npm ci && npm run build )

say "Сборка админки"
( cd apps/admin && npm ci && npm run build )

say "Перезапуск API"
sudo systemctl restart molfi-api
sleep 3

say "Проверка"
systemctl is-active --quiet molfi-api || die "служба не поднялась: journalctl -u molfi-api -n 50"
curl -fsS http://127.0.0.1:3000/api/models > /dev/null \
  || die "API не отвечает: journalctl -u molfi-api -n 50"

echo
echo "Готово. Выложена версия $(git rev-parse --short HEAD)"
