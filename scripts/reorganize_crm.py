"""
Скрипт перемещения папок из АКТИВ+ по категориям CRM
Запуск: py reorganize_crm.py
"""
import json, time, base64, urllib.request, urllib.parse, sys, subprocess

with open('avito-489218-2e0898c9d84e.json') as f:
    SA = json.load(f)

DEST = {
    'строительство': '12QkZZOOmrTqtVEgS89H45eeAJzm5tiI2',
    'услуги':        '174UazB2ErOG0wD9KplArQWO0JxfhDhfc',
    'оборудование':  '1j3bqO2-9O9OeENLS7uDxVCu4imgsF1tb',
    'мебель':        '1ODPfNieEXqs9HmL96udmw-qLwiXL3EAS',
    'дома':          '12ajIWwl0fLs4jWB8NATNdvr6F2SmEeUU',
}
AKTIV_ID = '1srZSlb_GuWIlPHHx2UFolTYJkN1gtm1c'

MOVES = {
    '1ggVOuI3oL0uGJin2JFdLdkU7wIvPed5_': ('строительство', 'Владимир Амбарная доска'),
    '1K1d1vZT6ci6VttlNg7BVVgYcm2_tr8sR': ('строительство', 'Монолит'),
    '1zYIbyAcPB7xinNcf8GXeh2IHM14sLmG7': ('строительство', 'Пило/Амбарная/Половая доска'),
    '1iQKLhjGcownyuXJ_GVAjybluIiPkJjp_': ('строительство', 'Молл Строй Андрей'),
    '15Bztb394k--z2oOC9Jd1A-42a_101x33': ('услуги',        'Максим Строитель'),
    '1Iht1Rd61ZKeJ0gz_3v1emdzOYJQZYhdP': ('услуги',        'Марк Сварка'),
    '1wLWXm6ltUi-132B1Tbg4SPwSfc-2yo4w': ('услуги',        'Бурение Алутнин Алексей'),
    '1d8d_5aSjx11glOlqDgzBre8QTs-ieDzd': ('услуги',        'Фундамент Артем и Дмитрий'),
    '1pbFlzo6PIWHFRlODPYbicXACDwbVDD_i': ('услуги',        'Роман Каркасники Сваи'),
    '17UgT7LUtITjJF9ak4xYedNENv4xeq4b4': ('оборудование',  'Эрнест Спецтехника'),
    '1mNCF3UtavFF7aeZ5CSm-VMgaqSqSGH-M': ('оборудование',  'Оборудование для кафе'),
    '1DaIWrx11IGJ5apXVXl0Sjq17X2XILig6': ('оборудование',  'Пром Элекстра Popov'),
    '19aIyXHGeylf59SDKLVYqGdHT6x5IUgF0': ('оборудование',  'Тайга Электро'),
    '1xOq8DE18pAHn9IH0uKIDZE6MPVJiz-LX': ('оборудование',  'Олег Печи и Котлы'),
    '1uJwYbviHJGFAZPVg5OxUkobkROHElBEP': ('мебель',        'Константин Мебель'),
    '1cusyuwAs5YxNqYyQLYb88WAw0BYBWwjo': ('мебель',        'Жанна Мебель'),
    '1-zuH_T3LScDQ-NqNSQXdqOER0obNhXNV': ('мебель',        'Мебель Казань Дамир'),
    '1z7vhHCeosy5gu2vPnNSA71yPpyWUiMUS': ('дома',          'БаниБочки'),
    '1EUFcz59rFyAS20I2tKuQcYsv5i3ZUgcq': ('дома',          'Игорь Дома под ключ'),
    '11Ze3ZdTRekpeq46qzkNQ5-j3ArEwuASB': ('дома',          'Каркасные Дома Максим'),
}

def b64url(data):
    if isinstance(data, str): data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
except ImportError:
    print("Устанавливаю cryptography...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'cryptography'], check=True)
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

def get_token():
    now = int(time.time())
    header = b64url(json.dumps({"alg":"RS256","typ":"JWT"}))
    claim  = b64url(json.dumps({
        "iss": SA['client_email'],
        "scope": "https://www.googleapis.com/auth/drive",
        "aud": "https://oauth2.googleapis.com/token",
        "exp": now+3600, "iat": now
    }))
    msg = f"{header}.{claim}".encode()
    key = serialization.load_pem_private_key(SA['private_key'].encode(), password=None)
    sig = key.sign(msg, padding.PKCS1v15(), hashes.SHA256())
    jwt = f"{header}.{claim}.{b64url(sig)}"
    data = urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': jwt
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    resp = json.loads(urllib.request.urlopen(req).read())
    if 'access_token' not in resp:
        raise Exception(str(resp))
    return resp['access_token']

def move_folder(fid, new_parent, old_parent, token):
    url = f'https://www.googleapis.com/drive/v3/files/{fid}?addParents={new_parent}&removeParents={old_parent}&fields=id,name'
    req = urllib.request.Request(url, method='PATCH', data=b'{}')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    return json.loads(urllib.request.urlopen(req).read())

print("Получаю токен...")
token = get_token()
print("Токен получен! Перемещаю папки...\n")

for fid, (cat, name) in MOVES.items():
    try:
        move_folder(fid, DEST[cat], AKTIV_ID, token)
        print(f"OK  {name} -> {cat}")
    except Exception as e:
        print(f"ERR {name}: {e}")
    time.sleep(0.3)

print("\nГотово!")
