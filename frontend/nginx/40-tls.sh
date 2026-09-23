#!/bin/sh
# Выбирает конфигурацию nginx при старте контейнера (запускается стандартным entrypoint образа nginx
# из /docker-entrypoint.d) и следит за сертификатом в фоне:
#  - TLS_IP не задан                  → HTTP, как раньше;
#  - TLS_IP задан, сертификата ещё нет → HTTP + отдача файлов проверки Let's Encrypt (их кладёт certbot);
#  - сертификат есть                  → HTTPS, а с порта 80 — редирект на HTTPS с тем же путём.
# Раз в CHECK_INTERVAL секунд проверяет, не выпущен ли/не продлён ли сертификат, и перечитывает конфигурацию
# (nginx -s reload) — перезапускать контейнер после продления не нужно.
set -eu

CONF=/etc/nginx/conf.d/default.conf
SNIPPETS=/etc/nginx/snippets
TLS_IP="${TLS_IP:-}"
HTTPS_PUBLIC_PORT="${HTTPS_PUBLIC_PORT:-443}"
CHECK_INTERVAL="${TLS_CHECK_INTERVAL:-300}"
CERT_DIR="/etc/letsencrypt/live/$TLS_IP"

log() { echo "[40-tls] $*"; }

# Хост для редиректа: IPv6 — в квадратных скобках, нестандартный порт — через двоеточие
https_host() {
    host="$TLS_IP"
    case "$host" in *:*) host="[$host]" ;; esac
    [ "$HTTPS_PUBLIC_PORT" = "443" ] || host="$host:$HTTPS_PUBLIC_PORT"
    echo "$host"
}

cert_ready() {
    [ -n "$TLS_IP" ] && [ -s "$CERT_DIR/fullchain.pem" ] && [ -s "$CERT_DIR/privkey.pem" ]
}

# Отпечаток текущего сертификата: меняется при выпуске и продлении
cert_fingerprint() {
    if cert_ready; then cat "$CERT_DIR/fullchain.pem" | md5sum; else echo none; fi
}

render() {
    if cert_ready; then
        sed -e "s|__TLS_IP__|$TLS_IP|g" -e "s|__HTTPS_HOST__|$(https_host)|g" "$SNIPPETS/https.conf" > "$CONF"
        echo https
    else
        cp "$SNIPPETS/http.conf" "$CONF"
        echo http
    fi
}

mode="$(render)"
# Сертификат есть, но nginx его не принимает (повреждён, недописан) — стартуем по HTTP, чтобы сайт
# оставался доступен; фоновая проверка включит HTTPS, как только появится исправный сертификат
if [ "$mode" = https ] && ! nginx -t -q 2>/dev/null; then
    cp "$SNIPPETS/http.conf" "$CONF"
    mode=http
    log "ОШИБКА: сертификат для $TLS_IP не принят nginx — временно работаем по HTTP"
fi
if [ -z "$TLS_IP" ]; then
    log "TLS_IP не задан — сайт работает по HTTP"
    exit 0
fi
if [ "$mode" = https ]; then
    log "HTTPS включён (сертификат для $TLS_IP)"
elif ! cert_ready; then
    log "Сертификата для $TLS_IP ещё нет — пока HTTP; HTTPS включится сам, когда certbot его выпустит"
fi

# Фоновое слежение за сертификатом. Процесс переживает exec nginx из entrypoint (становится его потомком).
(
    last="$(cert_fingerprint)"
    while sleep "$CHECK_INTERVAL"; do
        current="$(cert_fingerprint)"
        [ "$current" = "$last" ] && continue
        cp "$CONF" "$CONF.prev"
        new_mode="$(render)"
        if nginx -t -q && nginx -s reload; then
            log "Сертификат обновлён — конфигурация перечитана (режим: $new_mode)"
            last="$current"
        else
            # Например, certbot ещё дописывает файлы — возвращаем рабочую конфигурацию и пробуем позже
            cp "$CONF.prev" "$CONF"
            log "ОШИБКА: не удалось применить новую конфигурацию, повтор через $CHECK_INTERVAL с"
        fi
    done
) &
