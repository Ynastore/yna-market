require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { makeOrderId, sanitizeUsername, sanitizeWA } = require("./utils");
const { setOrder, getOrder } = require("./db");
const { transactionDetail, payUrl } = require("./pakasir");
const { fulfill, panelPriceToSpec } = require("./fulfill");
const { startScheduler } = require("./scheduler");

const app = express();
app.use(cors());
app.use(express.json({ limit:"2mb" }));

const env = {
  PORT: process.env.PORT || 5050,
  SITE_ORIGIN: process.env.SITE_ORIGIN || `http://localhost:5050`,

  PAKASIR_SLUG: process.env.PAKASIR_SLUG,
  PAKASIR_API_KEY: process.env.PAKASIR_API_KEY,

  PTERO_DOMAIN: process.env.PTERO_DOMAIN,
  PTERO_APP_KEY: process.env.PTERO_APP_KEY,
  PTERO_NODE_ID: process.env.PTERO_NODE_ID || "1",
  PTERO_NEST_ID: process.env.PTERO_NEST_ID || "5",
  PTERO_EGG_ID: process.env.PTERO_EGG_ID || "15",
  PTERO_LOCATION_ID: process.env.PTERO_LOCATION_ID || "1",

  ADMIN_WA: process.env.ADMIN_WA || "6283173403262",
  BUYER_GROUP_LINK: process.env.BUYER_GROUP_LINK || ""
};

// serve static site
app.use("/", express.static(path.join(__dirname, "..")));
app.use("/downloads", express.static(path.join(__dirname, "..", "downloads")));

// ===== Create Order (frontend -> backend) =====
app.post("/api/order/create", async (req, res) => {
  try{
    const body = req.body || {};
    const type = body.type; // panel|script|sewa

    const wa = sanitizeWA(body.wa);
    const username = sanitizeUsername(body.username);

    if (!type) return res.status(400).json({ error:"type wajib" });
    if (!wa) return res.status(400).json({ error:"wa wajib" });

    const order_id = makeOrderId("YNA");

    let amount = 0;
    let extra = {};

    if (type === "panel"){
      const ram = String(body.ram||"");
      const spec = panelPriceToSpec(ram);
      if (!spec) return res.status(400).json({ error:"RAM tidak valid" });
      amount = spec.amount;

      extra.panel = { ram, days: Number(body.days || 30) };
      extra.input = { wa, username };
    }

    if (type === "script"){
      // product: store|md|ynaai
      const product = String(body.product||"").toLowerCase();
      const priceMap = { store:120000, md:150000, ynaai:180000 };
      if (!priceMap[product]) return res.status(400).json({ error:"Produk script tidak valid" });
      amount = priceMap[product];
      extra.script = { product };
      extra.input = { wa, username: username || "buyer" };
    }

    if (type === "sewa"){
      // bot: store|md|ynaai ; duration: 1bulan/2bulan/...
      const bot = String(body.bot||"").toLowerCase();
      const duration = String(body.duration||"");
      const priceTable = {
        store: { "1":12000, "2":20000, "3":35000, "5":50000, "12":85000, "p":150000 },
        md:    { "1":15000, "2":25000, "3":40000, "5":60000, "12":100000, "p":200000 },
        ynaai: { "1":15000, "2":25000, "3":40000, "5":60000, "12":100000, "p":220000 }
      };
      const key = duration; // contoh: "1" "2" "3" "5" "12" "p"
      const price = priceTable[bot]?.[key];
      if (!price) return res.status(400).json({ error:"Bot/durasi tidak valid" });
      amount = price;

      const group_link = String(body.group_link||"");
      const bot_number = String(body.bot_number||"");
      if (!group_link) return res.status(400).json({ error:"link grup wajib" });
      if (!bot_number) return res.status(400).json({ error:"nomor bot wajib" });

      extra.sewa = { bot, duration };
      extra.input = { wa, group_link, bot_number, username: username || "buyer" };
    }

    // simpan order pending
    setOrder(order_id, {
      order_id,
      type,
      amount,
      status: "pending_payment",
      created_at: new Date().toISOString(),
      ...extra
    });

    // Pakasir via URL (redirect balik ke invoice.html)
    const redirect = `${env.SITE_ORIGIN}/invoice.html?order_id=${encodeURIComponent(order_id)}&amount=${amount}`;
    const pay_url = payUrl({ slug: env.PAKASIR_SLUG, amount, order_id, redirect, qris_only: 1 });

    res.json({ order_id, amount, pay_url });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

// ===== Check status (frontend invoice page) =====
app.get("/api/order/check", async (req, res) => {
  try{
    const order_id = String(req.query.order_id||"");
    const amount = Number(req.query.amount||0);

    if (!order_id || !amount) return res.status(400).json({ error:"order_id & amount wajib" });

    const order = getOrder(order_id);
    if (!order) return res.status(404).json({ error:"Order tidak ditemukan" });

    // validasi ke Pakasir
    const detail = await transactionDetail({
      project: env.PAKASIR_SLUG,
      order_id,
      amount,
      api_key: env.PAKASIR_API_KEY
    });

    const status = detail?.transaction?.status || "unknown";

    // update status di db
    setOrder(order_id, { payment: detail.transaction, payment_checked_at: new Date().toISOString() });

    // kalau completed dan belum fulfill → fulfill
    const latest = getOrder(order_id);
    if (status === "completed" && latest.status !== "fulfilled"){
      setOrder(order_id, { status:"paid" });
      const fulfilled = await fulfill(getOrder(order_id), env);
      return res.json({ status:"completed", order: getOrder(order_id), fulfilled });
    }

    // kalau masih pending
    return res.json({ status, order: latest });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

// ===== Webhook Pakasir (opsional tapi disarankan) =====
app.post("/webhook/pakasir", async (req, res) => {
  try{
    const body = req.body || {};
    const { order_id, amount, project, status } = body;

    if (!order_id || !amount || !project) return res.status(400).send("bad payload");

    // anti spoof: cek lagi via transactionDetail
    const detail = await transactionDetail({
      project: env.PAKASIR_SLUG,
      order_id,
      amount,
      api_key: env.PAKASIR_API_KEY
    });

    const realStatus = detail?.transaction?.status;
    setOrder(order_id, { payment: detail.transaction, payment_checked_at: new Date().toISOString() });

    if (realStatus === "completed"){
      const latest = getOrder(order_id);
      if (latest && latest.status !== "fulfilled"){
        setOrder(order_id, { status:"paid" });
        await fulfill(getOrder(order_id), env);
      }
    }

    res.send("ok");
  }catch(e){
    console.error("[webhook]", e.message);
    res.status(500).send("err");
  }
});

startScheduler(env);

app.listen(env.PORT, () => {
  console.log(`YNA STORE backend running : http://localhost:${env.PORT}`);
});
