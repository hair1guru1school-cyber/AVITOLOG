"""
Telegram-бэкенд для вкладки Стратегия.
Вход через телефон + код (как Telegram Web).

Запуск: python telegram_backend.py
API: http://127.0.0.1:5050

Перед запуском:
1. Получи api_id и api_hash на https://my.telegram.org
2. Установи: pip install telethon flask flask-cors
3. Задай переменные: set TELEGRAM_API_ID=12345 & set TELEGRAM_API_HASH=abcdef... & python telegram_backend.py
"""
import os
import json
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['*'], supports_credentials=True)

API_ID = int(os.environ.get('TELEGRAM_API_ID', '0') or 0)
API_HASH = os.environ.get('TELEGRAM_API_HASH', '') or ''
SESSION_DIR = os.path.join(os.path.dirname(__file__), '..', 'telegram_sessions')
PENDING = {}  # phone -> {phone_code_hash}

os.makedirs(SESSION_DIR, exist_ok=True)

def get_client(session_name='avitolog'):
    from telethon import TelegramClient
    path = os.path.join(SESSION_DIR, session_name)
    return TelegramClient(path, API_ID, API_HASH)

@app.route('/api/strategy/telegram/status', methods=['GET'])
def status():
    """Статус подключения."""
    async def _():
        if not API_ID or not API_HASH:
            return {'connected': False, 'username': '', 'error': 'Не заданы TELEGRAM_API_ID и TELEGRAM_API_HASH'}
        client = get_client()
        try:
            await client.connect()
            if await client.is_user_authorized():
                me = await client.get_me()
                un = (me.username and ('@' + me.username)) or (me.first_name or 'User')
                return {'connected': True, 'username': un, 'userId': me.id, 'lastSync': None, 'monitoredChats': 0}
            return {'connected': False, 'username': ''}
        except Exception as e:
            return {'connected': False, 'username': '', 'error': str(e)}
        finally:
            await client.disconnect()
    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'connected': False, 'username': '', 'error': str(e)}), 500

@app.route('/api/strategy/telegram/send-code', methods=['POST'])
def send_code():
    """Отправить код на телефон. Телеграм пришлёт код в приложение."""
    data = request.get_json() or {}
    phone = (data.get('phone') or '').strip().replace(' ', '')
    if not phone:
        return jsonify({'ok': False, 'error': 'Введите номер телефона'}), 400
    if not phone.startswith('+'):
        phone = '+' + phone
    if not API_ID or not API_HASH:
        return jsonify({'ok': False, 'error': 'Бэкенд не настроен. Задай TELEGRAM_API_ID и TELEGRAM_API_HASH.'}), 500

    async def _():
        client = get_client()
        await client.connect()
        result = await client.send_code_request(phone)
        PENDING[phone] = {'phone_code_hash': result.phone_code_hash}
        await client.disconnect()
        return {'ok': True, 'msg': 'Код отправлен в Telegram. Введите его ниже.'}

    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@app.route('/api/strategy/telegram/sign-in', methods=['POST'])
def sign_in():
    """Ввести код и войти."""
    data = request.get_json() or {}
    phone = (data.get('phone') or '').strip().replace(' ', '')
    if not phone.startswith('+'):
        phone = '+' + phone
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'ok': False, 'error': 'Введите код'}), 400
    pend = PENDING.get(phone, {})
    phone_code_hash = pend.get('phone_code_hash') or data.get('phone_code_hash')
    if not phone_code_hash:
        return jsonify({'ok': False, 'error': 'Сначала запросите код (нажмите Отправить код)'}), 400

    async def _():
        from telethon.errors import SessionPasswordNeededError
        client = get_client()
        await client.connect()
        try:
            await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            await client.disconnect()
            return {'ok': False, 'needPassword': True, 'error': 'Включена двухфакторная аутентификация. Введите пароль.'}
        me = await client.get_me()
        await client.disconnect()
        PENDING.pop(phone, None)
        un = (me.username and ('@' + me.username)) or (me.first_name or 'User')
        return {'ok': True, 'username': un, 'userId': me.id}

    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@app.route('/api/strategy/telegram/sign-in-password', methods=['POST'])
def sign_in_password():
    """Вход с паролем 2FA."""
    data = request.get_json() or {}
    phone = (data.get('phone') or '').strip().replace(' ', '')
    if not phone.startswith('+'):
        phone = '+' + phone
    password = data.get('password') or ''
    if not password:
        return jsonify({'ok': False, 'error': 'Введите пароль'}), 400

    async def _():
        client = get_client()
        await client.connect()
        await client.sign_in(password=password)
        me = await client.get_me()
        await client.disconnect()
        un = (me.username and ('@' + me.username)) or (me.first_name or 'User')
        return {'ok': True, 'username': un, 'userId': me.id}

    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@app.route('/api/strategy/telegram/disconnect', methods=['POST'])
def disconnect():
    """Выйти из аккаунта."""
    path = os.path.join(SESSION_DIR, 'avitolog.session')
    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass
    return jsonify({'ok': True})

@app.route('/api/strategy/chats', methods=['GET'])
def get_chats():
    """Список диалогов (чатов)."""
    async def _():
        client = get_client()
        await client.connect()
        if not await client.is_user_authorized():
            await client.disconnect()
            return {'chats': []}
        chats = []
        async for d in client.iter_dialogs(limit=100):
            c = {
                'id': str(d.id),
                'chatId': str(d.id),
                'title': d.name or '',
                'name': d.name or '',
                'username': getattr(d.entity, 'username', None) or '',
            }
            if c['username']:
                c['username'] = '@' + c['username'] if not c['username'].startswith('@') else c['username']
            chats.append(c)
        await client.disconnect()
        return {'chats': chats}

    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'chats': [], 'error': str(e)})

@app.route('/api/strategy/messages', methods=['GET'])
def get_messages():
    """Сообщения чата."""
    chat_id = request.args.get('chatId') or request.args.get('chat_id') or ''
    if not chat_id:
        return jsonify({'messages': []})
    try:
        chat_id = int(chat_id)
    except ValueError:
        return jsonify({'messages': []})

    async def _():
        client = get_client()
        await client.connect()
        if not await client.is_user_authorized():
            await client.disconnect()
            return {'messages': []}
        msgs = []
        me_id = (await client.get_me()).id
        async for m in client.iter_messages(chat_id, limit=50):
            author = 'me' if m.sender_id == me_id else 'client'
            msgs.append({
                'id': str(m.id),
                'author': author,
                'messageText': m.text or '',
                'timestamp': m.date.isoformat()[:16] if m.date else '',
                'labels': []
            })
        msgs.reverse()
        await client.disconnect()
        return {'messages': msgs}

    try:
        result = asyncio.run(_())
        return jsonify(result)
    except Exception as e:
        return jsonify({'messages': [], 'error': str(e)})

@app.route('/api/strategy/telegram/sync', methods=['POST'])
def sync():
    """Синхронизация (заглушка)."""
    return jsonify({'ok': True, 'lastSync': __import__('time').time() * 1000, 'monitoredChats': 0})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print('Telegram-бэкенд: http://127.0.0.1:%d' % port)
    if not API_ID or not API_HASH:
        print('ВНИМАНИЕ: Задай TELEGRAM_API_ID и TELEGRAM_API_HASH (см. https://my.telegram.org)')
    app.run(host='0.0.0.0', port=port, threaded=True)
