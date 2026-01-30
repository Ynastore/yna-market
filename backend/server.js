// backend/server.js
require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  assertConfig,
  normalizeUsername,
  findUserByUsername,
  createUser,
  createServer,
  planToSpec,
  PTERO_DOMAIN
} = require("./ptero");

const app = express();
app.use(express.json({ limit: "2mb" }));

// =====================
// CONFIG PAKASIR
// =====================
const PAKASIR_SLUG = process.env.PAKASIR_SLUG;     // contoh: yna-store
const PAKASIR_APIKEY = process.env.PAKASIR_APIKEY; // api key project
const BASE_URL = process.env.BASE_URL;             // https://ynastore.my.id (WAJIB HTTPS utk webhook)

// =====================
// YNA STORE INFO
// =====================
const WA_ADMIN = "6283173403262";
const GROUP_BUYER = "https://chat.whatsapp.com/GSlHNKIDJJoIPGhOp5zoWs";

// =====================
// DB JSON (simple)
// =====================
const DB_DIR = path.join(__dirname, "db");
const ORDERS_PATH = path.join(DB_DIR, "orders.json");
const USERS_PATH  = path.join(DB_DIR, "users.json");

function ensureDb(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive:true });
  if(!fs.existsSync(ORDERS_PATH)) fs.writeFileSync(ORDERS_PATH, JSON.stringify({ orders: {} }, null, 2));
  if(!fs.existsSync(USERS_PATH))  fs.writeFileSync(USERS_PATH, JSON.stringify({ users: {} }, null, 2));
}
function readJson(p){
  ensureDb();
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}
function writeJson(p, data){
  ensureDb();
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function nowISO(){ return new Date().toISOString(); }
function genOrderId(prefix="YNA"){
  return `${prefix}-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`.toUpperCase();
}
function cleanWA(v){ return String(v||"").replace(/\D/g,""); }

// =====================
// PRICE RULES
// =====================

// PANEL: 5=20k, 8=25k, 10=30k, unlimited=35k
function panelAmount(plan){
  const map = { "5":20000, "8":25000, "10":30000, "unlimited":35000 };
  return map[String(plan)] || null;
}

// SCRIPT BOT prices
function scriptAmount(scriptKey){
  const map = {
    "sc_store": 120000,
    "sc_md": 150000,
    "sc_yna_ai": 180000
  };
  return map[String(scriptKey)] || null;
}

// SCRIPT download mapping (taruh file zip di folder public/downloads/)
function scriptDownloadUrl(scriptKey){
  const map = {
    "sc_store":  `${BASE_URL}/downloads/SC-STORE-YNA.zip`,
    "sc_md":     `${BASE_URL}/downloads/SC-MD-YNA.zip`,
    "sc_yna_ai": `${BASE_URL}/downloads/SC-YNA-AI.zip`
  };
  return map[String(scriptKey)] || null;
}

// SEWA BOT prices
function sewaAmount(botKey, durKey){
  // durKey: 1b,2b,3b,5b,1t,permanen
  const map = {
    bot_store: { "1b":12000, "2b":20000, "3b":35000, "5b":50000, "1t":85000, "permanen":150000 },
    bot_md:    { "1b":15000, "2b":25000, "3b":40000, "5b":60000, "1t":100000,"permanen":200000 },
    bot_ynaai: { "1b":15000, "2b":25000, "3b":40000, "5b":60000, "1t":100000,"permanen":220000 }
  };
  return map[botKey]?.[durKey] || null;
}

function labelSewa(botKey, durKey){
  const botName = {
    bot_store: "BOT STORE YNA",
    bot_md: "BOT MD YNA",
    bot_ynaai: "BOT YNA AI BUTTON"
  }[botKey] || botKey;

  const durName = {
    "1b":"1 Bulan", "2b":"2 Bulan", "3b":"3 Bulan", "5b":"5 Bulan", "1t":"1 Tahun", "permanen":"Permanen"
  }[durKey] || durKey;

  return `${botName} — ${durName}`;
}

// =====================
// Order Create
// =====================
app.post("/api/order/create", async (req, res) => {
  try{
    assertConfig();
    ensureDb();
    if(!PAKASIR_SLUG || !PAKASIR_APIKEY || !BASE_URL) {
      return res.status(500).json({ error: "Config server belum lengkap (PAKASIR_SLUG/PAKASIR_APIKEY/BASE_URL)." });
    }

    const body = req.body || {};
    const type = String(body.type || "").trim();
    const wa = cleanWA(body.wa);
    if(!type) return res.status(400).json({ error: "type wajib." });
    if(wa.length < 9) return res.status(400).json({ error: "WhatsApp tidak valid." });

    const db = readJson(ORDERS_PATH);
    db.orders ||= {};

    // ========= PANEL =========
    if(type === "panel"){
      const username = normalizeUsername(body.username);
      const plan = String(body.ram || "").trim();
      const days = Number(body.days) || 30;

      if(!/^[a-z0-9]{3,15}$/.test(username)) return res.status(400).json({ error: "Username hanya huruf kecil + angka (3-15)." });

      const amount = panelAmount(plan);
      if(!amount) return res.status(400).json({ error: "RAM plan tidak valid." });

      const order_id = genOrderId("PANEL");
      const redirect = encodeURIComponent(`${BASE_URL}/invoice.html?order_id=${order_id}`);
      const pay_url =
        `https://app.pakasir.com/pay/${encodeURIComponent(PAKASIR_SLUG)}/${amount}` +
        `?order_id=${encodeURIComponent(order_id)}` +
        `&qris_only=1&redirect=${redirect}`;

      db.orders[order_id] = {
        order_id, type, status:"pending", amount, wa,
        data: { username, plan, days },
        created_at: nowISO(), updated_at: nowISO(),
        fulfillment: null
      };
      writeJson(ORDERS_PATH, db);

      return res.json({ order_id, amount, pay_url });
    }

    // ========= SCRIPT =========
    if(type === "script"){
      const scriptKey = String(body.script_key || "").trim(); // sc_store / sc_md / sc_yna_ai
      const amount = scriptAmount(scriptKey);
      if(!amount) return res.status(400).json({ error: "Script tidak valid." });

      const order_id = genOrderId("SCRIPT");
      const redirect = encodeURIComponent(`${BASE_URL}/invoice.html?order_id=${order_id}`);
      const pay_url =
        `https://app.pakasir.com/pay/${encodeURIComponent(PAKASIR_SLUG)}/${amount}` +
        `?order_id=${encodeURIComponent(order_id)}` +
        `&qris_only=1&redirect=${redirect}`;

      db.orders[order_id] = {
        order_id, type, status:"pending", amount, wa,
        data: { scriptKey },
        created_at: nowISO(), updated_at: nowISO(),
        fulfillment: null
      };
      writeJson(ORDERS_PATH, db);

      return res.json({ order_id, amount, pay_url });
    }

    // ========= SEWA =========
    if(type === "sewa"){
      const botKey = String(body.bot_key || "").trim();   // bot_store/bot_md/bot_ynaai
      const durKey = String(body.dur_key || "").trim();   // 1b/2b/3b/5b/1t/permanen
      const groupLink = String(body.group_link || "").trim();
      const botNumber = cleanWA(body.bot_number);

      if(!groupLink.startsWith("https://chat.whatsapp.com/")){
        return res.status(400).json({ error: "Link grup WA tidak valid." });
      }
      if(botNumber.length < 9){
        return res.status(400).json({ error: "Nomor bot tidak valid." });
      }

      const amount = sewaAmount(botKey, durKey);
      if(!amount) return res.status(400).json({ error: "Paket sewa tidak valid." });

      const order_id = genOrderId("SEWA");
      const redirect = encodeURIComponent(`${BASE_URL}/invoice.html?order_id=${order_id}`);
      const pay_url =
        `https://app.pakasir.com/pay/${encodeURIComponent(PAKASIR_SLUG)}/${amount}` +
        `?order_id=${encodeURIComponent(order_id)}` +
        `&qris_only=1&redirect=${redirect}`;

      db.orders[order_id] = {
        order_id, type, status:"pending", amount, wa,
        data: { botKey, durKey, groupLink, botNumber },
        created_at: nowISO(), updated_at: nowISO(),
        fulfillment: null
      };
      writeJson(ORDERS_PATH, db);

      return res.json({ order_id, amount, pay_url });
    }

    return res.status(400).json({ error: "type tidak dikenal." });

  } catch(e){
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// =====================
// Webhook Pakasir
// =====================
app.post("/api/webhook/pakasir", (req, res) => {
  try{
    ensureDb();
    const body = req.body || {};
    const { order_id, project, amount, status } = body;

    if(!order_id || !project) return res.status(400).send("bad request");
    if(String(project) !== String(PAKASIR_SLUG)) return res.status(200).send("ignored");

    const db = readJson(ORDERS_PATH);
    const ord = db.orders?.[order_id];
    if(!ord) return res.status(200).send("unknown order");

    // validate amount
    if(Number(amount) !== Number(ord.amount)){
      ord.status = "failed";
      ord.updated_at = nowISO();
      ord.fulfillment = { ok:false, reason:"amount_mismatch", webhook: body };
      writeJson(ORDERS_PATH, db);
      return res.status(200).send("amount mismatch");
    }

    ord.updated_at = nowISO();
    ord.webhook = body;

    if(status === "completed") ord.status = "completed";
    else if(status === "failed") ord.status = "failed";
    else ord.status = status || ord.status;

    writeJson(ORDERS_PATH, db);

    if(ord.status === "completed" && !ord.fulfillment?.ok){
      fulfillOrder(order_id).catch(err => console.error("fulfill error:", err));
    }

    return res.status(200).send("ok");
  }catch(e){
    console.error(e);
    return res.status(200).send("ok");
  }
});

// =====================
// Order Status (invoice polling)
// =====================
app.get("/api/order/status", async (req, res) => {
  try{
    ensureDb();
    const order_id = String(req.query.order_id || "");
    if(!order_id) return res.status(400).json({ error:"order_id wajib" });

    const db = readJson(ORDERS_PATH);
    const ord = db.orders?.[order_id];
    if(!ord) return res.status(404).json({ error:"order tidak ditemukan" });

    if(ord.status === "completed" && !ord.fulfillment?.ok){
      await fulfillOrder(order_id);
    }

    return res.json({
      order_id: ord.order_id,
      type: ord.type,
      status: ord.status,
      amount: ord.amount,
      updated_at: ord.updated_at,
      fulfillment: ord.fulfillment
    });
  } catch(e){
    console.error(e);
    return res.status(500).json({ error: e.message || "server error" });
  }
});

// =====================
// Fulfillment (PANEL/SCRIPT/SEWA)
// =====================
async function fulfillOrder(order_id){
  ensureDb();
  const db = readJson(ORDERS_PATH);
  const ord = db.orders?.[order_id];
  if(!ord) return;
  if(ord.fulfillment?.ok) return; // idempotent

  // ===== PANEL =====
  if(ord.type === "panel"){
    const { username, plan } = ord.data || {};
    const u = normalizeUsername(username);
    const spec = planToSpec(plan);
    if(!spec){
      ord.fulfillment = { ok:false, reason:"invalid_plan" };
      ord.updated_at = nowISO();
      writeJson(ORDERS_PATH, db);
      return;
    }

    // USERS DB: simpan mapping username -> ptero userId + list server
    const udb = readJson(USERS_PATH);
    udb.users ||= {};

    let pUser = await findUserByUsername(u);
    let createdPassword = null;

    if(!pUser){
      const created = await createUser({ username: u });
      pUser = created.user;
      createdPassword = created.password;
    }

    const server = await createServer({
      userId: pUser.id,
      username: u,
      plan
    });

    udb.users[u] ||= { username: u, ptero_user_id: pUser.id, servers: [] };
    udb.users[u].ptero_user_id = pUser.id;
    udb.users[u].servers ||= [];
    udb.users[u].servers.push({
      server_id: server.id,
      name: server.name,
      plan,
      created_at: nowISO()
    });
    writeJson(USERS_PATH, udb);

    ord.fulfillment = {
      ok: true,
      type: "panel",
      username: pUser.username,
      email: pUser.email,
      password: createdPassword, // hanya kalau akun baru
      panel_login: PTERO_DOMAIN,
      server_id: server.id,
      server_name: server.name,
      plan,
      spec,
      group: GROUP_BUYER,
      wa_admin: WA_ADMIN
    };
    ord.updated_at = nowISO();
    writeJson(ORDERS_PATH, db);
    return;
  }

  // ===== SCRIPT =====
  if(ord.type === "script"){
    const { scriptKey } = ord.data || {};
    const dl = scriptDownloadUrl(scriptKey);

    if(!dl){
      ord.fulfillment = { ok:false, reason:"download_not_configured" };
      ord.updated_at = nowISO();
      writeJson(ORDERS_PATH, db);
      return;
    }

    const scriptName = {
      sc_store: "SC STORE — BOT KHUSUS JUALAN",
      sc_md: "SC MD (Multi Device)",
      sc_yna_ai: "SC YNA AI"
    }[scriptKey] || scriptKey;

    ord.fulfillment = {
      ok: true,
      type: "script",
      script_key: scriptKey,
      script_name: scriptName,
      download_url: dl,
      group: GROUP_BUYER,
      wa_admin: WA_ADMIN
    };
    ord.updated_at = nowISO();
    writeJson(ORDERS_PATH, db);
    return;
  }

  // ===== SEWA =====
  if(ord.type === "sewa"){
    const { botKey, durKey, groupLink, botNumber } = ord.data || {};
    const label = labelSewa(botKey, durKey);

    ord.fulfillment = {
      ok: true,
      type: "sewa",
      paket: label,
      group_link: groupLink,
      bot_number: botNumber,
      wa_admin: WA_ADMIN
    };
    ord.updated_at = nowISO();
    writeJson(ORDERS_PATH, db);
    return;
  }

  // fallback
  ord.fulfillment = { ok:false, reason:"type_not_supported" };
  ord.updated_at = nowISO();
  writeJson(ORDERS_PATH, db);
}

// =====================
// Static frontend
// =====================
const PUBLIC_DIR = path.join(__dirname, "..");
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_,res)=>res.json({ ok:true, time: nowISO() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("YNA backend running on port", PORT));
