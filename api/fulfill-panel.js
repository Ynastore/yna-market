// api/fulfill-panel.js
// Vercel Serverless Function (Node.js)
// POST /api/fulfill-panel
//
// Body: { order_id, amount, wa, username, password }
//
// ENV wajib:
// PAKASIR_SLUG, PAKASIR_APIKEY
// PTERO_DOMAIN, PTERO_APIKEY, PTERO_EGG, PTERO_NESTID, PTERO_LOCID
// ADMIN_WA, BUYER_GROUP_LINK

const PAKASIR_SLUG = process.env.PAKASIR_SLUG;
const PAKASIR_APIKEY = process.env.PAKASIR_APIKEY;

const PTERO_DOMAIN = process.env.PTERO_DOMAIN;
const PTERO_APIKEY = process.env.PTERO_APIKEY;
const PTERO_EGG = parseInt(process.env.PTERO_EGG || "15", 10);
const PTERO_NESTID = parseInt(process.env.PTERO_NESTID || "5", 10);
const PTERO_LOCID = parseInt(process.env.PTERO_LOCID || "1", 10);

const ADMIN_WA = process.env.ADMIN_WA || "6283173403262";
const BUYER_GROUP_LINK = process.env.BUYER_GROUP_LINK || "";

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function cleanUsername(u) {
  return String(u || "").trim().toLowerCase();
}
function validUsername(u) {
  return /^[a-z0-9]{3,15}$/.test(u);
}
function normWA(input) {
  let s = String(input || "").trim().replace(/\s+/g, "");
  if (!s) return "";
  if (s.startsWith("08")) s = "62" + s.slice(1);
  s = s.replace(/\D/g, "");
  return s;
}

