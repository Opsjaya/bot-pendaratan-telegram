import os
import json
import firebase_admin
from firebase_admin import credentials, db
from telegram import Update, Bot
from telegram.ext import Dispatcher, CommandHandler, MessageHandler, Filters
from flask import Flask, request, jsonify

# Initialize Flask app
app = Flask(__name__)

# Firebase setup
firebase_key_base64 = os.getenv('FIREBASE_KEY_BASE64')
if firebase_key_base64:
    with open('serviceAccountKey.json', 'w') as f:
        f.write(bytearray.fromhex(firebase_key_base64).decode())

cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://appendiks-e02a8-default-rtdb.firebaseio.com'
})
ref = db.reference()

# Telegram Bot setup
TOKEN = os.getenv('BOT_TOKEN')
bot = Bot(token=TOKEN)
dispatcher = Dispatcher(bot=bot, update_queue=None, workers=0, use_context=True)

# Command handlers
def start(update, context):
    update.message.reply_text(
        "👋 Selamat datang di Bot Pendaratan Appendiks. Ketik /format untuk melihat format input.")

def format_handler(update, context):
    update.message.reply_text(
        "✏️ *Format Input:*\n\n```
L OR NL : NL\nKode Kapal : 1422\nKode Alat : JIH\nSatuan : KG\nKode Ikan : TNL\nVolume : 200\n```\n_Tekan lama untuk salin._",
        parse_mode='Markdown')

def daftar(update, context):
    user = update.effective_user
    user_id = user.id
    nama = f"{user.first_name or ''} {user.last_name or ''}".strip()
    username = user.username or "-"

    if ref.child(f'petugasTelegram/{user_id}').get():
        update.message.reply_text('✅ Anda sudah terdaftar dan dapat menggunakan bot ini.')
    else:
        ref.child(f'penggunaBaru/{user_id}').set({
            'nama': nama,
            'username': username,
            'tanggalDaftar': request.date if hasattr(request, 'date') else '',
            'status': 'pending'
        })
        update.message.reply_text('🕐 Permintaan pendaftaran terkirim. Tunggu verifikasi admin.')

def message_handler(update, context):
    text = update.message.text
    user = update.effective_user
    user_id = user.id

    if not text or text.startswith('/'):
        return

    if not ref.child(f'petugasTelegram/{user_id}').get():
        update.message.reply_text('❌ Anda belum terdaftar sebagai petugas.')
        return

    lines = text.split('\n')
    data = {}
    for line in lines:
        if ':' not in line:
            continue
        key_raw, value = line.split(':', 1)
        key = key_raw.strip().lower().replace(' ', '')
        value = value.strip()
        if key in ['lor nl', 'lornl']:
            data['L_OR_NL'] = value
        elif key == 'kodekapal':
            data['KodeKapal'] = value.upper()
        elif key == 'kodealat':
            data['KodeAlat'] = value.upper()
        elif key == 'satuan':
            data['Satuan'] = value.upper()
        elif key == 'kodeikan':
            data['KodeIkan'] = value.upper()
        elif key == 'volume':
            data['Volume'] = value

    if not all(k in data for k in ['L_OR_NL', 'KodeKapal', 'KodeAlat', 'Satuan', 'KodeIkan', 'Volume']):
        update.message.reply_text('⚠️ Format tidak lengkap. Ketik /format untuk referensi.')
        return

    if not data['Volume'].replace('.', '', 1).isdigit() or float(data['Volume']) > 500:
        update.message.reply_text('⚠️ Volume tidak valid atau melebihi 500 KG.')
        return

    kapal = ref.child(f'kapal/{data["KodeKapal"]}').get()
    alat = ref.child(f'alattangkap/{data["KodeAlat"]}').get()
    ikan = ref.child(f'jenisikan/{data["KodeIkan"]}').get()

    if not kapal or not alat or not ikan:
        update.message.reply_text('❌ Kode Kapal, Alat, atau Ikan tidak ditemukan.')
        return

    payload = {
        'L_OR_NL': data['L_OR_NL'],
        'kodeKapal': data['KodeKapal'],
        'namaKapal': kapal.get('namaKapal', ''),
        'gtKapal': kapal.get('gtKapal', ''),
        'pemilik': kapal.get('pemilik', ''),
        'kodeAlat': data['KodeAlat'],
        'namaAlat': alat.get('namaAlat', alat.get('alatTangkap', '')),
        'satuan': data['Satuan'],
        'kodeIkan': data['KodeIkan'],
        'namaIkan': ikan.get('namaIkan', ikan.get('namaLokal', '')),
        'volume': data['Volume'],
        'userTelegram': user.username or nama,
        'userIdTelegram': user_id,
        'tanggalInput': request.date if hasattr(request, 'date') else ''
    }
    ref.child('pendaratan').push(payload)

    update.message.reply_text(
        f'✅ *Data berhasil disimpan:*\n- L OR NL: {payload["L_OR_NL"]}\n- Kapal: {payload["namaKapal"]} ({payload["kodeKapal"]})\n- Alat: {payload["namaAlat"]} ({payload["kodeAlat"]})\n- Jenis Ikan: {payload["namaIkan"]} ({payload["kodeIkan"]})\n- Volume: {payload["volume"]} {payload["satuan"]}',
        parse_mode='Markdown')

# Register handlers
dispatcher.add_handler(CommandHandler('start', start))
dispatcher.add_handler(CommandHandler('format', format_handler))
dispatcher.add_handler(CommandHandler('daftar', daftar))
dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, message_handler))

# Webhook endpoint
@app.route('/api/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), bot)
    dispatcher.process_update(update)
    return jsonify({'status': 'ok'})

# Health check endpoint
@app.route('/', methods=['GET'])
def index():
    return '🚀 Bot Telegram Appendiks Webhook aktif.', 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))