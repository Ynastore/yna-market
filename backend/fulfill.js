const path = require("path");
const { api: pteroApi } = require("./ptero");
const { setOrder } = require("./db");
const { rnd } = require("./utils");

function panelPriceToSpec(ramPlan){
  // sesuai harga kamu
  // 5=20k, 8=25k, 10=30k, unli=35k
  const map = {
    "5": { memory: 5120, amount: 20000, label:"RAM 5GB" },
    "8": { memory: 8192, amount: 25000, label:"RAM 8GB" },
    "10": { memory: 10240, amount: 30000, label:"RAM 10GB" },
    "unlimited": { memory: 0, amount: 35000, label:"UNLIMITED" }
  };
  return map[String(ramPlan)] || null;
}

async function fulfillPanel(order, env){
  const ptero = pteroApi(env.PTERO_DOMAIN, env.PTERO_APP_KEY);

  const username = order.input.username;
  const wa = order.input.wa;

  // 1 user = 1 akun panel, pakai email unik berdasarkan WA (biar 1 user bisa banyak server)
  const email = `${wa}@ynastore.my.id`; // boleh ganti domain email, ini cuma format

  let user = await ptero.findUserByEmail(email);
  let createdPassword = null;

  if (!user){
    createdPassword = `${username}${rnd(10,99)}`;
    user = await ptero.createUser({
      email,
      username: username,
      first_name: "YNA",
      last_name: "Buyer",
      password: createdPassword
    });
  }

  const spec = panelPriceToSpec(order.panel.ram);
  if (!spec) throw new Error("RAM plan tidak valid");

  const serverName = `YNA-${username.toUpperCase()}-${spec.label}`;

  const server = await ptero.createServer({
    name: serverName,
    userId: user.id,
    egg: Number(env.PTERO_EGG_ID),
    nest: Number(env.PTERO_NEST_ID),
    location: Number(env.PTERO_LOCATION_ID),
    nodeId: Number(env.PTERO_NODE_ID),
    memory: spec.memory,
    disk: 0,
    cpu: 0
  });

  // masa aktif default: 30 hari (ubah kalau mau)
  const now = Date.now();
  const days = Number(order.panel.days || 30);
  const expires_at = new Date(now + days * 86400000).toISOString();

  const fulfilled = {
    type: "panel",
    ptero_user_id: user.id,
    ptero_server_id: server.id,
    panel_domain: env.PTERO_DOMAIN,
    email,
    username,
    password: createdPassword ? createdPassword : "(password tetap yang lama)",
    expires_at,
    buyer_group: env.BUYER_GROUP_LINK,
    admin_wa: env.ADMIN_WA
  };

  setOrder(order.order_id, { status: "fulfilled", fulfilled });
  return fulfilled;
}

function fulfillScript(order, env){
  // kasih link download cuma saat completed
  // Pastikan file zip ada di /downloads
  const map = {
    "ynaai": "sc-ynaaI.zip",
    "md": "sc-md.zip",
    "store": "sc-store.zip"
  };
  const file = map[order.script.product] || "script.zip";
  const fulfilled = {
    type:"script",
    download: `/downloads/${file}`,
    buyer_group: env.BUYER_GROUP_LINK,
    admin_wa: env.ADMIN_WA
  };
  setOrder(order.order_id, { status:"fulfilled", fulfilled });
  return fulfilled;
}

function fulfillSewa(order, env){
  // Website gabisa kirim WA otomatis tanpa bot, jadi kita buat template pesan siap kirim WA
  const adminWa = env.ADMIN_WA;
  const msg = `Halo min YNA, aku sudah bayar sewa bot.\n\n- Tipe: ${order.sewa.bot}\n- Durasi: ${order.sewa.duration}\n- Link grup: ${order.input.group_link}\n- Nomor bot: ${order.input.bot_number}\n- Order ID: ${order.order_id}\n\nTerima kasih.`;

  const fulfilled = {
    type:"sewa",
    admin_wa: adminWa,
    wa_message: msg
  };
  setOrder(order.order_id, { status:"fulfilled", fulfilled });
  return fulfilled;
}

async function fulfill(order, env){
  if (order.type === "panel") return await fulfillPanel(order, env);
  if (order.type === "script") return fulfillScript(order, env);
  if (order.type === "sewa") return fulfillSewa(order, env);
  throw new Error("Type order tidak dikenal");
}

module.exports = { fulfill, panelPriceToSpec };
