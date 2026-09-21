FROM alpine:3.20

RUN apk add --no-cache bash curl postgresql16-client rclone age tzdata

# Пустой конфиг rclone: всё настраивается переменными окружения, без предупреждений в логе
RUN mkdir -p /root/.config/rclone && touch /root/.config/rclone/rclone.conf

WORKDIR /app
COPY backup.sh entrypoint.sh notify.sh ./
# Скрипты могли попасть в репозиторий с CRLF (Windows) — в контейнере это ломает shebang
RUN sed -i 's/\r$//' backup.sh entrypoint.sh notify.sh && chmod +x backup.sh entrypoint.sh notify.sh

ENTRYPOINT ["/app/entrypoint.sh"]
