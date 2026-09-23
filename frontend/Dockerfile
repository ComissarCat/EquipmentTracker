# --- Этап сборки ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Этап раздачи статики ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# Конфигурацию (HTTP или HTTPS) при старте собирает 40-tls.sh из этих заготовок, см. комментарий в нём
COPY nginx/app.conf nginx/acme.conf nginx/http.conf nginx/https.conf /etc/nginx/snippets/
COPY nginx/http.conf /etc/nginx/conf.d/default.conf
COPY nginx/40-tls.sh /docker-entrypoint.d/40-tls.sh
# Скрипт мог попасть в репозиторий с CRLF (Windows) — в контейнере это ломает shebang
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-tls.sh && chmod +x /docker-entrypoint.d/40-tls.sh \
    && mkdir -p /var/www/certbot
EXPOSE 80 443
