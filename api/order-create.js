import fetch from "node-fetch";
import { kv } from "@vercel/kv";

const PRICE = {
  panel: { "5": 20000, "8": 25000, "10": 30000, "unlimited": 35000 },
  script: { sc_store: 120000, sc_md: 150000, sc_yna_ai: 180000 },
  sewa: {
    bot_store: { "1": 12000, "2": 20000, "3": 35000, "5": 50000, "12": 85000, perm: 150000 },
    bot_md:    { "1": 15000, "2": 25000, "3": 40000, "5": 60000, "12": 100000, perm: 200000 },
    bot_ai:    { "1": 15000, "2": 25000, "3": 40000, "5": 60000, "12": 100000, perm: 220000 },
  }
};

function newOrderId(prefix="YNA") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
}

async function createQRIS(order_id, amount) {
  const r = await fetch("https://app.pakasir.com/api/transactioncreate/qris", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      project: process.env.PAKASIR_SLUG,
      order_id,
      amount: Number(amount),
      api_key: process.env.PAKASIR_APIKEY
    })
  });
  const j = await r.json();
  if (!j?.payment?.payment_number) throw new Error("Pakasir create qris gagal");
  return {
    qr_string: j.payment.payment_number,
    total_payment: j.payment.total_payment,
    expired_at: j.payment.expired_at
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const type = body.type; // panel | script | sewa
  const wa = String(body.wa || "").trim();
  if (!type || !wa) return res.status(400).json({ error: "type & wa wajib" });

  let amount = 0;

  if (type === "panel") {
    const plan = body.plan; // 5|8|10|unlimited
    if (!PRICE.panel[plan]) return res.status(400).json({ error: "plan panel invalid" });
    amount = PRICE.panel[plan];
  }

  if (type === "script") {
    const sku = body.sku; // sc_store|sc_md|sc_yna_ai
    if (!PRICE.script[sku]) return res.status(400).json({ error: "sku script invalid" });
    amount = PRICE.script[sku];
  }

  if (type === "sewa") {
    const bot = body.bot;     // bot_store|bot_md|bot_ai
    const dur = String(body.dur); // "1","2","3","5","12","perm"
    if (!PRICE.sewa?.[bot]?.[dur]) return res.status(400).json({ error: "paket sewa invalid" });
    amount = PRICE.sewa[bot][dur];
  }

  const order_id = newOrderId(type.toUpperCase());
  const order = {
    order_id,
    type,
    wa,
    payload: body,
    amount,
    status: "pending",
    created_at: Date.now()
  };

  await kv.set(`order:${order_id}`, order);

  const pay = await createQRIS(order_id, amount);
  await kv.set(`pay:${order_id}`, pay);

  res.json({ ok: true, order_id, amount, ...pay });
    }
