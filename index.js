/**
 * ═══════════════════════════════════════════════
 *   👑 OJAN LICENSE SYSTEM — ALL IN ONE
 *   
 *   Fitur:
 *   - Pelanggan kirim token → kamu approve/reject
 *   - Database token (tokens.json)
 *   - Validasi token untuk bot client
 *   - Owner commands: list, ban, unban, delete, reset hwid
 *   
 *   Owner: OJAN
 * ═══════════════════════════════════════════════
 */

const { Telegraf } = require("telegraf");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════
//   ⚙️ CONFIG — GANTI INI DULU
// ═══════════════════════════════════════════════
const BOT_TOKEN = "8841865151:AAGwhp4tc_HOAuw7CCxvCjnLB3IXGnVqWxU";     // ← dari @BotFather
const OWNER_ID = "7970458438";            // ← dari @userinfobot
const ADMIN_KEY = "ojan-rahasia-2026";              // ← password admin API
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════
//   DATABASE
// ═══════════════════════════════════════════════
const DB_FILE = path.join(__dirname, "tokens.json");

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, "[]");
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    // Support format { tokens: [...] } juga
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.tokens)) {
      return raw.tokens.map(t => {
        if (typeof t === "object") return t;
        return {
          token: t,
          owner: "ojan",
          plan: "premium",
          expiredAt: null,
          hwid: null,
          banned: false
        };
      });
    }
    return [];
  } catch (err) {
    console.error("❌ Gagal load DB:", err.message);
    return [];
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("❌ Gagal save DB:", err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
//   HELPER
// ═══════════════════════════════════════════════
const log = (icon, msg) => {
  const t = new Date().toLocaleTimeString("id-ID", { hour12: false });
  console.log(`[${t}] ${icon} ${msg}`);
};

const isOwner = (ctx) => ctx.from.id.toString() === OWNER_ID;

// ═══════════════════════════════════════════════
//   INIT BOT + SERVER
// ═══════════════════════════════════════════════
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ═══════════════════════════════════════════════
//   API ENDPOINTS (buat bot client validasi)
// ═══════════════════════════════════════════════

// ─── Health Check ───
app.get("/", (req, res) => {
  const tokens = loadDB();
  res.json({
    status: "ok",
    service: "Ojan License System",
    owner: "ojan",
    totalTokens: tokens.length,
    uptime: process.uptime() + "s",
    time: new Date().toISOString()
  });
});

// ─── Validate Token ───
app.post("/v1/validate", (req, res) => {
  const { token, hwid } = req.body;

  if (!token) {
    return res.json({ valid: false, message: "Token kosong" });
  }

  const tokens = loadDB();
  const record = tokens.find(t => t.token === token);

  if (!record) {
    log("❌", `Validate gagal: token ${token.slice(0, 15)}... gak terdaftar`);
    return res.json({ valid: false, message: "Token tidak terdaftar" });
  }

  if (record.banned) {
    log("🚫", `Validate gagal: ${record.owner} (banned)`);
    return res.json({ valid: false, message: "Token telah di-banned" });
  }

  if (record.expiredAt && new Date(record.expiredAt) < new Date()) {
    log("⏰", `Validate gagal: ${record.owner} (expired)`);
    return res.json({ valid: false, message: "Token expired" });
  }

  // HWID lock
  if (hwid) {
    if (!record.hwid) {
      record.hwid = hwid;
      log("🔒", `Token ${record.owner} di-lock ke HWID ${hwid.slice(0, 12)}...`);
    } else if (record.hwid !== hwid) {
      log("⚠️", `Validate gagal: HWID tidak cocok (${record.owner})`);
      return res.json({
        valid: false,
        message: "Token dipakai di device lain"
      });
    }
  }

  record.lastSeen = new Date().toISOString();
  saveDB(tokens);

  log("✅", `Validate OK: ${record.owner} (${record.plan})`);
  res.json({
    valid: true,
    message: "Token valid",
    owner: record.owner,
    plan: record.plan,
    expiredAt: record.expiredAt
  });
});

// ─── Admin API (buat kalau butuh) ───
function checkAdmin(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

app.get("/v1/tokens", checkAdmin, (req, res) => {
  res.json({ total: loadDB().length, tokens: loadDB() });
});

app.get("/v1/stats", checkAdmin, (req, res) => {
  const tokens = loadDB();
  const now = new Date();
  res.json({
    total: tokens.length,
    active: tokens.filter(t => !t.banned && (!t.expiredAt || new Date(t.expiredAt) > now)).length,
    banned: tokens.filter(t => t.banned).length,
    expired: tokens.filter(t => t.expiredAt && new Date(t.expiredAt) < now).length
  });
});

// ═══════════════════════════════════════════════
//   BOT TELEGRAM — OWNER COMMAND
// ═══════════════════════════════════════════════
bot.start((ctx) => {
  // ─── Pelanggan ───
  if (!isOwner(ctx)) {
    return ctx.reply(
      `👋 Hai <b>${ctx.from.first_name}</b>!\n\n` +
      `Kirim token bot kamu ke sini dengan format:\n` +
      `<code>TOKEN|NAMA_KAMU</code>\n\n` +
      `Contoh:\n` +
      `<code>8841865151:AAGwhp4tc_xxx|budi</code>\n\n` +
      `Admin (Ojan) bakal approve token kamu.`,
      { parse_mode: "HTML" }
    );
  }

  // ─── Owner ───
  ctx.reply(
    `👑 <b>OJAN LICENSE SYSTEM</b>\n\n` +
    `📋 <b>Command Owner:</b>\n` +
    `/listtoken — lihat daftar token\n` +
    `/stattoken — statistik\n` +
    `/bantoken TOKEN — ban token\n` +
    `/unbantoken TOKEN — unban\n` +
    `/resethwid TOKEN — reset HWID\n` +
    `/deltoken TOKEN — hapus token\n\n` +
    `📥 Pelanggan kirim token ke bot ini:\n` +
    `<code>TOKEN|NAMA</code>`,
    { parse_mode: "HTML" }
  );
});

// ═══════════════════════════════════════════════
//   PELANGGAN KIRIM TOKEN → FORWARD KE OWNER
// ═══════════════════════════════════════════════
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  if (isOwner(ctx)) {
    return ctx.reply("ℹ️ Kamu owner. Pakai command buat kelola token.");
  }

  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

  let token = text;
  let nama = username;

  if (text.includes("|")) {
    [token, nama] = text.split("|").map(s => s.trim());
  }

  // Validasi format token Telegram
  if (!token.includes(":") || token.length < 30) {
    return ctx.reply(
      `❌ <b>Format token salah!</b>\n\n` +
      `Token Telegram formatnya:\n` +
      `<code>1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ</code>\n\n` +
      `Kirim dengan format:\n` +
      `<code>TOKEN|NAMA_KAMU</code>`,
      { parse_mode: "HTML" }
    );
  }

  await ctx.reply(
    `✅ <b>Token kamu sudah diterima!</b>\n\n` +
    `Tunggu admin approve ya...`,
    { parse_mode: "HTML" }
  );

  // Notif ke owner
  await bot.telegram.sendMessage(
    OWNER_ID,
    `🔔 <b>REQUEST TOKEN BARU</b>\n\n` +
    `👤 Dari: ${username}\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `📛 Nama: <code>${nama}</code>\n` +
    `🔑 Token: <code>${token}</code>\n\n` +
    `Approve?`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `ok:${userId}:${token}:${nama}` },
            { text: "❌ Reject", callback_data: `no:${userId}` }
          ]
        ]
      }
    }
  );

  log("📥", `Token baru dari ${username}: ${token.slice(0, 20)}...`);
});

// ═══════════════════════════════════════════════
//   CALLBACK: APPROVE
// ═══════════════════════════════════════════════
bot.action(/^ok:(\d+):(.+):(.+)$/, async (ctx) => {
  if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Owner only!");

  const [, userId, token, nama] = ctx.match;
  const tokens = loadDB();

  if (tokens.find(t => t.token === token)) {
    return ctx.editMessageText(`⚠️ Token udah ada di database.`);
  }

  tokens.push({
    token,
    owner: nama,
    plan: "premium",
    expiredAt: null,
    hwid: null,
    banned: false,
    createdAt: new Date().toISOString()
  });
  saveDB(tokens);

  await ctx.editMessageText(
    `✅ <b>Token Di-approve!</b>\n\n` +
    `👤 Pelanggan: <code>${nama}</code>\n` +
    `🆔 ID: <code>${userId}</code>\n` +
    `🔑 Token: <code>${token.slice(0, 30)}...</code>`,
    { parse_mode: "HTML" }
  );

  try {
    await bot.telegram.sendMessage(
      userId,
      `🎉 <b>Token kamu di-approve!</b>\n\n` +
      `Sekarang bisa jalanin script bug-nya.`,
      { parse_mode: "HTML" }
    );
  } catch (e) {}

  log("✅", `Token approved: ${nama}`);
});

// ═══════════════════════════════════════════════
//   CALLBACK: REJECT
// ═══════════════════════════════════════════════
bot.action(/^no:(\d+)$/, async (ctx) => {
  if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Owner only!");

  const userId = ctx.match[1];
  await ctx.editMessageText(`❌ Token di-reject.`);

  try {
    await bot.telegram.sendMessage(
      userId,
      `❌ <b>Maaf, token kamu di-reject.</b>\n\nHubungi @Janxcc.`,
      { parse_mode: "HTML" }
    );
  } catch (e) {}

  log("❌", `Token rejected: ${userId}`);
});

// ═══════════════════════════════════════════════
//   OWNER COMMANDS
// ═══════════════════════════════════════════════
bot.command("listtoken", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const tokens = loadDB();

  if (tokens.length === 0) return ctx.reply("📋 Belum ada token.");

  let text = `📋 <b>DAFTAR TOKEN (${tokens.length})</b>\n\n`;
  tokens.forEach((t, i) => {
    const s = t.banned ? "🚫" : "✅";
    text += `${i + 1}. ${s} <b>${t.owner}</b> (${t.plan})\n`;
    text += `   <code>${t.token}</code>\n\n`;
  });

  ctx.reply(text, { parse_mode: "HTML" });
});

bot.command("stattoken", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const tokens = loadDB();
  const now = new Date();

  ctx.reply(
    `📊 <b>STATISTIK</b>\n\n` +
    `📦 Total: <b>${tokens.length}</b>\n` +
    `✅ Aktif: <b>${tokens.filter(t => !t.banned && (!t.expiredAt || new Date(t.expiredAt) > now)).length}</b>\n` +
    `🚫 Banned: <b>${tokens.filter(t => t.banned).length}</b>\n` +
    `⏰ Expired: <b>${tokens.filter(t => t.expiredAt && new Date(t.expiredAt) < now).length}</b>`,
    { parse_mode: "HTML" }
  );
});

bot.command("bantoken", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const token = ctx.message.text.split(" ")[1];
  if (!token) return ctx.reply("❌ /bantoken TOKEN");

  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);
  if (!rec) return ctx.reply("❌ Token gak ada di database.");

  rec.banned = true;
  saveDB(tokens);
  ctx.reply(`🚫 Token <b>${rec.owner}</b> di-ban.`, { parse_mode: "HTML" });
  log("🚫", `Token banned: ${rec.owner}`);
});

bot.command("unbantoken", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const token = ctx.message.text.split(" ")[1];
  if (!token) return ctx.reply("❌ /unbantoken TOKEN");

  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);
  if (!rec) return ctx.reply("❌ Token gak ada.");

  rec.banned = false;
  saveDB(tokens);
  ctx.reply(`✅ Token <b>${rec.owner}</b> di-unban.`, { parse_mode: "HTML" });
});

bot.command("resethwid", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const token = ctx.message.text.split(" ")[1];
  if (!token) return ctx.reply("❌ /resethwid TOKEN");

  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);
  if (!rec) return ctx.reply("❌ Token gak ada.");

  rec.hwid = null;
  saveDB(tokens);
  ctx.reply(`🔓 HWID <b>${rec.owner}</b> di-reset.`, { parse_mode: "HTML" });
});

bot.command("deltoken", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⛔ Owner only!");
  const token = ctx.message.text.split(" ")[1];
  if (!token) return ctx.reply("❌ /deltoken TOKEN");

  let tokens = loadDB();
  const rec = tokens.find(t => t.token === token);
  if (!rec) return ctx.reply("❌ Token gak ada.");

  tokens = tokens.filter(t => t.token !== token);
  saveDB(tokens);
  ctx.reply(`🗑️ Token <b>${rec.owner}</b> dihapus.`, { parse_mode: "HTML" });
});

// ═══════════════════════════════════════════════
//   START SEMUA
// ═══════════════════════════════════════════════
app.listen(PORT, () => {
  log("🌐", `API server jalan di port ${PORT}`);
  log("📋", `Total token: ${loadDB().length}`);
});

bot.launch().then(() => {
  log("✅", `Bot Telegram jalan! Owner ID: ${OWNER_ID}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
