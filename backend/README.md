# AVITOLOG Backend (MVP)

Минимальная серверная основа под интеграции (Avito API, аналитика, внешние сервисы).

## Быстрый старт

1. Откройте терминал в папке `backend`.
2. Установите зависимости:
   - `npm install`
3. Создайте `.env` на базе `.env.example`.
4. Запустите сервер:
   - `npm run dev`

По умолчанию backend стартует на `http://localhost:8787`.

## Эндпоинты

- `GET /api/health` - проверка, что сервер жив.
- `POST /api/avito/proxy` - прокси-запрос к Avito API.

### Пример body для `/api/avito/proxy`

```json
{
  "apiKey": "YOUR_AVITO_API_KEY",
  "path": "/core/v1/accounts/self",
  "method": "GET"
}
```

Можно передать:
- `query` - объект query-параметров,
- `body` - тело запроса для `POST/PUT/PATCH`.

## Важно по безопасности

- Сейчас ключ можно передавать из UI (MVP для быстрого запуска).
- Для прод-режима лучше хранить ключи на сервере (env/secure store), а из фронта отправлять только команду и параметры.
