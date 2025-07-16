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
    databaseURL: "https://appendiks-966f0-default-rtdb.asia-southeast1.firebasedatabase.app
      ",
  });
}

const db = admin.database();

// Fungsi untuk membersihkan key Firebase dari karakter ilegal
const sanitizeFirebaseKey = (key) => key?.replace(/[.#$\[\]]/g, "") || "";

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("🚀 Bot Appendiks aktif di Vercel.");
  }

  try {
    const update = req.body;
    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return res.status(200).send("OK");
    }

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
      try {
        const snap = await db.ref(path).once("value");
        return snap.exists() ? snap.val() : null;
      } catch (err) {
        console.error(`Firebase error at path ${path}:`, err.message);
        return null;
      }
    };

    const isAuthorized = async (id) => {
      const data = await getData(`petugasTelegram/${id}`);
      return !!data;
    };

    // Handle /start
    if (text === "/start") {
  await sendMessage(`👋 *Halo, Petugas Enumerator!*

Selamat datang di *Bot Pendataan Pendaratan Ikan Appendiks* 🐟🚤.

Bot ini membantu Anda *mencatat data pendaratan ikan secara cepat dan rapi* langsung dari Telegram, sehingga Anda *tidak perlu repot mencatat manual dan rekap ulang*.

✨ **Fitur Bot:**
✅ Input data pendaratan langsung via chat  
✅ Validasi kode kapal, alat tangkap, dan jenis ikan otomatis  
✅ Data langsung tersimpan ke sistem secara real-time  
✅ Mudah digunakan kapan saja, di mana saja

✨ **Cara Penggunaan:**
1️⃣ Ketik */format* untuk melihat format input.  
2️⃣ Ketik */daftar* jika Anda belum terdaftar.  
3️⃣ Setelah terdaftar, Anda dapat langsung mengirim data pendaratan sesuai format.

🪐 Data Anda akan membantu *pengelolaan sumber daya ikan lebih baik dan akurat*.  
Terima kasih telah menjadi bagian dari *Enumerasi Cerdas Appendiks*.

—

*Salam, Tim Appendiks*`);
  return res.status(200).json({ ok: true });
}


    // Handle /format
    if (text === "/format") {
      await sendMessage(`✏️ *Format Input:*\n\n\`\`\`\nL OR NL : NL\nKode Kapal : 1422\nKode Alat : JIH\nSatuan : KG\nKode Ikan : TNL\nVolume : 200\n\`\`\`\n_Tekan lama untuk salin._`);
      return res.status(200).json({ ok: true });
    }

    // Handle /daftar
    if (text === "/daftar") {
      const nama = `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim();
      const username = message.from.username || "-";
      const userRef = db.ref(`petugasTelegram/${userId}`);
      const newUserRef = db.ref(`penggunaBaru/${userId}`);
      const snap = await userRef.once("value");

      if (snap.exists()) {
        await sendMessage("✅ Anda sudah terdaftar dan dapat menggunakan bot ini.");
      } else {
        await newUserRef.set({
          nama,
          username,
          tanggalDaftar: new Date().toISOString(),
          status: "pending",
        });
        await sendMessage("🕐 Permintaan pendaftaran terkirim. Tunggu verifikasi admin.");
      }
      return res.status(200).json({ ok: true });
    }

    // Cek otorisasi
    if (!await isAuthorized(userId)) {
      await sendMessage("❌ Anda belum terdaftar sebagai petugas.");
      return res.status(200).json({ ok: true });
    }

    // Proses input data
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
      await sendMessage("⚠️ Format tidak lengkap. Ketik /format untuk referensi.");
      return res.status(200).json({ ok: true });
    }

    if (!/^\d+(\.\d+)?$/.test(data.Volume) || parseFloat(data.Volume) > 500) {
      await sendMessage("⚠️ Volume tidak valid atau melebihi 500 KG.");
      return res.status(200).json({ ok: true });
    }

    const kodeKapal = sanitizeFirebaseKey(data.KodeKapal);
    const kodeAlat = sanitizeFirebaseKey(data.KodeAlat);
    const kodeIkan = sanitizeFirebaseKey(data.KodeIkan);

    const kapalData = await getData(`kapal/${kodeKapal}`);
    const alatData = await getData(`alattangkap/${kodeAlat}`);
    const ikanData = await getData(`jenisikan/${kodeIkan}`);

    if (!kapalData || !alatData || !ikanData) {
      await sendMessage("❌ Kode Kapal, Alat, atau Ikan tidak ditemukan.");
      return res.status(200).json({ ok: true });
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

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Webhook Error:", error);
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.ADMIN_CHAT_ID || message?.from?.id,
        text: `🚨 Bot error:\n${error.message}`
      }),
    });
    return res.status(200).json({ ok: false, error: error.message });
  }
};
