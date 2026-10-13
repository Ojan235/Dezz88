/**
 * ═══════════════════════════════════════════════
 *   👑 LICENSE SERVER — Owner: OJAN
 *   Support 2 format tokens.json:
 *   1. { "tokens": ["string", "string"] }
 *   2. [ { "token": "...", "owner": "..." } ]
 * ═══════════════════════════════════════════════
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ═══════════════════════════════════════════════
//   CONFIG
// ═══════════════════════════════════════════════
const DB_FILE = path.join(__dirname, "tokens.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "ojan-rahasia-2026";
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════
//   DATABASE — SUPPORT 2 FORMAT
// ═══════════════════════════════════════════════
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ tokens: [] }, null, 2));
      return [];
    }

    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    // ─── FORMAT 1: Array of objects (standar) ───
    if (Array.isArray(raw)) {
      return raw;
    }

    // ─── FORMAT 2: { tokens: ["string", "string"] } ───
    if (raw && Array.isArray(raw.tokens)) {
      return raw.tokens.map(t => {
        // Kalau item udah object, pakai apa adanya
        if (typeof t === "object" && t !== null) return t;
        // Kalau string, convert ke object default
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
    // Simpan dalam format standar (array of objects)
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("❌ Gagal save DB:", err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
//   LOGGER
// ═══════════════════════════════════════════════
function log(icon, msg) {
  const time = new Date().toLocaleTimeString("id-ID", { hour12: false });
  console.log(`[${time}] ${icon} ${msg}`);
}

// ═══════════════════════════════════════════════
//   MIDDLEWARE ADMIN
// ═══════════════════════════════════════════════
function checkAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    log("🚫", `Akses admin ditolak dari ${req.ip}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// ═══════════════════════════════════════════════
//   1. HEALTH CHECK
// ═══════════════════════════════════════════════
app.get("/", (req, res) => {
  const tokens = loadDB();
  res.json({
    status: "ok",
    service: "License Server",
    owner: "ojan",
    totalTokens: tokens.length,
    uptime: process.uptime() + "s",
    time: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════
//   2. VALIDATE TOKEN
// ═══════════════════════════════════════════════
app.post("/v1/validate", (req, res) => {
  const { token, hwid } = req.body;

  if (!token) {
    log("❌", "Validate gagal: token kosong");
    return res.json({ valid: false, message: "Token kosong" });
  }

  const tokens = loadDB();
  const record = tokens.find(t => t.token === token);

  if (!record) {
    log("❌", `Validate gagal: token ${token.slice(0, 15)}... tidak terdaftar`);
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

  // HWID Lock
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
  record.lastIp = req.ip;
  saveDB(tokens); // ← auto-upgrade ke format standar

  log("✅", `Validate OK: ${record.owner} (${record.plan})`);
  return res.json({
    valid: true,
    message: "Token valid",
    owner: record.owner,
    plan: record.plan,
    expiredAt: record.expiredAt
  });
});

// ═══════════════════════════════════════════════
//   3. ADMIN — LIST TOKENS
// ═══════════════════════════════════════════════
app.get("/v1/tokens", checkAdmin, (req, res) => {
  const tokens = loadDB();
  res.json({
    total: tokens.length,
    tokens: tokens.map(t => ({
      token: t.token.slice(0, 15) + "...",
      owner: t.owner,
      plan: t.plan,
      expiredAt: t.expiredAt,
      banned: t.banned,
      hwid: t.hwid ? t.hwid.slice(0, 12) + "..." : null,
      lastSeen: t.lastSeen || null
    }))
  });
});

// ═══════════════════════════════════════════════
//   4. ADMIN — TAMBAH TOKEN
// ═══════════════════════════════════════════════
app.post("/v1/tokens/add", checkAdmin, (req, res) => {
  const { token, owner, plan, expiredAt } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token wajib diisi" });
  }

  const tokens = loadDB();

  if (tokens.find(t => t.token === token)) {
    return res.status(409).json({ error: "Token sudah ada" });
  }

  tokens.push({
    token,
    owner: owner || "unknown",
    plan: plan || "basic",
    expiredAt: expiredAt || null,
    hwid: null,
    banned: false,
    createdAt: new Date().toISOString()
  });

  saveDB(tokens);
  log("➕", `Token baru: ${owner} (${plan})`);
  res.json({ success: true, message: "Token berhasil ditambahkan" });
});

// ═══════════════════════════════════════════════
//   5. ADMIN — BAN TOKEN
// ═══════════════════════════════════════════════
app.post("/v1/tokens/ban", checkAdmin, (req, res) => {
  const { token } = req.body;
  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);

  if (!rec) return res.status(404).json({ error: "Token gak ada" });

  rec.banned = true;
  saveDB(tokens);
  log("🚫", `Token di-ban: ${rec.owner}`);
  res.json({ success: true, message: `${rec.owner} telah di-ban` });
});

// ═══════════════════════════════════════════════
//   6. ADMIN — UNBAN TOKEN
// ═══════════════════════════════════════════════
app.post("/v1/tokens/unban", checkAdmin, (req, res) => {
  const { token } = req.body;
  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);

  if (!rec) return res.status(404).json({ error: "Token gak ada" });

  rec.banned = false;
  saveDB(tokens);
  log("✅", `Token di-unban: ${rec.owner}`);
  res.json({ success: true, message: `${rec.owner} telah di-unban` });
});

// ═══════════════════════════════════════════════
//   7. ADMIN — RESET HWID
// ═══════════════════════════════════════════════
app.post("/v1/tokens/reset-hwid", checkAdmin, (req, res) => {
  const { token } = req.body;
  const tokens = loadDB();
  const rec = tokens.find(t => t.token === token);

  if (!rec) return res.status(404).json({ error: "Token gak ada" });

  rec.hwid = null;
  saveDB(tokens);
  log("🔓", `HWID di-reset: ${rec.owner}`);
  res.json({ success: true, message: `HWID ${rec.owner} berhasil di-reset` });
});

// ═══════════════════════════════════════════════
//   8. ADMIN — HAPUS TOKEN
// ═══════════════════════════════════════════════
app.post("/v1/tokens/delete", checkAdmin, (req, res) => {
  const { token } = req.body;
  let tokens = loadDB();
  const before = tokens.length;
  const rec = tokens.find(t => t.token === token);

  tokens = tokens.filter(t => t.token !== token);
  saveDB(tokens);

  log("🗑️", `Token dihapus: ${rec?.owner || "unknown"}`);
  res.json({ success: true, deleted: before - tokens.length });
});

// ═══════════════════════════════════════════════
//   9. ADMIN — STATISTIK
// ═══════════════════════════════════════════════
app.get("/v1/stats", checkAdmin, (req, res) => {
  const tokens = loadDB();
  const now = new Date();

  const stats = {
    total: tokens.length,
    active: tokens.filter(t =>
      !t.banned && (!t.expiredAt || new Date(t.expiredAt) > now)
    ).length,
    banned: tokens.filter(t => t.banned).length,
    expired: tokens.filter(t =>
      t.expiredAt && new Date(t.expiredAt) < now
    ).length,
    byPlan: {}
  };

  tokens.forEach(t => {
    stats.byPlan[t.plan] = (stats.byPlan[t.plan] || 0) + 1;
  });

  res.json(stats);
});

// ═══════════════════════════════════════════════
//   10. 404 HANDLER
// ═══════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
});

// ═══════════════════════════════════════════════
//   START SERVER
// ═══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   👑 LICENSE SERVER — Owner: OJAN        ║
╠══════════════════════════════════════════╣
║   🚀 Port      : ${PORT}
║   🔑 Admin Key : ${ADMIN_KEY.slice(0, 8)}...
║   📋 Tokens    : ${loadDB().length}
║   🌐 URL       : http://localhost:${PORT}
╚══════════════════════════════════════════╝
  `);
  log("✅", "License server siap menerima request");
});
