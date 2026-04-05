#!/usr/bin/env bash
# Запуск на VPS без Docker: скопируй папку backend, затем на сервере:
#   chmod +x deploy-vps.sh && ./deploy-vps.sh
set -euo pipefail
cd "$(dirname "$0")"
npm ci --omit=dev
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe avitolog-backend >/dev/null 2>&1; then
    pm2 reload avitolog-backend --update-env
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
  echo "OK: pm2 status — процесс avitolog-backend"
else
  echo "PM2 не установлен. Установка: npm i -g pm2"
  echo "Или одноразово: HOST=0.0.0.0 PORT=8787 node server.js"
  exit 1
fi
