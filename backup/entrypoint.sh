#!/bin/bash
# Запускает backup.sh каждый день в BACKUP_HOUR (по времени BACKUP_TIMEZONE, по умолчанию Europe/Moscow).
# Сбой копии не останавливает контейнер — следующая попытка на следующий день. О сбое (и о том, что
# всё снова работает) приходит письмо, если задан BACKUP_NOTIFY_TO.
set -uo pipefail

export TZ="${BACKUP_TIMEZONE:-Europe/Moscow}"
HOUR="${BACKUP_HOUR:-3}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
FAILING_MARK="$BACKUP_DIR/.failing"   # есть, пока последняя попытка была неудачной
RUN_LOG="/tmp/last-run.log"

log() { echo "[$(date '+%F %T')] $*"; }

mkdir -p "$BACKUP_DIR"

# Резервное копирование не настроено вовсе (ничего из ключевых параметров не задано) — это штатная
# ситуация: контейнер просто простаивает, ничего не делает и не перезапускается.
# Частично заполненные настройки, наоборот, считаются ошибкой (см. ниже).
if [[ -z "${BACKUP_AGE_PUBLIC_KEY:-}" && -z "${BACKUP_WEBDAV_USER:-}" && -z "${BACKUP_WEBDAV_PASSWORD:-}" && -z "${BACKUP_REMOTE:-}" ]]; then
    log "Резервное копирование не настроено (BACKUP_* в .env пусты) — отключено. Уведомления тоже не отправляются."
    exec tail -f /dev/null
fi

# Проверяем настройки сразу при старте, чтобы ошибка была видна в `docker compose logs backup`
missing=()
for v in BACKUP_AGE_PUBLIC_KEY PGHOST PGUSER PGPASSWORD PGDATABASE; do
    [[ -n "${!v:-}" ]] || missing+=("$v")
done
if [[ -z "${BACKUP_REMOTE:-}" ]]; then
    for v in BACKUP_WEBDAV_USER BACKUP_WEBDAV_PASSWORD BACKUP_REMOTE_DIR; do
        [[ -n "${!v:-}" ]] || missing+=("$v")
    done
fi
if [[ -n "${BACKUP_NOTIFY_TO:-}" ]]; then
    for v in BACKUP_SMTP_HOST BACKUP_SMTP_USER BACKUP_SMTP_PASSWORD; do
        [[ -n "${!v:-}" ]] || missing+=("$v")
    done
fi
if (( ${#missing[@]} > 0 )); then
    log "ОШИБКА: резервное копирование НЕ настроено, не заданы: ${missing[*]} (см. .env.example)"
    exit 1
fi

log "Резервное копирование включено: ежедневно в ${HOUR}:00 ($TZ)"
if [[ -n "${BACKUP_NOTIFY_TO:-}" ]]; then
    log "Уведомления о сбоях: $BACKUP_NOTIFY_TO"
else
    log "Уведомления о сбоях отключены (BACKUP_NOTIFY_TO не задан) — следите за логами"
fi

notify() {
    /app/notify.sh "$@" || log "Не удалось отправить письмо-уведомление"
}

while true; do
    now=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
    wait=$((HOUR * 3600 - now))
    (( wait <= 0 )) && wait=$((wait + 86400))
    log "Следующая копия через $((wait / 3600)) ч $((wait % 3600 / 60)) мин"
    sleep "$wait"

    /app/backup.sh 2>&1 | tee "$RUN_LOG"
    rc=${PIPESTATUS[0]}

    if (( rc != 0 )); then
        log "ОШИБКА: резервная копия не создана (код $rc)"
        touch "$FAILING_MARK"
        {
            echo "Резервная копия базы данных НЕ создана."
            echo "Время: $(date '+%F %T') ($TZ), код завершения: $rc"
            echo
            echo "Последние строки журнала:"
            tail -n 25 "$RUN_LOG"
            echo
            echo "Подробнее: docker compose logs backup. Следующая попытка — завтра в ${HOUR}:00."
        } | notify "Резервная копия НЕ создана" -
    elif [[ -f "$FAILING_MARK" ]]; then
        rm -f "$FAILING_MARK"
        notify "Резервное копирование снова работает" "Копия успешно создана и выгружена: $(date '+%F %T') ($TZ)."
    fi
done