async function fjson(url, opts = {}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

// ---- Pakasir: cek status transaksi (wajib order_id + amount)
async function pakasirDetail({ order_id, amount }) {
  const url =
    `https://app.pakasir.com/api/transactiondetail` +
    `?project=${encodeURIComponent(PAKASIR_SLUG)}` +
    `&amount=${encodeURIComponent(amount)}` +
    `&order_id=${encodeURIComponent(order_id)}` +
    `&api_key=${encodeURIComponent(PAKASIR_APIKEY)}`;

  const { ok, data, status } = await fjson(url);
  if (!ok) {
    throw new Error(`Pakasir detail gagal (${status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data?.transaction;
}

// ---- Pterodactyl helpers
function pteroHeaders() {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${PTERO_APIKEY}`,
  };
}

async function pteroFindUserByUsername(username) {
  // filter[username] gak selalu tersedia di semua versi panel,
  // jadi fallback: list + cari manual (limit kecil dulu).
  const url = `${PTERO_DOMAIN}/api/application/users?per_page=100`;
  const { ok, data, status } = await fjson(url, { headers: pteroHeaders() });
  if (!ok) throw new Error(`Ptero users list gagal (${status})`);

  const found = (data?.data || []).find(x => x?.attributes?.username === username);
  return found ? found.attributes : null;
}

async function pteroCreateUser({ username, password }) {
  const email = `${username}@gmail.com`;
  const first_name = `${username} Server`;
  const body = {
    email,
    username,
    first_name,
    last_name: "YNA",
    language: "en",
    password,
  };

  const url = `${PTERO_DOMAIN}/api/application/users`;
  const { ok, data, status } = await fjson(url, {
    method: "POST",
    headers: pteroHeaders(),
    body: JSON.stringify(body),
  });

  if (!ok || data?.errors) {
    const err = data?.errors?.[0] || data;
    throw new Error(`Gagal create user ptero (${status}): ${JSON.stringify(err).slice(0, 300)}`);
  }
  return data?.attributes;
}

async function pteroGetEggStartup() {
  const url = `${PTERO_DOMAIN}/api/application/nests/${PTERO_NESTID}/eggs/${PTERO_EGG}`;
  const { ok, data, status } = await fjson(url, { headers: pteroHeaders() });
  if (!ok) throw new Error(`Gagal ambil egg (${status})`);
  return data?.attributes?.startup || "npm start";
}

function planToLimits(amount) {
  // amount dari dropdown kamu: 20000/25000/30000/35000
  // mapping ke limits sesuai requestmu (5/8/10/unlimited)
  const a = parseInt(amount, 10);

  // Angka di Ptero biasanya MB untuk memory/disk
  if (a === 20000) return { memory: 5000, disk: 10000, cpu: 200, label: "RAM 5" };
  if (a === 25000) return { memory: 8000, disk: 12000, cpu: 250, label: "RAM 8" };
  if (a === 30000) return { memory: 10000, disk: 15000, cpu: 300, label: "RAM 10" };
  if (a === 35000) return { memory: 0, disk: 25000, cpu: 0, label: "RAM Unlimited" };

  // fallback aman
  return { memory: 5000, disk: 10000, cpu: 200, label: `AMOUNT ${a}` };
}

async function pteroCreateServer({ user_id, username, amount }) {
  const limits = planToLimits(amount);
  const startup = await pteroGetEggStartup();

  const name = `${username} Server`;
  const body = {
    name,
    description: `YNA STORE - ${new Date().toLocaleString("id-ID")}`,
    user: user_id,
    egg: PTERO_EGG,
    docker_image: "ghcr.io/parkervcp/yolks:nodejs_18", // bisa kamu ganti nanti
    startup,
    environment: {
      INST: "npm",
      USER_UPLOAD: "0",
      AUTO_UPDATE: "0",
      CMD_RUN: "npm start",
    },
    limits: {
      memory: limits.memory,
      swap: 0,
      disk: limits.disk,
      io: 500,
      cpu: limits.cpu,
    },
    feature_limits: { databases: 2, backups: 2, allocations: 1 },
    deploy: { locations: [PTERO_LOCID], dedicated_ip: false, port_range: [] },
  };

  const url = `${PTERO_DOMAIN}/api/application/servers`;
  const { ok, data, status } = await fjson(url, {
    method: "POST",
    headers: pteroHeaders(),
    body: JSON.stringify(body),
  });

  if (!ok || data?.errors) {
    const err = data?.errors?.[0] || data;
    throw new Error(`Gagal create server (${status}): ${JSON.stringify(err).slice(0, 300)}`);
  }

  return { server: data?.attributes, plan_label: limits.label };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    if (!PAKASIR_SLUG || !PAKASIR_APIKEY) {
      return json(res, 500, { error: "ENV Pakasir belum di-set (PAKASIR_SLUG/PAKASIR_APIKEY)" });
    }
    if (!PTERO_DOMAIN || !PTERO_APIKEY) {
      return json(res, 500, { error: "ENV Pterodactyl belum di-set (PTERO_DOMAIN/PTERO_APIKEY)" });
    }

    const body = req.body || {};
    const order_id = String(body.order_id || "").trim();
    const amount = parseInt(body.amount, 10);
    const wa = normWA(body.wa);
    const username = cleanUsername(body.username);
    const password = String(body.password || "").trim();

    if (!order_id) return json(res, 400, { error: "order_id wajib" });
    if (!amount) return json(res, 400, { error: "amount wajib (angka)" });
    if (!wa) return json(res, 400, { error: "wa wajib" });
    if (!validUsername(username)) return json(res, 400, { error: "username tidak valid" });
    if (!password) return json(res, 400, { error: "password wajib" });

    // 1) CEK STATUS PAKASIR
    const trx = await pakasirDetail({ order_id, amount });
    if (!trx) return json(res, 400, { error: "Transaksi tidak ditemukan di Pakasir" });

    if (trx.status !== "completed") {
      return json(res, 402, {
        error: `Pembayaran belum sukses (status: ${trx.status})`,
        status: trx.status,
      });
    }

    // 2) BUAT / PAKAI USER YANG SAMA
    let user = await pteroFindUserByUsername(username);
    if (!user) {
      user = await pteroCreateUser({ username, password });
    }

    // 3) BUAT SERVER BARU (1 user bisa banyak server)
    const { server, plan_label } = await pteroCreateServer({
      user_id: user.id,
      username,
      amount,
    });

    // 4) Balikin data (baru muncul setelah bayar sukses)
    return json(res, 200, {
      ok: true,
      order_id,
      amount,
      plan: plan_label,

      panel_url: PTERO_DOMAIN,
      username,
      password,
      user_id: user.id,

      server_id: server?.id,
      server_uuid: server?.uuid,

      buyer_group: BUYER_GROUP_LINK,
      admin_wa: ADMIN_WA,
      wa,
    });

  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
