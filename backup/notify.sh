#!/bin/bash
# Отправка письма через SMTP (по умолчанию — Яндекс Почта, порт 465 с SSL).
# Использование:  notify.sh "Тема" "Текст письма"     либо     notify.sh "Тема" -   (текст из stdin)
# Проверка настроек:  docker compose run --rm backup /app/notify.sh "Проверка" "Тестовое письмо"
#
# Настройки — переменные окружения (см. .env.example): BACKUP_NOTIFY_TO (получатели через запятую),
# BACKUP_SMTP_HOST/PORT/USER/PASSWORD, BACKUP_SMTP_FROM, BACKUP_SMTP_SECURITY (ssl | starttls | none).
set -euo pipefail

subject="${1:?Использование: notify.sh \"Тема\" \"Текст\"|-}"
body="${2:-}"
[[ "$body" == "-" ]] && body="$(cat)"

if [[ -z "${BACKUP_NOTIFY_TO:-}" ]]; then
    echo "Уведомления не настроены (BACKUP_NOTIFY_TO пуст) — письмо не отправлено" >&2
    exit 0
fi
: "${BACKUP_SMTP_HOST:?не задан BACKUP_SMTP_HOST}" "${BACKUP_SMTP_USER:?не задан BACKUP_SMTP_USER}" "${BACKUP_SMTP_PASSWORD:?не задан BACKUP_SMTP_PASSWORD}"

port="${BACKUP_SMTP_PORT:-465}"
security="${BACKUP_SMTP_SECURITY:-ssl}"
from="${BACKUP_SMTP_FROM:-$BACKUP_SMTP_USER}"   # Яндекс требует, чтобы отправитель совпадал с логином

# Получатели: "a@x.ru, b@y.ru" → отдельные --mail-rcpt
rcpt_args=()
recipients=()
IFS=',' read -ra raw <<< "$BACKUP_NOTIFY_TO"
for r in "${raw[@]}"; do
    r="$(echo "$r" | xargs)"
    [[ -n "$r" ]] || continue
    recipients+=("$r")
    rcpt_args+=(--mail-rcpt "$r")
done
to_header="$(IFS=', '; echo "${recipients[*]}")"

# Тема и текст кодируются в base64, чтобы кириллица доходила без искажений
subject_b64="$(printf '%s' "[Учёт техники] $subject" | base64 -w0)"
msg="$(mktemp)"
trap 'rm -f "$msg"' EXIT
{
    echo "From: $from"
    echo "To: $to_header"
    echo "Subject: =?UTF-8?B?$subject_b64?="
    echo "Date: $(date -R)"
    echo "Message-ID: <$(date +%s).$RANDOM@equipment-tracker-backup>"
    echo "MIME-Version: 1.0"
    echo "Content-Type: text/plain; charset=UTF-8"
    echo "Content-Transfer-Encoding: base64"
    echo
    printf '%s\n' "$body" | base64 -w76
} > "$msg"

case "$security" in
    ssl)      url="smtps://$BACKUP_SMTP_HOST:$port"; extra=() ;;
    starttls) url="smtp://$BACKUP_SMTP_HOST:$port";  extra=(--ssl-reqd) ;;
    none)     url="smtp://$BACKUP_SMTP_HOST:$port";  extra=() ;;   # только для внутреннего релея/проверки
    *) echo "BACKUP_SMTP_SECURITY должен быть ssl, starttls или none" >&2; exit 1 ;;
esac

curl -sS --fail --max-time 60 --url "$url" "${extra[@]}" \
    --mail-from "$from" "${rcpt_args[@]}" \
    --user "$BACKUP_SMTP_USER:$BACKUP_SMTP_PASSWORD" \
    --upload-file "$msg"
echo "Письмо отправлено: $to_header"
