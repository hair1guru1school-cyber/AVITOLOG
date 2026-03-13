# Google OAuth — фиксация рабочего решения (март 2026)

> Долго решали проблемы с авторизацией. Это документ зафиксировал рабочую конфигурацию.

## Итоговая конфигурация

| Параметр | Значение |
|----------|----------|
| **Client ID** | `98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com` |
| **Redirect URI** | `https://hair1guru1school-cyber.github.io/AVITOLOG/index.html` |
| **Scope** | `https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets` |
| **Тип клиента в Console** | Web application |
| **Сайт** | https://hair1guru1school-cyber.github.io/AVITOLOG/index.html |

## Что в Google Cloud Console

1. **Authorized JavaScript origins:** `https://hair1guru1school-cyber.github.io` (без пути!)
2. **Authorized redirect URIs:** `https://hair1guru1school-cyber.github.io/AVITOLOG/index.html` (точно так, без слеша в конце)
3. Клиент — **Web application** (не Desktop, не Mobile)

## Два рабочих потока

### 1. Redirect (response_type=token)
- `buildAuthUrl()` строит URL: `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=token&scope=...&state=...`
- `window.location.href = buildAuthUrl()` — переход на Google, возврат с `#access_token=...`
- `applyOAuthHash(window.location.hash)` извлекает токен при загрузке страницы

### 2. GIS popup (Google Identity Services)
- Скрипт: `<script src="https://accounts.google.com/gsi/client" async></script>`
- `google.accounts.oauth2.initTokenClient({ client_id, scope, callback, error_callback })`
- **ВАЖНО:** `client_id` передаётся жёстко строкой в initTokenClient — иначе была ошибка "Missing required parameter client_id"

## Что было сломано и как починили

| Проблема | Причина | Решение |
|----------|---------|---------|
| 401 invalid_client | Неверный Client ID или клиент не найден | Использовать Avitolog (5 Mar) клиент, Client ID выше |
| 400 Bad Request | Синтаксические ошибки, redirect_uri mismatch | Жёстко задать redirect_uri без window.location, добавить в Console |
| 404 | Неверный URL или buildAuthUrl undefined | Добавить buildAuthUrl, правильный endpoint |
| GIS: Missing client_id | Передача переменной OAUTH_CLIENT_ID — иногда undefined | Передавать строку напрямую: `client_id: '98192715547-...'` |

## Ключевые фрагменты кода (не менять без причины)

```javascript
// В начале скрипта
window.AVITOLOG_GOOGLE_CLIENT_ID = '98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com';
window.AVITOLOG_GOOGLE_REDIRECT = 'https://hair1guru1school-cyber.github.io/AVITOLOG/index.html';

// buildAuthUrl — жёсткие значения, не window.location
var cid = '98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com';
var redirect = 'https://hair1guru1school-cyber.github.io/AVITOLOG/index.html';

// initTokenClient — client_id строкой, не переменной
_tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: cid,  // или прямо строка
  scope: scp,
  callback: ...,
  error_callback: ...
});
```

## Бэкапы

- `index_OAUTH_WORKING_10_03_2026.html` — отдельный бэкап с рабочей авторизацией (одна кнопка, GIS + redirect)
- Обычные бэкапы: `index_10_03_2026_backup*.html`
- При проблемах с доступом — откатиться на `index_OAUTH_WORKING_10_03_2026.html` и проверить GOOGLE_OAUTH_НАСТРОЙКА.txt
