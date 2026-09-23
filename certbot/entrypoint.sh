#!/bin/bash
# Выпуск и продление сертификата Let's Encrypt на IP-адрес сервера (TLS_IP).
# IP-сертификаты бывают только короткими (профиль shortlived, ~6 дней), поэтому продление полностью
# автоматическое: раз в 12 часов certbot проверяет сертификат и продлевает его, когда осталось меньше
# половины срока (~3 дня). Проверка — http-01 через webroot: файлы проверки кладутся в общий том,
# их отдаёт nginx фронтенда на порту 80. Новый сертификат nginx подхватывает сам (см. frontend/nginx/40-tls.sh).
# При сбое — письмо (тот же notify.sh и SMTP-настройки BACKUP_*, что у резервного копирования): сначала сразу,
# затем не чаще раза в сутки, пока не заработает; после восстановления — письмо «снова работает».
set -uo pipefail

TLS_IP="${TLS_IP:-}"
WEBROOT=/var/www/certbot
STATE_DIR=/etc/letsencrypt/equipment-tracker
MODE_FILE="$STATE_DIR/mode"            # staging | production — каким сервером выпущен текущий сертификат
FAILING_MARK="$STATE_DIR/failing"      # есть, пока последняя попытка неудачна; внутри — время последнего письма
RUN_LOG=/tmp/last-run.log
CHECK_INTERVAL=$((12 * 3600))
RETRY_INTERVAL=3600

log() { echo "[$(date '+%F %T')] $*"; }

# HTTPS не настроен — штатная ситуация: контейнер простаивает, сайт работает по HTTP
if [[ -z "$TLS_IP" ]]; then
    log "TLS_IP не задан — HTTPS отключён, сертификат не выпускается"
    exec tail -f /dev/null
fi

mkdir -p "$WEBROOT" "$STATE_DIR"

args=(certonly --non-interactive --agree-tos
      --webroot --webroot-path "$WEBROOT"
      --preferred-profile shortlived
      --ip-address "$TLS_IP" --cert-name "$TLS_IP"
      --keep-until-expiring)

if [[ -n "${TLS_EMAIL:-}" ]]; then
    args+=(--email "$TLS_EMAIL")
else
    args+=(--register-unsafely-without-email)
fi

if [[ "${TLS_STAGING:-0}" == "1" ]]; then
    mode=staging
    # Тестовый сервер: сертификат браузеры не доверяют — только для проверки, что выпуск работает
    args+=(--staging --break-my-certs)
else
    mode=production
fi

log "HTTPS для $TLS_IP: сервер Let's Encrypt — $mode, проверка раз в $((CHECK_INTERVAL / 3600)) ч"

notify() {
    /app/notify.sh "$@" || log "Не удалось отправить письмо-уведомление"
}

cert_expiry() {
    certbot certificates --cert-name "$TLS_IP" 2>/dev/null | grep -i 'expiry' | sed 's/^ *//'
}

# Даём nginx фронтенда время запуститься — иначе первая проверка может не достучаться до порта 80
sleep 15

while true; do
    extra=()
    # Переключились между тестовым и боевым сервером — текущий сертификат не подходит, выпускаем заново
    if [[ -f "$MODE_FILE" && "$(cat "$MODE_FILE")" != "$mode" ]]; then
        log "Сервер сменился ($(cat "$MODE_FILE") → $mode) — выпускаем сертификат заново"
        extra+=(--force-renewal)
    fi

    certbot "${args[@]}" "${extra[@]}" 2>&1 | tee "$RUN_LOG"
    rc=${PIPESTATUS[0]}

    if (( rc == 0 )); then
        echo "$mode" > "$MODE_FILE"
        log "Сертификат в порядке. $(cert_expiry)"
        if [[ -f "$FAILING_MARK" ]]; then
            rm -f "$FAILING_MARK"
            notify "HTTPS-сертификат снова продлевается" "Сертификат для $TLS_IP успешно получен: $(date '+%F %T'). $(cert_expiry)"
        fi
        sleep "$CHECK_INTERVAL"
        continue
    fi

    log "ОШИБКА: не удалось получить/продлить сертификат (код $rc), повтор через $((RETRY_INTERVAL / 60)) мин"
    now=$(date +%s)
    last_notified=$(cat "$FAILING_MARK" 2>/dev/null || echo 0)
    if (( now - last_notified >= 86400 )); then
        echo "$now" > "$FAILING_MARK"
        {
            echo "Не удалось получить или продлить HTTPS-сертификат Let's Encrypt для $TLS_IP."
            echo "Время: $(date '+%F %T'), код завершения: $rc"
            echo "Текущий сертификат: $(cert_expiry || true)"
            echo "Сертификат действует около 6 дней — если продление не заработает, сайт по HTTPS перестанет открываться."
            echo "Частые причины: порт 80 закрыт снаружи (файрвол/провайдер), контейнер frontend не запущен."
            echo
            echo "Последние строки журнала:"
            tail -n 25 "$RUN_LOG"
            echo
            echo "Подробнее: docker compose logs certbot. Повторные попытки — каждый час, письмо — не чаще раза в сутки."
        } | notify "HTTPS-сертификат НЕ продлён" -
    fi
    sleep "$RETRY_INTERVAL"
done
