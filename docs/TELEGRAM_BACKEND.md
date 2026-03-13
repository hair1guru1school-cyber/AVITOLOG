# Telegram-бэкенд (реальные чаты)

Показывает **реальные** чаты из твоего Telegram, как Telegram Web.

## 1. Получить API-ключи
1. Открой https://my.telegram.org
2. Войди по номеру телефона
3. Создай приложение → получи `api_id` и `api_hash`

## 2. Установить зависимости
```bash
pip install -r scripts/requirements-telegram.txt
```

## 3. Запустить бэкенд
```bash
set TELEGRAM_API_ID=12345
set TELEGRAM_API_HASH=abcdef1234567890...
python scripts/telegram_backend.py
```

Или в PowerShell:
```powershell
$env:TELEGRAM_API_ID="12345"
$env:TELEGRAM_API_HASH="твой_api_hash"
python scripts/telegram_backend.py
```

Сервер запустится на http://127.0.0.1:5050

## 4. Открыть приложение
Открой `index.html` через Live Server (порт 5500 или др.) или `python -m http.server 8080`.

Вкладка **♟ Стратегия** → «Отправить код» → введи телефон → получи код в Telegram → введи код → войдёт.

## 5. Привязка чата к проекту
После входа нажми «✈️ Привязать ТГ» у проекта → введи номер чата (1, 2, 3...) из списка или ID вручную.

Реальные сообщения из выбранного чата появятся в центральной колонке.
