# Certbot ≥ 5.4: IP-сертификаты (--ip-address) с проверкой через webroot
FROM certbot/certbot:v5.8.0

# bash и curl — для notify.sh (письмо о сбое продления, общий с сервисом backup)
RUN apk add --no-cache bash curl

WORKDIR /app
COPY entrypoint.sh ./
COPY --from=backup notify.sh ./
# Скрипты могли попасть в репозиторий с CRLF (Windows) — в контейнере это ломает shebang
RUN sed -i 's/\r$//' entrypoint.sh notify.sh && chmod +x entrypoint.sh notify.sh

ENTRYPOINT ["/app/entrypoint.sh"]
