# Структура проекта AVITOBO$$

## Корень
- `index.html` — главная страница приложения
- `styles.css` — основные стили
- `avito-489218-2e0898c9d84e.json` — учётные данные Google (не коммитить в публичный репо)

## Папки
- `js/` — JavaScript-модули (goals.js и др.)
- `assets/` — картинки (logo.jpg, icon.png, splash.png.png, presale_header.png, avito1_header.png)
- `docs/` — документация, промпты, ТЗ
- `scripts/` — Python-скрипты (backup_to_folder.py, upload_github.py, analyze_excel.py, reorganize_crm.py)
- `backups/` — бэкапы (игнорируются Cursor, не индексируются)

## Запуск
Открыть `index.html` через Live Server или `python -m http.server`

## Скрипты
Запускать из корня проекта: `python scripts/upload_github.py` или `python scripts/backup_to_folder.py`
