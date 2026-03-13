import urllib.request, urllib.error, json, base64, os
from urllib.parse import quote

TOKEN = os.getenv("GITHUB_TOKEN")
if not TOKEN:
    raise SystemExit("Set GITHUB_TOKEN env var. Example: set GITHUB_TOKEN=ghp_xxx")
REPO  = "hair1guru1school-cyber/AVITOLOG"
FILE  = "index.html"
API   = "https://api.github.com/repos/" + REPO + "/contents/"
_script_dir = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.dirname(_script_dir) if os.path.basename(_script_dir) == 'scripts' else _script_dir
TIMEOUT = 120  # секунд для медленного интернета / VPN
RETRIES = 5   # повторов при таймауте/обрыве

def urlopen_with_retry(req, timeout=TIMEOUT, label="запрос"):
    import time
    last_err = None
    for attempt in range(RETRIES + 1):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            last_err = e
            # Временные ошибки GitHub/edge — пробуем повторно.
            if e.code in (429, 500, 502, 503, 504) and attempt < RETRIES:
                wait_s = 3 + attempt * 2
                print(f"  {label}: HTTP {e.code}, повтор через {wait_s} сек... ({attempt + 1}/{RETRIES})")
                time.sleep(wait_s)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < RETRIES:
                wait_s = 4 + attempt * 3
                print(f"  {label}: сеть/таймаут, повтор через {wait_s} сек... ({attempt + 1}/{RETRIES})")
                time.sleep(wait_s)
            else:
                raise RuntimeError('Нет связи с GitHub. Проверь интернет, VPN, firewall. Подожди и попробуй снова.') from e
    raise last_err

def pause():
    print("")
    try:
        input("Нажми Enter для выхода...")
    except EOFError:
        import time
        time.sleep(5)

def upload_file(path_in_repo, local_path):
    full = os.path.join(DIR, local_path)
    if not os.path.exists(full):
        print("Пропуск (нет файла): " + local_path)
        return False
    with open(full, 'rb') as f:
        content = base64.b64encode(f.read()).decode()
    url = API + quote(path_in_repo.replace(os.sep, '/'), safe='')
    req = urllib.request.Request(url)
    req.add_header('Authorization', 'token ' + TOKEN)
    req.add_header('User-Agent', 'avitolog')
    try:
        resp = urlopen_with_retry(req, timeout=TIMEOUT, label="Чтение SHA index")
        body = resp.read().decode('utf-8', errors='replace')
        if body.strip().startswith('<!'):
            raise RuntimeError('GitHub вернул страницу с ошибкой. Подожди 2–5 минут и запусти скрипт снова.')
        data = json.loads(body)
        sha = data.get('sha')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            sha = None
        elif e.code >= 500:
            raise RuntimeError('GitHub сейчас недоступен (ошибка %s). Подожди 2–5 минут и запусти скрипт снова.' % e.code) from e
        else:
            raise
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError('Нет связи с GitHub (таймаут или сеть). Проверь интернет, VPN, firewall. Подожди и попробуй снова.') from e
    data = {"message": "update", "content": content}
    if sha:
        data["sha"] = sha
    req2 = urllib.request.Request(url, data=json.dumps(data).encode(), method='PUT')
    req2.add_header('Authorization', 'token ' + TOKEN)
    req2.add_header('Content-Type', 'application/json')
    req2.add_header('User-Agent', 'avitolog')
    try:
        resp2 = urlopen_with_retry(req2, timeout=TIMEOUT, label="Загрузка index")
        body2 = resp2.read().decode('utf-8', errors='replace')
        if body2.strip().startswith('<!'):
            raise RuntimeError('GitHub вернул ошибку вместо ответа. Подожди 2–5 минут и запусти скрипт снова.')
        json.loads(body2)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError('Нет связи с GitHub при загрузке. Проверь интернет, VPN.') from e
    except urllib.error.HTTPError as e:
        if e.code >= 500:
            raise RuntimeError('GitHub сейчас недоступен (ошибка %s). Подожди 2–5 минут и запусти снова.' % e.code) from e
        raise
    print("OK: " + path_in_repo)
    return True

# 1) backup index.html to backups/
try:
    import backup_to_folder
    backup_to_folder.save_backup()
except Exception as e:
    print("Бэкап (пропуск):", e)

# 2) index.html, js/goals.js, styles.css to GitHub
try:
    print("Загружаю index.html ...")
    upload_file(FILE, FILE)
    if os.path.exists(os.path.join(DIR, "js", "goals.js")):
        print("Загружаю js/goals.js ...")
        upload_file("js/goals.js", os.path.join("js", "goals.js"))
    else:
        print("Нет js/goals.js — вкладка ЦЕЛИ не будет работать на GitHub Pages.")
    if os.path.exists(os.path.join(DIR, "styles.css")):
        print("Загружаю styles.css ...")
        upload_file("styles.css", "styles.css")
    else:
        print("Нет styles.css — стили не загрузятся.")

    # 3) картинка сплеша (в репо как splash.png)
    for name in ("assets/splash.png", "assets/splash.png.png", "splash.png", "splash.png.png"):
        p = os.path.join(DIR, name)
        if os.path.exists(p):
            print("Загружаю сплеш: " + name + " -> splash.png ...")
            with open(p, 'rb') as f:
                content = base64.b64encode(f.read()).decode()
            url = API + "splash.png"
            req = urllib.request.Request(url)
            req.add_header('Authorization', 'token ' + TOKEN)
            req.add_header('User-Agent', 'avitolog')
            try:
                resp = json.loads(urlopen_with_retry(req, timeout=TIMEOUT, label="Чтение SHA splash").read())
                sha = resp.get('sha')
            except Exception:
                sha = None
            data = {"message": "update splash", "content": content}
            if sha:
                data["sha"] = sha
            req2 = urllib.request.Request(url, data=json.dumps(data).encode(), method='PUT')
            req2.add_header('Authorization', 'token ' + TOKEN)
            req2.add_header('Content-Type', 'application/json')
            req2.add_header('User-Agent', 'avitolog')
            json.loads(urlopen_with_retry(req2, timeout=TIMEOUT, label="Загрузка splash").read())
            print("OK: splash.png")
            break
    else:
        print("Нет файла splash.png или splash.png.png — сплеш не загружен.")

    # 4) картинка для документа «НУЖНО СЕЙЧАС»
    presale_path = "assets/presale_header.png" if os.path.exists(os.path.join(DIR, "assets", "presale_header.png")) else "presale_header.png"
    if os.path.exists(os.path.join(DIR, presale_path)):
        print("Загружаю presale_header.png ...")
        upload_file("assets/presale_header.png", presale_path)
    else:
        print("Нет файла presale_header.png — картинка для presale не загружена.")

    # 5) картинка для документа «AVITO №1»
    avito_path = "assets/avito1_header.png" if os.path.exists(os.path.join(DIR, "assets", "avito1_header.png")) else "avito1_header.png"
    if os.path.exists(os.path.join(DIR, avito_path)):
        print("Загружаю avito1_header.png ...")
        upload_file("assets/avito1_header.png", avito_path)
    else:
        print("Нет файла avito1_header.png — картинка для avito1 не загружена.")

    print("\nГотово! Сайт обновится через 1–2 минуты.")
except Exception as e:
    print("\nОшибка:", e)
    import traceback
    traceback.print_exc()
finally:
    pause()
