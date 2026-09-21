#!/bin/bash
# Одна резервная копия БД: pg_dump → gzip → age (шифрование публичным ключом) →
# локальный каталог + выгрузка на удалённое хранилище (по умолчанию Яндекс Диск по WebDAV).
# На сервере хранится только ПУБЛИЧНЫЙ ключ: расшифровать копии может лишь владелец приватного.
#
# Все настройки — переменные окружения (см. .env.example). Ручной запуск:
#   docker compose run --rm backup /app/backup.sh
set -euo pipefail

log() { echo "[$(date '+%F %T')] $*"; }

: "${BACKUP_AGE_PUBLIC_KEY:?не задан BACKUP_AGE_PUBLIC_KEY (публичный ключ age для шифрования копий)}"
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-14}"
KEEP_REMOTE_DAYS="${BACKUP_KEEP_REMOTE_DAYS:-90}"

# Куда выгружать. По умолчанию — WebDAV Яндекс Диска, путь берётся из BACKUP_REMOTE_DIR.
# Можно переопределить любым rclone-адресом через BACKUP_REMOTE (например, для проверки на локальный каталог).
if [[ -z "${BACKUP_REMOTE:-}" ]]; then
    : "${BACKUP_WEBDAV_USER:?не задан BACKUP_WEBDAV_USER}"
    : "${BACKUP_WEBDAV_PASSWORD:?не задан BACKUP_WEBDAV_PASSWORD (пароль приложения Яндекса)}"
    : "${BACKUP_REMOTE_DIR:?не задан BACKUP_REMOTE_DIR (папка на диске для копий)}"
    export RCLONE_CONFIG_YADISK_TYPE=webdav
    export RCLONE_CONFIG_YADISK_URL="${BACKUP_WEBDAV_URL:-https://webdav.yandex.ru}"
    export RCLONE_CONFIG_YADISK_VENDOR=other
    export RCLONE_CONFIG_YADISK_USER="$BACKUP_WEBDAV_USER"
    RCLONE_CONFIG_YADISK_PASS="$(rclone obscure "$BACKUP_WEBDAV_PASSWORD")"
    export RCLONE_CONFIG_YADISK_PASS
    BACKUP_REMOTE="yadisk:${BACKUP_REMOTE_DIR#/}"
fi

mkdir -p "$BACKUP_DIR"
name="equipment-tracker-$(date +%Y%m%d-%H%M%S).sql.gz.age"
tmp="$BACKUP_DIR/$name.part"
final="$BACKUP_DIR/$name"

log "Создаю дамп базы $PGDATABASE ..."
# pipefail: сбой pg_dump/gzip/age в любом звене завершит скрипт, недописанный файл удалится
trap 'rm -f "$tmp"' ERR
pg_dump --no-owner --no-privileges --clean --if-exists \
    | gzip -9 \
    | age -r "$BACKUP_AGE_PUBLIC_KEY" > "$tmp"
mv "$tmp" "$final"
trap - ERR
log "Готово: $final ($(du -h "$final" | cut -f1))"

log "Выгружаю в $BACKUP_REMOTE ..."
rclone copyto "$final" "$BACKUP_REMOTE/$name" --retries 3
# Убеждаемся, что файл на месте и совпадает по размеру
remote_size="$(rclone size --json "$BACKUP_REMOTE/$name" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p' || true)"
local_size="$(stat -c %s "$final")"
if [[ "$remote_size" != "$local_size" ]]; then
    log "ОШИБКА: размер на удалённом хранилище ($remote_size) не совпал с локальным ($local_size)"
    exit 1
fi
log "Выгрузка подтверждена"

# Ротация: локально — последние N копий, на удалённом — не старше KEEP_REMOTE_DAYS дней
ls -1t "$BACKUP_DIR"/equipment-tracker-*.sql.gz.age 2>/dev/null | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm --
rclone delete "$BACKUP_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --include "equipment-tracker-*.sql.gz.age" \
    || log "Предупреждение: не удалось почистить старые копии на удалённом хранилище"

date +%s > "$BACKUP_DIR/.last-success"
log "Резервное копирование завершено"
