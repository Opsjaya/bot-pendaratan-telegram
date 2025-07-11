import fetch from 'node-fetch';
import admin from 'firebase-admin';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_KEY_BASE64, "base64").toString("utf-8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://appendiks-e02a8-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("🚀 Bot Appendiks aktif di Vercel.");
  }

  try {
    const message = req.body.message;
    if (!message || !message.text) return res.status(200).end();

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text.trim();

    const sendMessage = async (text) => {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      });
    };

    const getData = async (path) => {
      const snap = await db.ref(path).once("value");
      return snap.exists() ? snap.val() : null;
    };

    const isAuthorized = async (id) => {
      const data = await getData(`petugasTelegram/${id}`);
      return !!data;
    };

    if (text === "/start") {
      return await sendMessage(`👋 *Halo!* Selamat datang di *Bot Pendaratan Appendiks*.\n\nKetik */format* untuk melihat format input.\nKetik */daftar* jika belum terdaftar.`);
    }

    if (text === "/format") {
      return await sendMessage(`✏️ *Format Input:*

\`\`\`
L OR NL : NL
Kode Kapal : 1422
Kode Alat : JIH
Satuan : KG
Kode Ikan : TNL
Volume : 200
\`\`\`
_Tekan lama untuk salin._`);
    }

    if (text === "/daftar") {
      const nama = `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim();
      const username = message.from.username || "-";
      const userRef = db.ref(`petugasTelegram/${userId}`);
      const newUserRef = db.ref(`penggunaBaru/${userId}`);

      const snap = await userRef.once("value");
      if (snap.exists()) {
        return await sendMessage("✅ Anda sudah terdaftar dan dapat menggunakan bot ini.");
      } else {
        await newUserRef.set({
          nama,
          username,
          tanggalDaftar: new Date().toISOString(),
          status: "pending",
        });
        return await sendMessage("🕐 Permintaan pendaftaran terkirim. Tunggu verifikasi admin.");
      }
    }

    if (!await isAuthorized(userId)) {
      return await sendMessage("❌ Anda belum terdaftar sebagai petugas.");
    }

    const lines = text.split("\n");
    const data = {};
    lines.forEach(line => {
      const [keyRaw, ...rest] = line.split(":");
      if (!keyRaw || rest.length === 0) return;
      const value = rest.join(":").trim();
      const key = keyRaw.trim().toLowerCase().replace(/\s+/g, "");
      if (key === "lor nl" || key === "lornl") data.L_OR_NL = value;
      else if (key === "kodekapal") data.KodeKapal = value.toUpperCase();
      else if (key === "kodealat") data.KodeAlat = value.toUpperCase();
      else if (key === "satuan") data.Satuan = value.toUpperCase();
      else if (key === "kodeikan") data.KodeIkan = value.toUpperCase();
      else if (key === "volume") data.Volume = value;
    });

    if (!data.L_OR_NL || !data.KodeKapal || !data.KodeAlat || !data.Satuan || !data.KodeIkan || !data.Volume) {
      return await sendMessage("⚠️ Format tidak lengkap. Ketik /format untuk referensi.");
    }

    if (!/^\d+(\.\d+)?$/.test(data.Volume) || parseFloat(data.Volume) > 500) {
      return await sendMessage("⚠️ Volume tidak valid atau melebihi 500 KG.");
    }

    const kapalData = await getData(`kapal/${data.KodeKapal}`);
    const alatData = await getData(`alattangkap/${data.KodeAlat}`);
    const ikanData = await getData(`jenisikan/${data.KodeIkan}`);

    if (!kapalData || !alatData || !ikanData) {
      return await sendMessage("❌ Kode Kapal, Alat, atau Ikan tidak ditemukan.");
    }

    const payload = {
      L_OR_NL: data.L_OR_NL,
      kodeKapal: data.KodeKapal,
      namaKapal: kapalData.namaKapal || "",
      gtKapal: kapalData.gtKapal || "",
      pemilik: kapalData.pemilik || "",
      kodeAlat: data.KodeAlat,
      namaAlat: alatData.namaAlat || alatData.alatTangkap || "",
      satuan: data.Satuan,
      kodeIkan: data.KodeIkan,
      namaIkan: ikanData.namaIkan || ikanData.namaLokal || "",
      volume: data.Volume,
      userTelegram: message.from.username || `${message.from.first_name} ${message.from.last_name}`.trim(),
      userIdTelegram: userId,
      tanggalInput: new Date().toISOString(),
    };

    await db.ref("pendaratan").push(payload);

    await sendMessage(`✅ *Data berhasil disimpan:*
- L OR NL: ${payload.L_OR_NL}
- Kapal: ${payload.namaKapal} (${payload.kodeKapal})
- Alat: ${payload.namaAlat} (${payload.kodeAlat})
- Jenis Ikan: ${payload.namaIkan} (${payload.kodeIkan})
- Volume: ${payload.volume} ${payload.satuan}`);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(200).json({ ok: false });
  }
};
