"""
Save a backup of index.html to backups/ automatically.
Run this script anytime to create a backup, or it runs automatically before upload_github.py.
Mobile version: save_backup_mobile() → backups/mobile/
"""
import os
import shutil
from datetime import datetime

_script_dir = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.dirname(_script_dir) if os.path.basename(_script_dir) == 'scripts' else _script_dir
SOURCE = os.path.join(DIR, "index.html")
BACKUPS_DIR = os.path.join(DIR, "backups")
MOBILE_DIR = os.path.join(DIR, "backups", "mobile")

def save_backup():
    if not os.path.exists(SOURCE):
        print("Нет index.html — бэкап не создан.")
        return None
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    today = datetime.now()
    date_str = today.strftime("%d_%m_%Y")
    prefix = "index_" + date_str + "_backup"
    existing = [f for f in os.listdir(BACKUPS_DIR) if f.startswith(prefix) and f.endswith(".html")]
    n = len(existing) + 1
    name = prefix + str(n) + ".html"
    dest = os.path.join(BACKUPS_DIR, name)
    shutil.copy2(SOURCE, dest)
    print("Бэкап сохранён: backups/" + name)
    return dest

def save_backup_mobile():
    """Сохранить текущий index.html в backups/mobile/ (версия для мобильной вёрстки)."""
    if not os.path.exists(SOURCE):
        print("Нет index.html — мобильный бэкап не создан.")
        return None
    os.makedirs(MOBILE_DIR, exist_ok=True)
    now = datetime.now()
    name = "index_mobile_" + now.strftime("%d_%m_%Y_%H%M") + ".html"
    dest = os.path.join(MOBILE_DIR, name)
    shutil.copy2(SOURCE, dest)
    print("Мобильный бэкап сохранён: backups/mobile/" + name)
    return dest

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1].lower() == "mobile":
        save_backup_mobile()
    else:
        save_backup()
